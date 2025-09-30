// src/editor/colaboracion.ts
// Sincronización colaborativa: Socket.IO + Yjs, awareness y snapshot con autosave persistente y persistencia adaptable
import { io, Socket } from "socket.io-client";
import * as Y from "yjs";
import { fromBase64, toBase64 } from "lib0/buffer";
import type { Graph } from "@antv/x6";
import { throttle } from "./ayudas";
import type { UiRole } from "./ayudas";
import { applyEdgeLabels, reassignEdgePorts, resizeUmlClass } from "./grafo";
import { fromSnapshot, toSnapshot } from "../uml/snapshot";
import { api } from "../lib/api";

export type RealtimeHandles = {
  socketRef: { current: Socket | null };
  ydocRef: { current: Y.Doc | null };
  lastAppliedVersionRef: { current: number };
  lastEmittedVersionRef: { current: number };
  tryRenderFromYDoc: () => void;
  pushSnapshotToYDoc: () => void;
  cleanup: () => void;
};

type Params = {
  pid: string;
  token?: string | null;
  shareToken?: string | null;
  userId?: string | null;
  userName?: string | null;
  graphRef: { current: Graph | null };
  setAwarenessStates: (s: Record<string, any>) => void;
  onPromoteRole?: (r: UiRole) => void;
  onMemberEvent?: (event: string, payload: any) => void;
  onRequestQueued?: () => void;
};

// Helper de extracción tolerante
function extractSnapshotPayload(data: any) {
  if (data?.snapshot?.nodes && data?.snapshot?.edges) return data.snapshot;
  if (data?.nodes && data?.edges)
    return { nodes: data.nodes, edges: data.edges };
  if (data?.diagram?.nodes && data?.diagram?.edges)
    return { nodes: data.diagram.nodes, edges: data.diagram.edges };
  return { nodes: [], edges: [] };
}

