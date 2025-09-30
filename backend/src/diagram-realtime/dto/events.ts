// Transportes JSON-friendly para binarios Y.js
export type Base64 = string;

export type JoinPayload = {
  projectId: string;
  shareToken?: string;
  authToken?: string;
};

export type Patch = unknown;

export type RequestEditPayload = {
  projectId: string;
  message?: string;
};

export type ApproveEditPayload = {
  projectId: string;
  userId: string;
  role?: 'EDITOR' | 'VIEWER';
};

// ---- Y.js sync ----
export type YSyncPullPayload = { projectId: string };
export type YSyncPushPayload = { projectId: string; updateBase64: Base64 };

// ---- Awareness (cursores, selección, nombre/color, etc.) ----
export type AwarenessUpdatePayload = {
  projectId: string;
  states: Record<string, unknown>;
};

// ===== Presencia avanzada =====
export type PresenceState = {
  socketId: string;
  userId: string | null; // null si vino por share link (anon)
  name: string; // mostrar en UI
  role: 'VIEWER' | 'EDITOR' | 'OWNER';
  color: string; // color asignado (cursores, avatares)
  lastSeen: number; // epoch ms
};

export type PresenceJoinAck = {
  roster: PresenceState[]; // lista completa al unirse
};

export type PresenceHeartbeatPayload = {
  projectId: string;
};
