// src/lib/realtime.ts
import { io, Socket } from "socket.io-client";
import type { DiagramSnapshot } from "../uml/snapshot";

type Role = "VIEWER" | "EDITOR" | "OWNER";
type Patch = { type: "full-replace"; snapshot: DiagramSnapshot };

export type JoinResult = { snapshot: DiagramSnapshot; role: Role };

export type RealtimeOptions = {
  baseUrl: string;
  projectId: string;
  authToken?: string | null;
  shareToken?: string | null;
  onJoined?: (data: JoinResult) => void;
  onRemotePatch?: (patch: Patch) => void;
  onPresence?: (evt: any) => void;
  onEditDenied?: (reason: string) => void;
  onRequestQueued?: () => void;
  onMemberUpdated?: (payload: { userId: string; role: Role }) => void;
  onOwnerEditRequest?: (payload: {
    projectId: string;
    requesterId: string;
    requestId: string;
    message?: string;
  }) => void;
};

export class RealtimeClient {
  private opts: RealtimeOptions;
  private socket: Socket;
  private projectId: string;

  constructor(opts: RealtimeOptions) {
    this.opts = opts;
    this.projectId = opts.projectId;

    const token = opts.authToken ? opts.authToken : "";
    this.socket = io(`${opts.baseUrl}/diagram`, {
      transports: ["polling", "websocket"],
      path: (import.meta as any).env?.VITE_SOCKET_PATH || "/socket.io",
      auth: { token },
    });

    this.socket.on("connect_error", (e) => {
      console.error("Socket connect_error", e);
    });

    // joined
    if (opts.onJoined) {
      this.socket.on("joined", (data: JoinResult) => {
        // llamamos solo si existe el callback
        opts.onJoined!(data);
      });
    } else {
      this.socket.on("joined", () => {});
    }

    // remotePatch
    if (opts.onRemotePatch) {
      this.socket.on("remotePatch", (patch: Patch) => {
        opts.onRemotePatch!(patch);
      });
    } else {
      this.socket.on("remotePatch", () => {});
    }

    // presence
    if (opts.onPresence) {
      this.socket.on("presence", (evt: any) => {
        opts.onPresence!(evt);
      });
    } else {
      this.socket.on("presence", () => {});
    }

    // editDenied
    if (opts.onEditDenied) {
      this.socket.on("editDenied", (p: any) => {
        const reason = p && typeof p.reason === "string" ? p.reason : "denied";
        opts.onEditDenied!(reason);
      });
    } else {
      this.socket.on("editDenied", () => {});
    }

    // requestQueued
    if (opts.onRequestQueued) {
      this.socket.on("requestQueued", () => {
        opts.onRequestQueued!();
      });
    } else {
      this.socket.on("requestQueued", () => {});
    }

    // memberUpdated
    if (opts.onMemberUpdated) {
      this.socket.on("memberUpdated", (p: any) => {
        opts.onMemberUpdated!(p);
      });
    } else {
      this.socket.on("memberUpdated", () => {});
    }

    // editRequest (notificación al owner)
    if (opts.onOwnerEditRequest) {
      this.socket.on("editRequest", (p: any) => {
        opts.onOwnerEditRequest!(p);
      });
    } else {
      this.socket.on("editRequest", () => {});
    }
  }

  join() {
    this.socket.emit("join", {
      projectId: this.projectId,
      authToken: this.opts.authToken || undefined,
      shareToken: this.opts.shareToken || undefined,
    });
  }

  sendFullSnapshot(snapshot: DiagramSnapshot) {
    const patch: Patch = { type: "full-replace", snapshot };
    this.socket.emit("patch", { projectId: this.projectId, patch });
  }

  requestEdit(message?: string) {
    this.socket.emit("requestEdit", { projectId: this.projectId, message });
  }

  approveEdit(userId: string, role: Role = "EDITOR") {
    this.socket.emit("approveEdit", {
      projectId: this.projectId,
      userId,
      role,
    });
  }

  disconnect() {
    this.socket.disconnect();
  }
}

// debounce casero (sin librería)
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  wait = 600
) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
