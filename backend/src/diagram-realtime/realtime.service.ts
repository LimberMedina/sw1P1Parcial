import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import * as Y from 'yjs';
import { encodeStateAsUpdate, applyUpdate } from 'yjs';
import { toBase64, fromBase64 } from 'lib0/buffer';
import debounce from 'lodash.debounce';
import type { PresenceState } from './dto/events';
import type { Redis } from 'ioredis';
import { randomUUID } from 'crypto';

// Snapshot “visible” + estado Y compactado en $y (base64)
export type DiagramSnapshot = {
  nodes: any[];
  edges: any[];
  updatedAt: string; // ISO
  $y?: string; // base64 del update completo de Y.Doc
};

const EMPTY_SNAPSHOT: DiagramSnapshot = {
  nodes: [],
  edges: [],
  updatedAt: new Date().toISOString(),
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function coerceSnapshot(obj: Record<string, unknown>): DiagramSnapshot {
  const nodes = Array.isArray((obj as any).nodes) ? (obj as any).nodes : [];
  const edges = Array.isArray((obj as any).edges) ? (obj as any).edges : [];
  const updatedAt =
    typeof (obj as any).updatedAt === 'string' && (obj as any).updatedAt
      ? (obj as any).updatedAt
      : new Date().toISOString();
  const $y =
    typeof (obj as any).$y === 'string' && (obj as any).$y
      ? (obj as any).$y
      : undefined;
  return { nodes, edges, updatedAt, $y };
}
function toSnapshot(
  value: Prisma.JsonValue | null | undefined,
): DiagramSnapshot {
  if (value == null) return { ...EMPTY_SNAPSHOT };
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (isRecord(parsed)) return coerceSnapshot(parsed);
    } catch {}
    return { ...EMPTY_SNAPSHOT };
  }
  if (isRecord(value)) return coerceSnapshot(value);
  return { ...EMPTY_SNAPSHOT };
}

type RoomState = {
  ydoc: Y.Doc;
  snapshot: DiagramSnapshot;
  debouncedSave: () => void;

  // Presencia
  presenceBySocket: Map<string, PresenceState>;
  presenceByUser: Map<string, PresenceState[]>;
};

const COLORS = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#7f7f7f',
  '#bcbd22',
  '#17becf',
];

