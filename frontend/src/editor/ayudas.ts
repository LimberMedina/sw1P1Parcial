// Helpers genéricos y tipos compartidos del Editor (sesión, roles, throttle, colores)
import { api } from "../lib/api";

/* ===================== Helpers de sesión ===================== */
export function getAuthToken(fallback?: string | null): string | null {
  const keys = [
    "token",
    "auth.token",
    "accessToken",
    "auth.accessToken",
    "jwt",
    "auth.jwt",
  ];
  for (const k of keys) {
    try {
      const v = localStorage.getItem(k);
      if (v) return v;
    } catch {}
  }
  return fallback ?? null;
}

export function applyAxiosAuthHeader(token: string | null) {
  if (token) api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  else delete api.defaults.headers.common["Authorization"];
}

/* ===================== Roles ===================== */
export type UiRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
const roleRank: Record<UiRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
};
export function promoteRole(
  current: UiRole | null,
  next: UiRole | null
): UiRole | null {
  if (!current) return next;
  if (!next) return current;
  return roleRank[next] > roleRank[current] ? next : current;
}

/* ===================== Utilidades ===================== */
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  wait: number
): T {
  let last = 0;
  let pending: any = null;
  return function (this: any, ...args: any[]) {
    const now = Date.now();
    const remain = wait - (now - last);
    if (remain <= 0) {
      last = now;
      if (pending) {
        clearTimeout(pending);
        pending = null;
      }
      fn.apply(this, args);
    } else if (!pending) {
      pending = setTimeout(() => {
        last = Date.now();
        pending = null;
        fn.apply(this, args);
      }, remain);
    }
  } as T;
}

export function colorFromId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}, 70%, 50%)`;
}

/* ===================== Formularios / Tipos de aristas ===================== */
export type ClassFormValues = {
  name: string;
  attributes: string[];
  methods: string[];
};
export type RelationFormValues = {
  name: string;
  multSource: string;
  multTarget: string;
};
export type EdgeKind = "assoc" | "nav" | "aggr" | "comp" | "dep" | "inherit";
export type Side = "top" | "right" | "bottom" | "left";