export function configurarColaboracion(params: Params): RealtimeHandles {
  const {
    pid,
    token,
    shareToken,
    graphRef,
    setAwarenessStates,
    onPromoteRole,
    onMemberEvent,
    onRequestQueued,
  } = params;

  const socketRef = { current: null as Socket | null };
  const ydocRef = { current: null as Y.Doc | null };
  const lastAppliedVersionRef = { current: 0 };
  const lastEmittedVersionRef = { current: 0 };

  // Solo clientes autenticados persisten en backend
  const canPersistRef = { current: !!token };

  // ===================== Socket base =====================
  const envSocketUrl =
    (import.meta as any).env?.VITE_SOCKET_URL ??
    (import.meta as any).env?.VITE_API_URL ??
    "";

  const isDev = !!(import.meta as any).env?.DEV;

  // En dev: usar SIEMPRE el origen del navegador para proxy Vite
  let socketBase = isDev
    ? window.location.origin
    : envSocketUrl || window.location.origin;
  socketBase = socketBase.replace(/\/api\/?$/, "").replace(/\/$/, "");

  const socketPath = (import.meta as any).env?.VITE_SOCKET_PATH ?? "/socket.io";

  const s = io(`${socketBase}/diagram`, {
    path: socketPath,
    transports: ["polling", "websocket"], // robustez
    withCredentials: true,
    auth: token
      ? {
          token,
          share: shareToken ?? undefined,
          shareToken: shareToken ?? undefined,
        }
      : { share: shareToken ?? undefined, shareToken: shareToken ?? undefined },
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 600,
    timeout: 12000,
  });
  socketRef.current = s;

  // ===================== Y.Doc =====================
  const ydoc = new Y.Doc();
  ydocRef.current = ydoc;

  // Anti-pisado tras publicar local
  let suppressRemoteUntil = 0;

  // Timers
  let bootstrapTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelBootstrapTimer = () => {
    if (bootstrapTimer) clearTimeout(bootstrapTimer);
    bootstrapTimer = null;
  };

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const PERSIST_DEBOUNCE_MS = 900;

  // ===================== Persistencia adaptable =====================
  function getSnapshotFromYDocOrGraph(): { nodes: any[]; edges: any[] } {
    try {
      if (ydocRef.current) {
        const map = ydocRef.current.getMap<any>("diagram");
        const b64 = map.get("snapshotBase64");
        if (typeof b64 === "string" && b64.length) {
          const json = atob(b64);
          const parsed = JSON.parse(json);
          if (parsed && parsed.nodes && parsed.edges) {
            return { nodes: parsed.nodes, edges: parsed.edges };
          }
        }
        const raw = map.get("snapshot");
        if (raw && typeof raw === "object" && (raw.nodes || raw.edges)) {
          return { nodes: raw.nodes || [], edges: raw.edges || [] };
        }
      }
    } catch {}
    if (graphRef.current) {
      const snap = toSnapshot(graphRef.current);
      return { nodes: snap.nodes, edges: snap.edges };
    }
    return { nodes: [], edges: [] };
  }

  async function persistSnapshotAdaptive(projectId: string) {
    if (!canPersistRef.current) return;

    const snap = getSnapshotFromYDocOrGraph();

    // Intento A: backend que espera { snapshot: { nodes, edges }, updatedAt }
    try {
      await api.put(`/projects/${projectId}/diagram`, {
        snapshot: { nodes: snap.nodes, edges: snap.edges },
        updatedAt: new Date().toISOString(),
      });
      return; // éxito
    } catch (e: any) {
      const status = e?.response?.status;
      // Si el backend no acepta este shape, probamos el alternativo
      if (status !== 400 && status !== 422) {
        // Otros errores (network, 500, etc.): no reintentar con forma B
        return;
      }
    }

    // Intento B: backend que espera { nodes, edges, updatedAt }
    try {
      await api.put(`/projects/${projectId}/diagram`, {
        nodes: snap.nodes,
        edges: snap.edges,
        updatedAt: new Date().toISOString(),
      });
      return;
    } catch {
      // Silenciar: si falla también, dejamos que el próximo cambio reintente.
    }
  }

  function schedulePersist() {
    if (!canPersistRef.current) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistSnapshotAdaptive(pid);
    }, PERSIST_DEBOUNCE_MS);
  }

  // ===================== Dibujo =====================
  function drawSnapshot(graph: Graph, payload: any) {
    graph.batchUpdate(() => {
      fromSnapshot(graph, payload ?? { nodes: [], edges: [] });
      graph.getNodes().forEach((n: any) => {
        if (n.shape === "uml-class") resizeUmlClass(n);
      });
      graph.getEdges().forEach((e: any) => {
        e.setZIndex(1000);
        e.toFront();
        e.setRouter({ name: "orth", args: { padding: 6 } });
        e.setConnector({ name: "rounded" });
        applyEdgeLabels(e);
        reassignEdgePorts(e, graph);
      });
    });
  }

  // Sembrar Yjs desde snapshot
  function seedYFromSnapshot(snapshot: any) {
    if (!ydocRef.current) return;
    const json = JSON.stringify({
      nodes: snapshot?.nodes || [],
      edges: snapshot?.edges || [],
    });
    const b64 = btoa(json);
    const version = Date.now();
    const map = ydocRef.current.getMap<any>("diagram");
    Y.transact(ydocRef.current, () => {
      map.set("snapshotBase64", b64);
      map.set("version", version);
    });
    lastEmittedVersionRef.current = version;
    suppressRemoteUntil = Date.now() + 600;
  }

  function tryRenderFromYDoc() {
    const graph = graphRef.current;
    if (!ydocRef.current || !graph) return;
    if (Date.now() < suppressRemoteUntil) return;

    let payload: any = null;
    let version: number | undefined;

    try {
      const map = ydocRef.current.getMap<any>("diagram");
      if (map) {
        version = map.get("version");
        const b64 = map.get("snapshotBase64");
        if (typeof b64 === "string" && b64.length) {
          const json = atob(b64);
          payload = JSON.parse(json);
        } else {
          const snap = map.get("snapshot");
          if (snap && typeof snap === "object" && (snap.nodes || snap.edges))
            payload = snap;
        }
      }
    } catch {}
    if (!payload) return;

    if (typeof version === "number") {
      if (version === lastAppliedVersionRef.current) return;
      if (version === lastEmittedVersionRef.current) return;
      if (version < lastEmittedVersionRef.current) return;
    }

    drawSnapshot(graph, payload);
    if (typeof version === "number") lastAppliedVersionRef.current = version;

    // Cada render por cambios (locales o remotos) programa persistencia
    schedulePersist();
  }

  // ===================== Publicación local =====================
  const pushSnapshotToYDocRaw = () => {
    const graph = graphRef.current;
    if (!graph || !ydocRef.current) return;
    const snap = toSnapshot(graph);
    seedYFromSnapshot(snap);
    schedulePersist();
  };
  const pushSnapshotToYDoc = throttle(pushSnapshotToYDocRaw, 180);

  // ===================== Bootstrap REST =====================
  let bootstrapDone = false;

  const bootstrapFromRest = async () => {
    if (bootstrapDone) return;
    try {
      let data: any;
      if (shareToken) {
        const res = await api.get(`/public/projects/${pid}/diagram`, {
          params: { share: shareToken },
        });
        data = res.data;
      } else {
        const res = await api.get(`/projects/${pid}/diagram`);
        data = res.data;
      }
      const snapshot = extractSnapshotPayload(data);

      if (graphRef.current) drawSnapshot(graphRef.current, snapshot);
      seedYFromSnapshot(snapshot);
      tryRenderFromYDoc();
      bootstrapDone = true;
    } catch {
      // si falla, esperamos a socket/Yjs
    }
  };

  const scheduleBootstrap = (ms = 500) => {
    cancelBootstrapTimer();
    bootstrapTimer = setTimeout(bootstrapFromRest, ms);
  };

  // ===================== Socket listeners =====================
  s.on("connect", () => {
    s.emit("join", {
      projectId: pid,
      authToken: token,
      share: shareToken,
      shareToken,
    });
    scheduleBootstrap(300);
  });

  s.on("joined", (payload: any) => {
    if (payload?.role && onPromoteRole) onPromoteRole(payload.role as UiRole);

    if (payload?.snapshot) {
      cancelBootstrapTimer();
      bootstrapDone = true;
      if (graphRef.current) drawSnapshot(graphRef.current, payload.snapshot);
      seedYFromSnapshot(payload.snapshot);
      tryRenderFromYDoc();
    } else {
      scheduleBootstrap(400);
    }
  });

  // Snapshots por socket (modo dual)
  s.on("snapshot:init", ({ projectId, snapshot }: any) => {
    if (projectId !== pid) return;
    cancelBootstrapTimer();
    bootstrapDone = true;
    if (graphRef.current) drawSnapshot(graphRef.current, snapshot);
    seedYFromSnapshot(snapshot);
    tryRenderFromYDoc();
  });

  s.on("snapshot:update", ({ projectId, snapshot }: any) => {
    if (projectId !== pid) return;
    if (graphRef.current) drawSnapshot(graphRef.current, snapshot);
    seedYFromSnapshot(snapshot);
    tryRenderFromYDoc();
  });

  // Yjs por socket (modo dual)
  const onYRemote = (updateBase64: string) => {
    try {
      Y.applyUpdate(ydoc, fromBase64(updateBase64));
      cancelBootstrapTimer();
      bootstrapDone = true;
      tryRenderFromYDoc();
    } catch {}
  };
  s.on("y:sync", ({ updateBase64 }: { updateBase64: string }) =>
    onYRemote(updateBase64)
  );
  s.on("y:update", ({ updateBase64 }: { updateBase64: string }) =>
    onYRemote(updateBase64)
  );

  // Awareness (acepta varias etiquetas)
  const awarenessRef = { current: {} as Record<string, any> };
  const renderAwareness = throttle(() => {
    setAwarenessStates({ ...awarenessRef.current });
  }, 40);
  const onAwareness = (payload: any) => {
    const states = payload?.states || payload;
    if (!states || typeof states !== "object") return;
    awarenessRef.current = states;
    renderAwareness();
  };
  s.on("awareness:remote", onAwareness);
  s.on("awareness:states", onAwareness);
  s.on("awareness:update", onAwareness);

  // Eventos de permisos/miembros (compat)
  (
    [
      "memberUpdated",
      "editApproved",
      "editGranted",
      "roleChanged",
      "permissionsUpdated",
    ] as const
  ).forEach((evt) => {
    s.on(evt, (p: any) => onMemberEvent?.(evt, p));
  });
  s.on("requestQueued", () => onRequestQueued?.());

  // YDoc local -> socket
  const onLocalYUpdate = (update: Uint8Array) => {
    socketRef.current?.emit("y:sync:push", {
      projectId: pid,
      updateBase64: toBase64(update),
    });
  };
  ydoc.on("update", onLocalYUpdate);

  // ===================== API pública =====================
  function cleanup() {
    try {
      if (bootstrapTimer) clearTimeout(bootstrapTimer);
      if (persistTimer) clearTimeout(persistTimer);
      ydoc.off("update", onLocalYUpdate);
      ydoc.destroy();
    } catch {}
    try {
      s.removeAllListeners();
      s.disconnect();
    } catch {}
    socketRef.current = null;
    ydocRef.current = null;
  }

  return {
    socketRef,
    ydocRef,
    lastAppliedVersionRef,
    lastEmittedVersionRef,
    tryRenderFromYDoc,
    pushSnapshotToYDoc,
    cleanup,
  };
}
