// src/diagram-realtime/diagram.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import type { Server, Namespace, Socket } from 'socket.io';
import { Inject } from '@nestjs/common';
import { ShareService } from '../share/share.service';
import { PrismaService } from '../common/prisma.service';
import { RealtimeService } from './realtime.service';
import { JwtService } from '@nestjs/jwt';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';

import type {
  Patch,
  JoinPayload,
  RequestEditPayload,
  ApproveEditPayload,
  YSyncPullPayload,
  YSyncPushPayload,
  AwarenessUpdatePayload,
  PresenceHeartbeatPayload,
  PresenceJoinAck,
} from './dto/events';
import { toBase64, fromBase64 } from 'lib0/buffer';

type Snapshot = { nodes: any[]; edges: any[] };

@WebSocketGateway({
  namespace: '/diagram',
  path: '/socket.io',
  cors: {
    // En dev, más permisivo para evitar "origin mismatch" al hacer upgrade:
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost',
      'http://127.0.0.1',
    ],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class DiagramGateway implements OnGatewayInit {
  @WebSocketServer() server!: Namespace;

  constructor(
    @Inject('REDIS_PUB') private pub: Redis,
    @Inject('REDIS_SUB') private sub: Redis,
    private share: ShareService,
    private prisma: PrismaService,
    private realtime: RealtimeService,
    private jwt: JwtService,
  ) {}

  afterInit(server: Server | Namespace) {
    const io: any = (server as any).server ?? (server as any);
    const waitReady = (r: any) =>
      r.status === 'ready'
        ? Promise.resolve()
        : new Promise<void>((res) => r.once('ready', () => res()));
    Promise.all([waitReady(this.pub), waitReady(this.sub)]).then(() => {
      io.adapter(createAdapter(this.pub, this.sub));
      console.log('[Socket.IO] Redis adapter attached');
    });
  }

  private async parseUserIdFromToken(token?: string): Promise<string | null> {
    if (!token) return null;
    try {
      const payload: any = this.jwt.verify(token);
      return payload?.id || payload?.sub || null;
    } catch {
      return null;
    }
  }

  /** Carga el snapshot persistido y lo inyecta en la sala si está vacío */
  private async hydrateRoomSnapshotFromDB(projectId: string) {
    const room = await this.realtime.ensureRoom(projectId);
    const current: Snapshot | undefined = (room as any)?.snapshot;

    const isEmpty =
      !current ||
      !Array.isArray((current as any).nodes) ||
      !Array.isArray((current as any).edges) ||
      ((current as any).nodes.length === 0 &&
        (current as any).edges.length === 0);

    if (isEmpty) {
      const diagram = await this.prisma.diagram.findUnique({
        where: { projectId },
        select: { snapshot: true },
      });
      const persisted: Snapshot = (diagram?.snapshot as Snapshot) ?? {
        nodes: [],
        edges: [],
      };

      (room as any).snapshot = persisted; // ← esto es suficiente
      console.log('[hydrate] room snapshot hydrated from DB for', projectId);
      return persisted;
    }

    return current!;
  }

  // ===== JOIN a sala por proyecto =====
  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() data: JoinPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { projectId, shareToken, authToken } = data;

    // 1) Asegurar sala y snapshot desde BD si está vacío
    await this.realtime.ensureRoom(projectId);
    const hydrated = await this.hydrateRoomSnapshotFromDB(projectId);

    // 2) Resolver identidad y rol
    const userId = await this.parseUserIdFromToken(authToken);
    let role: 'VIEWER' | 'EDITOR' | 'OWNER' = 'VIEWER';
    let displayName = 'Invitado';

    if (userId) {
      const p = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: {
          ownerId: true,
          members: { where: { userId }, select: { role: true }, take: 1 },
        },
      });
      if (p?.ownerId === userId) role = 'OWNER';
      else if (p?.members?.length) role = 'EDITOR';

      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });
      displayName = u?.name || u?.email || 'Usuario';
    } else if (shareToken) {
      const r = await this.share.validateShareToken(projectId, shareToken);
      if (!r) {
        client.emit('joinDenied', { reason: 'invalid_share_link' });
        return;
      }
      role = 'VIEWER';
      displayName = 'Invitado';
    } else {
      client.emit('joinDenied', { reason: 'unauthorized' });
      return;
    }

    // 3) Join + estado del cliente
    client.join(projectId);
    (client.data as any) = {
      ...(client.data as any),
      projectId,
      userId,
      role,
    };

    // 4) Presencia
    const st = this.realtime.upsertPresence(
      projectId,
      client.id,
      userId,
      displayName,
      role,
    )!;
    const roster = this.realtime.getRoster(projectId);
    const ack: PresenceJoinAck = { roster };

    // 5) Enviar snapshot hidratado
    client.emit('joined', { snapshot: hydrated, role });

    client.emit('presence:roster', ack);

    // 6) Y.js (si lo usas). Si tienes un estado inicial, emítelo
    const sync = this.realtime.getSyncUpdate(projectId);
    if (sync) client.emit('y:sync', { updateBase64: toBase64(sync) });

    // 7) Notificar a la sala
    this.server.to(projectId).emit('presence:joined', st);
  }

  // ===== (Opcional) el Dashboard puede llamar esto tras conectar =====
  @SubscribeMessage('joinOwner')
  async handleJoinOwner(
    @MessageBody() data: { authToken?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.parseUserIdFromToken(data?.authToken);
    if (!userId) return;
    client.join(`user:${userId}`);
    (client.data as any) = { ...(client.data as any), userId };
    console.log('[joinOwner] socket', client.id, 'userId', userId);
  }

  // ===== Heartbeat de presencia =====
  @SubscribeMessage('presence:heartbeat')
  async heartbeat(
    @MessageBody() data: PresenceHeartbeatPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { projectId } = data;
    if ((client.data as any)?.projectId !== projectId) return;
    const st = this.realtime.touchPresence(projectId, client.id);
    if (!st) return;
    client.emit('presence:pong', { ts: Date.now() });
  }

  // ===== Parches “legacy” JSON =====
  @SubscribeMessage('patch')
  async handlePatch(
    @MessageBody() data: { projectId: string; patch: Patch },
    @ConnectedSocket() client: Socket,
  ) {
    const { projectId, patch } = data;
    if ((client.data as any)?.projectId !== projectId) return;
    const role = (client.data as any)?.role;
    if (role !== 'EDITOR' && role !== 'OWNER') {
      client.emit('editDenied', {
        reason: (client.data as any)?.userId
          ? 'no_permission'
          : 'login_required',
      });
      return;
    }
    client.to(projectId).emit('remotePatch', patch);
  }

  // ===== Solicitar acceso de edición =====
  @SubscribeMessage('requestEdit')
  async requestEdit(
    @MessageBody() data: RequestEditPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { projectId, message } = data;
    const userId = (client.data as any)?.userId;
    if (!userId) {
      client.emit('editDenied', { reason: 'login_required' });
      return;
    }
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (member) {
      client.emit('editGranted', { role: member.role });
      (client.data as any).role = 'EDITOR';
      return;
    }

    const req = await this.prisma.editRequest.upsert({
      where: { projectId_requesterId: { projectId, requesterId: userId } },
      update: { status: 'PENDING', message: message ?? null },
      create: { projectId, requesterId: userId, message: message ?? null },
    });

    const owner = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (owner?.ownerId) {
      this.server.to(`user:${owner.ownerId}`).emit('editRequest', {
        projectId,
        requesterId: userId,
        requestId: req.id,
        message: req.message,
      });
    }
    client.emit('requestQueued');
  }

  // ===== Owner aprueba edición =====
  @SubscribeMessage('approveEdit')
  async approve(
    @MessageBody() data: ApproveEditPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { projectId, userId, role = 'EDITOR' } = data;

    const me = (client.data as any)?.userId;
    console.log(
      '[approveEdit] by',
      me,
      'for user',
      userId,
      'project',
      projectId,
    );
    if (!me) {
      console.warn('[approveEdit] rejected: missing client.data.userId');
      return;
    }

    const p = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!p || p.ownerId !== me) {
      console.warn('[approveEdit] rejected: not owner or project missing');
      return;
    }

    await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      update: { role: role === 'EDITOR' ? 'EDITOR' : 'VIEWER' },
      create: {
        projectId,
        userId,
        role: role === 'EDITOR' ? 'EDITOR' : 'VIEWER',
      },
    });

    const pending = await this.prisma.editRequest.findMany({
      where: { projectId, requesterId: userId, status: 'PENDING' },
      select: { id: true },
    });

    await this.prisma.editRequest.updateMany({
      where: { projectId, requesterId: userId, status: 'PENDING' },
      data: { status: 'APPROVED' },
    });

    console.log(
      '[approveEdit] emitting memberUpdated to room',
      projectId,
      'for user',
      userId,
    );

    this.server.to(projectId).emit('memberUpdated', {
      projectId,
      userId,
      role: role === 'EDITOR' ? 'EDITOR' : 'VIEWER',
      requestIds: pending.map((r) => r.id),
    } as {
      projectId: string;
      userId: string;
      role: 'EDITOR' | 'VIEWER';
      requestIds: string[];
    });
  }

  // ===== Y.js sync =====
  @SubscribeMessage('y:sync:pull')
  async ySyncPull(
    @MessageBody() data: YSyncPullPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { projectId } = data;
    if ((client.data as any)?.projectId !== projectId) return;
    const sync = this.realtime.getSyncUpdate(projectId);
    if (sync) client.emit('y:sync', { updateBase64: toBase64(sync) });
  }

  @SubscribeMessage('y:sync:push')
  async ySyncPush(
    @MessageBody() data: YSyncPushPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { projectId, updateBase64 } = data;
    if ((client.data as any)?.projectId !== projectId) return;
    const role = (client.data as any)?.role;
    if (role !== 'EDITOR' && role !== 'OWNER') {
      client.emit('editDenied', {
        reason: (client.data as any)?.userId
          ? 'no_permission'
          : 'login_required',
      });
      return;
    }
    const update = fromBase64(updateBase64);
    this.realtime.applyRemoteUpdate(projectId, update);
    client.to(projectId).emit('y:update', { updateBase64 });
  }

  // ===== Awareness =====
  @SubscribeMessage('awareness:update')
  async awarenessUpdate(
    @MessageBody() data: AwarenessUpdatePayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { projectId, states } = data;
    if ((client.data as any)?.projectId !== projectId) return;
    client.to(projectId).emit('awareness:remote', { states, from: client.id });
  }

  // ===== Registro sockets por usuario =====
  handleConnection(client: Socket) {
    const authToken =
      (client.handshake.auth?.token as string | undefined) ||
      (client.handshake.headers['x-auth-token'] as string | undefined) ||
      (() => {
        const auth = client.handshake.headers['authorization'];
        if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
          return auth.slice(7);
        }
        return undefined;
      })();

    this.parseUserIdFromToken(authToken).then((userId) => {
      if (userId) {
        client.join(`user:${userId}`);
        (client.data as any) = { ...(client.data as any), userId };
        console.log('[handleConnection] socket', client.id, 'userId', userId);
      }
    });
  }

  handleDisconnect(client: Socket) {
    const projectId = (client.data as any)?.projectId;
    if (projectId) {
      const st = this.realtime.removePresence(projectId, client.id);
      if (st) this.server.to(projectId).emit('presence:left', st);
    }
  }
}