@Injectable()
export class RealtimeService implements OnModuleInit {
  private rooms = new Map<string, RoomState>();
  private presenceTimeoutMs = 45_000;
  private instanceId = randomUUID(); // para evitar bucles de pub/sub

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS_PUB') private pub: Redis,
    @Inject('REDIS_SUB') private sub: Redis,
  ) {}

  async onModuleInit() {
    // Subscribir a los canales globales
    await this.sub.subscribe('diagram:yupdate', 'diagram:presence');
    this.sub.on('message', (channel: string, message: string) => {
      try {
        const payload = JSON.parse(message);
        if (payload.sourceId === this.instanceId) return; // ignora lo propio

        if (channel === 'diagram:yupdate') {
          const { projectId, updateBase64 } = payload;
          const update = fromBase64(updateBase64);
          // Asegura room y aplica
          this.ensureRoom(projectId).then(() => {
            applyUpdate(this.rooms.get(projectId)!.ydoc, update);
            this.rooms.get(projectId)!.debouncedSave();
          });
        } else if (channel === 'diagram:presence') {
          const {
            type,
            projectId,
            socketId,
            userId,
            name,
            role,
            color,
            lastSeen,
          } = payload;
          if (!this.rooms.has(projectId)) return;
          const room = this.rooms.get(projectId)!;
          if (type === 'leave') {
            // limpieza silenciosa entre nodos
            const st = room.presenceBySocket.get(socketId);
            if (st) {
              room.presenceBySocket.delete(socketId);
              if (st.userId) {
                const arr = room.presenceByUser.get(st.userId) ?? [];
                const filtered = arr.filter((p) => p.socketId !== socketId);
                if (filtered.length)
                  room.presenceByUser.set(st.userId, filtered);
                else room.presenceByUser.delete(st.userId);
              }
            }
          } else if (type === 'heartbeat' || type === 'join') {
            room.presenceBySocket.set(socketId, {
              socketId,
              userId,
              name,
              role,
              color,
              lastSeen,
            });
            if (userId) {
              const arr = room.presenceByUser.get(userId) ?? [];
              const idx = arr.findIndex((p) => p.socketId === socketId);
              if (idx >= 0)
                arr[idx] = { socketId, userId, name, role, color, lastSeen };
              else arr.push({ socketId, userId, name, role, color, lastSeen });
              room.presenceByUser.set(userId, arr);
            }
          }
        }
      } catch {}
    });

    // GC de presencia
    setInterval(() => this.gcPresence(), 15_000);
  }

  private createDocFromSnapshot(snap: DiagramSnapshot): Y.Doc {
    const doc = new Y.Doc();
    if (snap.$y) {
      try {
        applyUpdate(doc, fromBase64(snap.$y));
        return doc;
      } catch {}
    }
    const yRoot = doc.getMap('root') as Y.Map<any>;
    const yNodes = new Y.Array<any>();
    if (Array.isArray(snap.nodes) && snap.nodes.length)
      yNodes.push(snap.nodes as any[]);
    const yEdges = new Y.Array<any>();
    if (Array.isArray(snap.edges) && snap.edges.length)
      yEdges.push(snap.edges as any[]);
    yRoot.set('nodes', yNodes);
    yRoot.set('edges', yEdges);
    return doc;
  }

  private snapshotFromDoc(doc: Y.Doc, prev: DiagramSnapshot): DiagramSnapshot {
    const yRoot = doc.getMap('root');
    const nodes =
      (yRoot.get('nodes') as Y.Array<any>)?.toArray?.() ?? prev.nodes ?? [];
    const edges =
      (yRoot.get('edges') as Y.Array<any>)?.toArray?.() ?? prev.edges ?? [];
    const fullUpdate = encodeStateAsUpdate(doc);
    const base64 = toBase64(fullUpdate);
    return { nodes, edges, updatedAt: new Date().toISOString(), $y: base64 };
  }

  async loadInitial(projectId: string): Promise<DiagramSnapshot> {
    const diagram = await this.prisma.diagram.findUnique({
      where: { projectId },
      select: { snapshot: true },
    });
    if (!diagram) {
      const fresh = { ...EMPTY_SNAPSHOT };
      await this.prisma.diagram.create({
        data: {
          projectId,
          snapshot: fresh as unknown as Prisma.InputJsonValue,
        },
      });
      return fresh;
    }
    return toSnapshot(diagram.snapshot);
  }

  getRoom(projectId: string) {
    return this.rooms.get(projectId);
  }

  async ensureRoom(projectId: string) {
    if (this.rooms.has(projectId)) return this.rooms.get(projectId)!;
    const snapshot = await this.loadInitial(projectId);
    const ydoc = this.createDocFromSnapshot(snapshot);
    const debouncedSave = debounce(async () => {
      const room = this.rooms.get(projectId);
      if (!room) return;
      const toSave = this.snapshotFromDoc(room.ydoc, room.snapshot);
      await this.prisma.diagram.update({
        where: { projectId },
        data: { snapshot: toSave as unknown as Prisma.InputJsonValue },
      });
      room.snapshot = toSave;
    }, 700);
    const state: RoomState = {
      ydoc,
      snapshot,
      debouncedSave,
      presenceBySocket: new Map(),
      presenceByUser: new Map(),
    };
    this.rooms.set(projectId, state);
    return state;
  }

  // --- API Y.js ---
  getSyncUpdate(projectId: string): Uint8Array | null {
    const room = this.rooms.get(projectId);
    if (!room) return null;
    return encodeStateAsUpdate(room.ydoc);
  }

  applyRemoteUpdate(projectId: string, update: Uint8Array) {
    const room = this.rooms.get(projectId);
    if (!room) return;
    applyUpdate(room.ydoc, update);
    room.debouncedSave();
    // publica para otras instancias
    const msg = JSON.stringify({
      sourceId: this.instanceId,
      projectId,
      updateBase64: toBase64(update),
    });
    this.pub.publish('diagram:yupdate', msg);
  }

  // --- Presencia ---
  private pickColor(room: RoomState, userId: string | null): string {
    if (userId) {
      const existing = room.presenceByUser.get(userId)?.[0];
      if (existing) return existing.color;
    }
    const used = new Set(
      [...room.presenceBySocket.values()].map((p) => p.color),
    );
    return (
      COLORS.find((c) => !used.has(c)) ?? COLORS[used.size % COLORS.length]
    );
  }

  upsertPresence(
    projectId: string,
    socketId: string,
    userId: string | null,
    name: string,
    role: PresenceState['role'],
  ): PresenceState | null {
    const room = this.rooms.get(projectId);
    if (!room) return null;
    const now = Date.now();
    const existing = room.presenceBySocket.get(socketId);
    const color = existing?.color ?? this.pickColor(room, userId);
    const state: PresenceState = {
      socketId,
      userId,
      name,
      role,
      color,
      lastSeen: now,
    };
    room.presenceBySocket.set(socketId, state);
    if (userId) {
      const arr = room.presenceByUser.get(userId) ?? [];
      const idx = arr.findIndex((p) => p.socketId === socketId);
      if (idx >= 0) arr[idx] = state;
      else arr.push(state);
      room.presenceByUser.set(userId, arr);
    }
    // publica join
    this.pub.publish(
      'diagram:presence',
      JSON.stringify({
        sourceId: this.instanceId,
        type: 'join',
        projectId,
        ...state,
      }),
    );
    return state;
  }

  touchPresence(projectId: string, socketId: string): PresenceState | null {
    const room = this.rooms.get(projectId);
    if (!room) return null;
    const st = room.presenceBySocket.get(socketId);
    if (!st) return null;
    st.lastSeen = Date.now();
    // publica heartbeat
    this.pub.publish(
      'diagram:presence',
      JSON.stringify({
        sourceId: this.instanceId,
        type: 'heartbeat',
        projectId,
        ...st,
      }),
    );
    return st;
  }

  removePresence(projectId: string, socketId: string): PresenceState | null {
    const room = this.rooms.get(projectId);
    if (!room) return null;
    const st = room.presenceBySocket.get(socketId);
    if (!st) return null;
    room.presenceBySocket.delete(socketId);
    if (st.userId) {
      const arr = room.presenceByUser.get(st.userId) ?? [];
      const filtered = arr.filter((p) => p.socketId !== socketId);
      if (filtered.length) room.presenceByUser.set(st.userId, filtered);
      else room.presenceByUser.delete(st.userId);
    }
    // publica leave
    this.pub.publish(
      'diagram:presence',
      JSON.stringify({
        sourceId: this.instanceId,
        type: 'leave',
        projectId,
        ...st,
      }),
    );
    return st;
  }

  getRoster(projectId: string): PresenceState[] {
    const room = this.rooms.get(projectId);
    if (!room) return [];
    return [...room.presenceBySocket.values()];
  }

  private gcPresence() {
    const now = Date.now();
    for (const [projectId, room] of this.rooms) {
      for (const [socketId, p] of room.presenceBySocket) {
        if (now - p.lastSeen > this.presenceTimeoutMs) {
          room.presenceBySocket.delete(socketId);
          if (p.userId) {
            const arr = room.presenceByUser.get(p.userId) ?? [];
            const filtered = arr.filter((s) => s.socketId !== socketId);
            if (filtered.length) room.presenceByUser.set(p.userId, filtered);
            else room.presenceByUser.delete(p.userId);
          }
          // publica expiración como leave
          this.pub.publish(
            'diagram:presence',
            JSON.stringify({
              sourceId: this.instanceId,
              type: 'leave',
              projectId,
              ...p,
            }),
          );
        }
      }
    }
  }
}
