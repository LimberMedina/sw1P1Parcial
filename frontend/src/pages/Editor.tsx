// src/pages/Editor.tsx
import React, { useEffect, useRef, useState, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Graph } from "@antv/x6";
import { Selection } from "@antv/x6-plugin-selection";
import { Toaster, toast } from "react-hot-toast";

import { api } from "../lib/api";
import { useAuth } from "../state/AuthContext";

import { registerShapesOnce } from "../uml/shapes";
import Sidebar from "../uml/ui/Sidebar";
import type { Tool } from "../uml/ui/Sidebar";
import AIAssistant from "../uml/ui/AIAssistant";

import { toSnapshot, fromSnapshot } from "../uml/snapshot";

import type { NodeKind } from "../uml/actions/nodes";
import { CLASS_SIZES } from "../uml/tokens";
import ClassEditorModal from "../uml/ui/ClassEditorModal";
import DiagramControls from "../uml/ui/DiagramControls";

import { io, Socket } from "socket.io-client";

import * as Y from "yjs";
import { fromBase64, toBase64 } from "lib0/buffer";

/* ===================== Helpers de sesión ===================== */
function getAuthToken(fallback?: string | null): string | null {
  const keys = [
    "token",
    "auth.token",
    "accessToken",
    "auth.accessToken",
    "jwt",
    "auth.jwt",
  ];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v) return v;
  }
  return fallback ?? null;
}
function applyAxiosAuthHeader(token: string | null) {
  if (token) api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  else delete api.defaults.headers.common["Authorization"];
}

/* ===================== Helpers de rol (sin degradar) ===================== */
type UiRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
const roleRank: Record<UiRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
};

function promoteRole(
  current: UiRole | null,
  next: UiRole | null
): UiRole | null {
  if (!current) return next;
  if (!next) return current;
  return roleRank[next] > roleRank[current] ? next : current;
}

/* ===================== Estilos/Tipos ===================== */
type EdgeKind =
  | "assoc"
  | "nav"
  | "aggr"
  | "comp"
  | "dep"
  | "inherit"
  | "many-to-many";

const EDGE_STYLE: Record<EdgeKind, any> = {
  assoc: {
    dashed: false,
    targetMarker: null,
    sourceMarker: null,
    stroke: "#374151",
    strokeWidth: 1.5,
  },
  nav: {
    dashed: false,
    targetMarker: { name: "block", width: 12, height: 9 },
    stroke: "#374151",
    strokeWidth: 1.5,
  },
  aggr: {
    dashed: false,
    targetMarker: { name: "diamond", width: 14, height: 12, fill: "#ffffff" },
    stroke: "#111827",
    strokeWidth: 1.6,
  },
  comp: {
    dashed: false,
    targetMarker: { name: "diamond", width: 14, height: 12, fill: "#111827" },
    stroke: "#111827",
    strokeWidth: 1.8,
  },
  dep: {
    dashed: true,
    targetMarker: { name: "classic", width: 12, height: 9 },
    stroke: "#6B7280",
    strokeWidth: 1.2,
  },
  inherit: {
    dashed: false,
    targetMarker: { name: "classic", width: 16, height: 10, fill: "none" },
    stroke: "#111827",
    strokeWidth: 1.6,
  },
  "many-to-many": {
    dashed: false,
    targetMarker: null,
    sourceMarker: null,
    stroke: "#7C3AED",
    strokeWidth: 2,
  },
};

type Side = "top" | "right" | "bottom" | "left";

/* ===================== Formularios ===================== */
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

/* ===================== Utils colaborativo ===================== */
// throttle minimalista
function throttle<T extends (...args: any[]) => void>(fn: T, wait: number): T {
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
function colorFromId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}, 70%, 50%)`;
}

/* ===================== Auto-resize helpers ===================== */
const MONO_FONT =
  "12px JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const NAME_FONT =
  "13px JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const LINE_HEIGHT = 18;
const NAME_HEIGHT = (CLASS_SIZES as any).H_NAME ?? 44;
const MIN_ATTRS_H = 24;
const MIN_METHODS_H = 24;
const HPAD = 16;
const MIN_WIDTH = Math.max(180, (CLASS_SIZES as any).WIDTH ?? 180);

let _measureCtx: CanvasRenderingContext2D | null = null;

function ensureMeasureCtx() {
  if (_measureCtx) return _measureCtx;
  const c = document.createElement("canvas");
  _measureCtx = c.getContext("2d");
  return _measureCtx!;
}

function measureTextWidth(text: string, font: string) {
  const ctx = ensureMeasureCtx();
  ctx.font = font;
  return ctx.measureText(text).width;
}

function computeResizeFromContent(
  name: string,
  attrsArr: string[],
  methodsArr: string[]
) {
  const widths = [
    measureTextWidth(name || "Class", NAME_FONT),
    ...attrsArr.map((s) => measureTextWidth(s, MONO_FONT)),
    ...methodsArr.map((s) => measureTextWidth(s, MONO_FONT)),
  ];
  const width = Math.max(MIN_WIDTH, Math.ceil(Math.max(0, ...widths)) + HPAD);

  const attrsH = Math.max(
    MIN_ATTRS_H,
    (attrsArr.length || 0) * LINE_HEIGHT + 12
  );
  const methodsH = Math.max(
    MIN_METHODS_H,
    (methodsArr.length || 0) * LINE_HEIGHT + 12
  );

  const nameH = NAME_HEIGHT;
  const totalH = nameH + attrsH + methodsH;
  return { width, nameH, attrsH, methodsH, totalH };
}
/* ============ FIX dentado / textos ============ */
const TSPAN_OBS = new Map<string, MutationObserver[]>();
const RESIZING = new Set<string>();

function getNodeGroup(node: any): SVGGElement | null {
  const g = document.querySelector(
    `[data-cell-id="${node.id}"]`
  ) as SVGGElement | null;
  return g && document.contains(g) ? g : null;
}

function computeBaseX(
  group: SVGGElement,
  selector: "attrs" | "methods"
): number {
  const rectEl = group.querySelector(
    `[selector="${selector}-rect"]`
  ) as SVGGraphicsElement | null;
  if (rectEl) {
    try {
      const x = rectEl.getBBox().x + 6;
      if (Number.isFinite(x)) return x;
    } catch {}
  }
  const textEl = group.querySelector(
    `[selector="${selector}"], [magnet-id="${selector}"]`
  ) as SVGTextElement | null;
  if (textEl) {
    const firstT = textEl.querySelector(
      "tspan"
    ) as SVGTextContentElement | null;
    const x0 = firstT?.getAttribute("x");
    if (x0 != null && x0 !== "" && !Number.isNaN(parseFloat(x0)))
      return parseFloat(x0);
    const tx = textEl.getAttribute("x");
    if (tx != null && tx !== "" && !Number.isNaN(parseFloat(tx)))
      return parseFloat(tx);
    try {
      const bx = textEl.getBBox().x;
      if (Number.isFinite(bx)) return bx;
    } catch {}
  }
  return 0;
}

function fixTspans(node: any, selector: "attrs" | "methods") {
  const group = getNodeGroup(node);
  if (!group) return;
  const textEl = group.querySelector(
    `[selector="${selector}"], [magnet-id="${selector}"]`
  ) as SVGTextElement | null;
  if (!textEl) return;
  const tspans = Array.from(
    textEl.querySelectorAll("tspan")
  ) as SVGTextContentElement[];
  if (tspans.length === 0) return;
  const baseX = computeBaseX(group, selector);
  textEl.setAttribute("text-anchor", "start");
  textEl.setAttribute("xml:space", "preserve");
  const baseXStr = String(Number.isFinite(baseX) ? baseX : 0);
  for (const t of tspans) {
    t.removeAttribute("textLength");
    t.setAttribute("dx", "0");
    t.setAttribute("x", baseXStr);
  }
}

function observeTspans(node: any, selector: "attrs" | "methods") {
  const group = getNodeGroup(node);
  if (!group) return;
  const textEl = group.querySelector(
    `[selector="${selector}"], [magnet-id="${selector}"]`
  ) as SVGTextElement | null;
  if (!textEl) return;
  fixTspans(node, selector);
  const obs = new MutationObserver(() => fixTspans(node, selector));
  obs.observe(textEl, { childList: true, subtree: true, attributes: true });
  const arr = TSPAN_OBS.get(node.id) ?? [];
  arr.push(obs);
  TSPAN_OBS.set(node.id, arr);
}

function detachNodeObservers(nodeId: string) {
  const arr = TSPAN_OBS.get(nodeId);
  if (arr) {
    arr.forEach((o) => o.disconnect());
    TSPAN_OBS.delete(nodeId);
  }
}

function clearAnchorAttrs(node: any, sel: "name" | "attrs" | "methods") {
  const keys = ["x", "y", "dx", "dy"];
  for (const k of keys) {
    node.removeAttrByPath?.(`${sel}/${k}`);
    node.setAttrByPath?.(`${sel}/${k}`, undefined as any);
  }
}

function pinTextsToSegments(node: any) {
  if (!node || node.shape !== "uml-class") return;
  clearAnchorAttrs(node, "name");
  clearAnchorAttrs(node, "attrs");
  clearAnchorAttrs(node, "methods");
  const w = node.getSize()?.width ?? 180;
  const wrapWidth = Math.max(40, w - 12);
  node.setAttrs?.(
    {
      name: {
        ref: "name-rect",
        refX: 0.5,
        refY: 0.5,
        textAnchor: "middle",
        textVerticalAnchor: "middle",
        fontWeight: 600,
        textWrap: {
          width: wrapWidth,
          ellipsis: true,
          align: "left",
          lineHeight: 16,
        },
      },
      attrs: {
        ref: "attrs-rect",
        refX: 6,
        refY: 8,
        textAnchor: "start",
        textVerticalAnchor: "top",
        textWrap: {
          width: wrapWidth,
          breakWord: true,
          ellipsis: false,
          align: "left",
          lineHeight: 18,
        },
      },
      methods: {
        ref: "methods-rect",
        refX: 6,
        refY: 8,
        textAnchor: "start",
        textVerticalAnchor: "top",
        textWrap: {
          width: wrapWidth,
          breakWord: true,
          ellipsis: false,
          align: "left",
          lineHeight: 18,
        },
      },
    },
    { silent: true }
  );
  detachNodeObservers(node.id);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      observeTspans(node, "attrs");
      observeTspans(node, "methods");
    });
  });
}

function resizeUmlClass(node: any) {
  if (!node || node.shape !== "uml-class") return;
  if (RESIZING.has(node.id)) return;
  RESIZING.add(node.id);
  try {
    const data = node.getData?.() ?? {};
    const name = data?.name ?? node.attr?.("name/text") ?? "Class";
    const attrsArr = (data?.attributes ?? [])
      .map((s: string) => s.trim())
      .filter(Boolean);
    const methodsArr = (data?.methods ?? [])
      .map((s: string) => s.trim())
      .filter(Boolean);
    const { width, nameH, attrsH, methodsH, totalH } = computeResizeFromContent(
      String(name),
      attrsArr,
      methodsArr
    );
    node.setSize({ width, height: totalH }, { silent: true });
    node.setAttrs?.(
      {
        "name-rect": { height: nameH },
        "attrs-rect": { y: nameH, height: attrsH },
        "methods-rect": { y: nameH + attrsH, height: methodsH },
      },
      { silent: true }
    );
    pinTextsToSegments(node);
  } finally {
    RESIZING.delete(node.id);
  }
}

function getEdgePoints(edge: any) {
  const p0 = edge.getSourcePoint();
  const pN = edge.getTargetPoint();
  const vs = edge.getVertices() as { x: number; y: number }[];
  const pts = [p0, ...vs, pN].filter(Boolean);
  const segLen = (a: any, b: any) => Math.hypot(b.x - a.x, b.y - a.y);
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += segLen(pts[i], pts[i + 1]);
  const firstLen = pts.length >= 2 ? segLen(pts[0], pts[1]) : 0;
  const lastLen =
    pts.length >= 2 ? segLen(pts[pts.length - 2], pts[pts.length - 1]) : 0;
  return { pts, total, firstLen, lastLen };
}

function computeSafeEndpointFractions(edge: any) {
  const { total, firstLen, lastLen } = getEdgePoints(edge);
  if (!Number.isFinite(total) || total <= 0) return { src: 0.06, dst: 0.94 };
  const PX_AWAY = 12,
    CAP = 0.18;
  const src = Math.max(
    0.02,
    Math.min(CAP, Math.max(0, Math.min(firstLen - 2, PX_AWAY)) / total)
  );
  const dstOff = Math.max(
    0.02,
    Math.min(CAP, Math.max(0, Math.min(lastLen - 2, PX_AWAY)) / total)
  );
  const dst = 1 - dstOff;
  return { src, dst };
}

function applyEdgeLabels(edge: any) {
  const data = edge.getData?.() ?? {};
  const name: string = data?.name ?? "";
  const multSource: string = data?.multSource ?? "";
  const multTarget: string = data?.multTarget ?? "";
  const baseFont = {
    fontSize: 12,
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    fill: "#111827",
  };
  const { src, dst } = computeSafeEndpointFractions(edge);
  const labels: any[] = [];
  if (multSource)
    labels.push({
      position: { distance: src, offset: 12 },
      attrs: { label: { ...baseFont, text: multSource } },
    });
  if (name)
    labels.push({
      position: 0.5,
      offset: -10,
      attrs: { label: { ...baseFont, text: name } },
    });
  if (multTarget)
    labels.push({
      position: { distance: dst, offset: 12 },
      attrs: { label: { ...baseFont, text: multTarget } },
    });
  edge.setLabels(labels);
}

/* =================== Editor =================== */
export default function Editor() {
  const routeParams = useParams();
  const { id, projectId } = routeParams;
  const pid = (id ?? projectId) as string;

  const navigate = useNavigate();
  const location = useLocation();
  const shareToken = new URLSearchParams(location.search).get("share");

  const { user, token } = useAuth();
  const effectiveToken = useMemo(() => getAuthToken(token), [token]);
  useEffect(() => applyAxiosAuthHeader(effectiveToken), [effectiveToken]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<Graph | null>(null);

  // socket
  const socketRef = useRef<Socket | null>(null);
  const createdSocketOnce = useRef(false);

  // UI state
  const [tool, setTool] = useState<Tool>("cursor");
  const [loading, setLoading] = useState(true);
  const [graphReady, setGraphReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rol UI
  const [myRole, setMyRole] = useState<UiRole | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [requestApproved, setRequestApproved] = useState(false);
  const [approvalNoticeVisible, setApprovalNoticeVisible] = useState(false);
  const [sourceNodeData, setSourceNodeData] = useState<
    { name: string; attributes: string[] } | undefined
  >(undefined);
  const [targetNodeData, setTargetNodeData] = useState<
    { name: string; attributes: string[] } | undefined
  >(undefined);

  // node placement / one-shot relations
  const placingNodeKindRef = useRef<NodeKind | null>(null);
  const oneShotRef = useRef<{
    active: boolean;
    kind: EdgeKind | null;
    sourceCellId: string | null;
  }>({ active: false, kind: null, sourceCellId: null });
  const nodeClickHandlerRef = useRef<((args: { node: any }) => void) | null>(
    null
  );

  // Control anti-parpadeo (dedupe y batch)
  const lastAppliedVersionRef = useRef<number>(0);
  const lastEmittedVersionRef = useRef<number>(0);

  // Awareness / cursors
  const [awarenessStates, setAwarenessStates] = useState<Record<string, any>>(
    {}
  );
  const awarenessRef = useRef<Record<string, any>>({});
  const ydocRef = useRef<Y.Doc | null>(null);
  const [transformTick, setTransformTick] = useState(0);
  const componentMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      componentMountedRef.current = false;
    };
  }, []);

  // ==== Puertos ====
  type PortMap = Record<Side, string[]>;
  type RouterType = "orth" | "manhattan" | "normal" | "oneSide" | "er";
  type ConnectorType = "rounded" | "smooth" | "jumpover" | "normal";

  const SIDE_PORTS: PortMap = {
    top: ["t0", "t1", "t2", "t3", "t4"],
    right: ["r0", "r1", "r2", "r3", "r4"],
    bottom: ["b0", "b1", "b2", "b3", "b4"],
    left: ["l0", "l1", "l2", "l3", "l4"],
  };

  const ROUTER_CONFIG: Record<RouterType, any> = {
    orth: { name: "orth", args: { padding: 6 } }, // L actual
    manhattan: { name: "manhattan", args: { step: 10 } }, // L con más opciones
    normal: { name: "normal" }, // Línea recta
    oneSide: { name: "oneSide", args: { side: "top" } }, // Solo un doblez
    er: { name: "er", args: { offset: 20 } }, // Para diagramas ER
  };

  const CONNECTOR_CONFIG: Record<ConnectorType, any> = {
    rounded: { name: "rounded", args: { radius: 8 } }, // Esquinas redondeadas
    smooth: { name: "smooth" }, // Curvas S suaves
    jumpover: { name: "jumpover", args: { type: "arc" } }, // Saltos sobre otras líneas
    normal: { name: "normal" }, // Líneas rectas
  };

  const PREFERRED_ORDER = [2, 1, 3, 0, 4];
  const portCursorRef = useRef<Record<string, Record<Side, number>>>({});

  function allocPortPreferMiddle(nodeId: string, side: Side): string {
    const map = portCursorRef.current;
    map[nodeId] ||= { top: 0, right: 0, bottom: 0, left: 0 };
    const cursor = map[nodeId][side] % PREFERRED_ORDER.length;
    const idx = PREFERRED_ORDER[cursor];
    map[nodeId][side] += 1;
    return SIDE_PORTS[side][idx];
  }

  function nearestPort(
    b: { x: number; y: number; width: number; height: number },
    side: Side,
    towards: { x: number; y: number }
  ) {
    const { x, y, width, height } = b;
    const N = SIDE_PORTS[side].length;
    if (side === "top" || side === "bottom") {
      const t = (towards.x - x) / Math.max(1, width);
      const idx = Math.min(N - 1, Math.max(0, Math.round(t * (N - 1))));
      return SIDE_PORTS[side][idx];
    }
    const t = (towards.y - y) / Math.max(1, height);
    const idx = Math.min(N - 1, Math.max(0, Math.round(t * (N - 1))));
    return SIDE_PORTS[side][idx];
  }

  function pickSide(
    a: { x: number; y: number },
    b: { x: number; y: number }
  ): Side {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx >= 0 ? "right" : "left";
    }
    return dy >= 0 ? "bottom" : "top";
  }

  function opposite(side: Side): Side {
    return side === "top"
      ? "bottom"
      : side === "bottom"
      ? "top"
      : side === "left"
      ? "right"
      : "left";
  }

  function reassignEdgePorts(
    edge: any,
    routerType?: RouterType,
    connectorType?: ConnectorType
  ) {
    const graph = graphRef.current!;
    const src = edge.getSource();
    const tgt = edge.getTarget();
    if (!src?.cell || !tgt?.cell) return;

    const srcNode = graph.getCellById(src.cell)! as any;
    const tgtNode = graph.getCellById(tgt.cell)! as any;
    const sc = srcNode.getBBox().center;
    const tc = tgtNode.getBBox().center;

    const srcSide = pickSide(sc, tc);
    const tgtSide = opposite(srcSide);
    const srcBBox = srcNode.getBBox();
    const tgtBBox = tgtNode.getBBox();
    const srcPort = nearestPort(srcBBox, srcSide, tc);
    const tgtPort = nearestPort(tgtBBox, tgtSide, sc);

    edge.setSource({ cell: srcNode.id, port: srcPort });
    edge.setTarget({ cell: tgtNode.id, port: tgtPort });

    // respetar tipos guardados si no vienen explícitos
    const data = edge.getData?.() || {};
    const currentRouter = edge.getRouter()?.name;
    const currentConnector = edge.getConnector()?.name;

    const rt: RouterType =
      routerType && isValidRouterType(routerType)
        ? routerType
        : isValidRouterType(data.routerType)
        ? data.routerType
        : isValidRouterType(currentRouter)
        ? currentRouter
        : "er";

    const ct: ConnectorType =
      connectorType && isValidConnectorType(connectorType)
        ? connectorType
        : isValidConnectorType(data.connectorType)
        ? data.connectorType
        : isValidConnectorType(currentConnector)
        ? currentConnector
        : "smooth";

    edge.setRouter(ROUTER_CONFIG[rt]);
    edge.setConnector(CONNECTOR_CONFIG[ct]);

    edge.setData?.(
      { ...data, routerType: rt, connectorType: ct },
      { overwrite: true }
    );

    applyEdgeLabels(edge);
  }

  useEffect(() => {
    registerShapesOnce();
  }, []);

  // ======== Menú contextual y editor ========
  const [menu, setMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    kind: "node" | "edge" | null;
    id: string | null;
  }>({ visible: false, x: 0, y: 0, kind: null, id: null });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [initialClassForm, setInitialClassForm] =
    useState<ClassFormValues | null>(null);
  const [initialRelForm, setInitialRelForm] =
    useState<RelationFormValues | null>(null);

  function readNodeToForm(node: any): ClassFormValues {
    const data = node.getData?.() ?? {};
    const name =
      data?.name ??
      node.getAttrByPath?.("name/text") ??
      node.attr?.("name/text") ??
      "Class";
    const attrsText =
      data?.attributes ??
      node.getAttrByPath?.("attrs/text") ??
      node.attr?.("attrs/text") ??
      "";
    const methodsText =
      data?.methods ??
      node.getAttrByPath?.("methods/text") ??
      node.attr?.("methods/text") ??
      "";
    const toLines = (v: any) =>
      Array.isArray(v)
        ? (v as string[])
        : String(v || "")
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
    return {
      name: String(name || "Class"),
      attributes: toLines(attrsText),
      methods: toLines(methodsText),
    };
  }

  const save = async () => {
    if (!graphRef.current) return;
    const snap = toSnapshot(graphRef.current);
    // Empujar al Y.Doc para RT (manual save)
    pushSnapshotToYDoc();
    await api.put(`/projects/${pid}/diagram`, {
      nodes: snap.nodes,
      edges: snap.edges,
      updatedAt: new Date().toISOString(),
    });
  };

  function writeFormToNode(node: any, form: ClassFormValues) {
    node.setAttrs?.(
      {
        name: { text: form.name },
        attrs: { text: form.attributes.join("\n") },
        methods: { text: form.methods.join("\n") },
      },
      { silent: true }
    );
    const nextData = {
      ...(node.getData?.() ?? {}),
      name: form.name,
      attributes: form.attributes,
      methods: form.methods,
    };
    node.setData?.(nextData, { overwrite: true });
    resizeUmlClass(node);
  }

  function readEdgeToForm(edge: any): RelationFormValues {
    const data = edge.getData?.() ?? {};
    return {
      name: String(data?.name ?? ""),
      multSource: String(data?.multSource ?? ""),
      multTarget: String(data?.multTarget ?? ""),
    };
  }

  function writeFormToEdge(edge: any, form: RelationFormValues) {
    const nextData = {
      ...(edge.getData?.() ?? {}),
      name: form.name,
      multSource: form.multSource,
      multTarget: form.multTarget,
    };
    edge.setData?.(nextData, { overwrite: true });
    applyEdgeLabels(edge);
  }

  const pendingResize = useRef<Set<string>>(new Set());
  function scheduleResize(nodeId: string) {
    if (pendingResize.current.has(nodeId)) return;
    pendingResize.current.add(nodeId);
    requestAnimationFrame(() => {
      const graph = graphRef.current;
      const node = graph?.getCellById(nodeId) as any;
      if (node) resizeUmlClass(node);
      pendingResize.current.delete(nodeId);
    });
  }

  // Permisos UI
  const isOwner = myRole === "OWNER";
  const canEdit =
    myRole === "OWNER" || myRole === "ADMIN" || myRole === "EDITOR";
  const isReadonly = !canEdit;

  /* ===================== SYNC DE ROL ===================== */
  const refreshingRef = useRef(false);
  const stopHeartbeatRef = useRef(false);

  const refreshRole = async () => {
    if (shareToken) return;
    if (!effectiveToken) return;
    if (refreshingRef.current) return;
    try {
      refreshingRef.current = true;
      const meta = await api.get(`/projects/${pid}`);
      const r: UiRole = (meta?.data?.role as UiRole) || "VIEWER";
      setMyRole((prev) => promoteRole(prev, r));
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        stopHeartbeatRef.current = true;
      }
    } finally {
      refreshingRef.current = false;
    }
  };

  useEffect(() => {
    if (shareToken) return;
    if (!effectiveToken) return;
    let interval: any = null;
    stopHeartbeatRef.current = false;
    if (isReadonly) {
      interval = setInterval(() => {
        if (!stopHeartbeatRef.current) refreshRole();
      }, 7000);
    }
    return () => interval && clearInterval(interval);
  }, [isReadonly, effectiveToken, pid, shareToken]);

  useEffect(() => {
    if (shareToken) return;
    const onFocus = () => {
      if (!canEdit) refreshRole();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [canEdit, shareToken]);

  /* ====== SOCKET: aceptar solicitud (filtrado estricto) ====== */
  const onApprovedForMe = (payload: any, source: string) => {
    console.log("[Editor] approval event from", source, payload);
    setRequestApproved(true);
    setApprovalNoticeVisible(true);
    toast.success("El anfitrión aceptó tu solicitud. ¡Ya podés editar!");

    const role = (payload?.role as UiRole) || "EDITOR";
    setMyRole((prev) => promoteRole(prev, role));

    if (!shareToken) {
      let attempts = 0;
      const fastCheck = setInterval(async () => {
        attempts += 1;
        await refreshRole();
        if (attempts >= 3) clearInterval(fastCheck);
      }, 2000);
    }
    setTimeout(() => setApprovalNoticeVisible(false), 6000);
  };

  const handleMemberUpdated = (payload: any, source: string) => {
    if (!payload) return;
    if (payload.projectId !== pid) return;
    const targetId = payload.userId ?? payload.requesterId;
    if (!user?.id || targetId !== user.id) return;

    if (payload.role && payload.role !== "VIEWER") {
      onApprovedForMe(payload, source);
    } else if (payload.approved || payload.granted) {
      onApprovedForMe(payload, source);
    } else {
      console.log(
        "[Editor] memberUpdated ignored (not for me/without flags)",
        payload
      );
    }
  };

  /* ===================== COLABORACIÓN: Graph ⇄ Y.Doc ===================== */
  function tryRenderFromYDoc() {
    const ydoc = ydocRef.current;
    const graph = graphRef.current;
    if (!ydoc || !graph) return;

    let payload: any = null;
    let version: number | undefined;

    try {
      const map = ydoc.getMap<any>("diagram");
      if (map) {
        version = map.get("version");
        const b64 = map.get("snapshotBase64");
        if (typeof b64 === "string" && b64.length) {
          const json = atob(b64);
          payload = JSON.parse(json);
        } else {
          const snap = map.get("snapshot");
          if (snap && typeof snap === "object" && (snap.nodes || snap.edges)) {
            payload = snap;
          }
        }
      }
    } catch {}

    if (!payload) return;

    // dedupe por version (evita loop y repaints innecesarios)
    if (typeof version === "number") {
      if (version === lastAppliedVersionRef.current) return;
      if (version === lastEmittedVersionRef.current) return;
    }

    graph.batchUpdate(() => {
      fromSnapshot(graph, payload);

      graph.getNodes().forEach((n: any) => {
        if (n.shape === "uml-class") resizeUmlClass(n);
      });
      graph.getEdges().forEach((e: any) => {
        e.setZIndex(1000);
        e.toFront();
        e.setRouter({ name: "orth", args: { padding: 6 } });
        e.setConnector({ name: "rounded" });
        applyEdgeLabels(e);
        reassignEdgePorts(e);
      });
    });

    if (typeof version === "number") {
      lastAppliedVersionRef.current = version;
    }
  }

  function pushSnapshotToYDoc() {
    const graph = graphRef.current;
    const ydoc = ydocRef.current;
    if (!graph || !ydoc) return;

    const snap = toSnapshot(graph);
    const json = JSON.stringify({ nodes: snap.nodes, edges: snap.edges });
    const b64 = btoa(json);
    const version = Date.now();

    const map = ydoc.getMap<any>("diagram");
    Y.transact(ydoc, () => {
      map.set("snapshotBase64", b64);
      map.set("version", version);
    });

    lastEmittedVersionRef.current = version;
  }

  /* ===================== SOCKET + Y.Doc wiring ===================== */
  useEffect(() => {
    if (!pid) return;
    if (createdSocketOnce.current) return;
    createdSocketOnce.current = true;

    const raw =
      (import.meta as any).env?.VITE_SOCKET_URL ??
      (import.meta as any).env?.VITE_API_URL ??
      "";
    let socketBase = (raw || window.location.origin)
      .replace(/\/api\/?$/, "")
      .replace(/\/$/, "");
    const socketPath =
      (import.meta as any).env?.VITE_SOCKET_PATH ?? "/socket.io";

    const s = io(`${socketBase}/diagram`, {
      path: socketPath,
      transports: ["polling", "websocket"],
      withCredentials: true,
      auth: effectiveToken ? { token: effectiveToken } : {},
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 700,
      timeout: 10000,
    });
    socketRef.current = s;

    s.on("connect", () => {
      console.log("[Editor] socket connected", s.id);
      s.emit("join", {
        projectId: pid,
        authToken: effectiveToken,
        share: shareToken,
        shareToken,
      });
    });

    s.on("connect_error", (err) => {
      console.warn("socket connect_error (Editor):", err?.message || err);
    });

    // join ack
    s.on("joined", (payload: any) => {
      console.log("[Editor] joined", payload);
      if (payload?.role)
        setMyRole((prev) => promoteRole(prev, payload.role as UiRole));
      if (!shareToken) refreshRole();
      tryRenderFromYDoc(); // Intentar pintar si ya hay doc del server
    });

    // Eventos: del proyecto o a tu sala `user:<id>`
    s.on("memberUpdated", (p: any) => handleMemberUpdated(p, "memberUpdated"));
    s.on("editApproved", (p: any) => handleMemberUpdated(p, "editApproved"));
    s.on("editGranted", (p: any) => handleMemberUpdated(p, "editGranted"));
    s.on("roleChanged", (p: any) => handleMemberUpdated(p, "roleChanged"));
    s.on("permissionsUpdated", (p: any) =>
      handleMemberUpdated(p, "permissionsUpdated")
    );

    s.on("editDenied", (p: any) => {
      const reason =
        p?.reason === "login_required"
          ? "Necesitás iniciar sesión para editar."
          : p?.reason === "no_permission"
          ? "No tenés permisos de edición."
          : "Acceso denegado.";
      toast.error(reason);
      setRequestSent(false);
    });

    s.on("requestQueued", () => {
      toast.success("Solicitud enviada al anfitrión.");
      setRequestSent(true);
    });

    // ===================== Y.js + Awareness wiring =====================
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // socket -> YDoc
    const onYSync = ({ updateBase64 }: { updateBase64: string }) => {
      try {
        Y.applyUpdate(ydoc, fromBase64(updateBase64));
        tryRenderFromYDoc();
      } catch (e) {
        console.warn("[Editor] y:sync apply error", e);
      }
    };

    const onYUpdate = ({ updateBase64 }: { updateBase64: string }) => {
      try {
        Y.applyUpdate(ydoc, fromBase64(updateBase64));
        tryRenderFromYDoc();
      } catch (e) {
        console.warn("[Editor] y:update apply error", e);
      }
    };

    // YDoc local -> socket
    const onLocalYUpdate = (update: Uint8Array) => {
      socketRef.current?.emit("y:sync:push", {
        projectId: pid,
        updateBase64: toBase64(update),
      });
    };
    ydoc.on("update", onLocalYUpdate);

    // Awareness remoto -> UI (throttle)
    const scheduleAwarenessRender = throttle(() => {
      setAwarenessStates({ ...awarenessRef.current });
    }, 50);
    const onAwarenessRemote = ({ states }: { states: Record<string, any> }) => {
      awarenessRef.current = states || {};
      scheduleAwarenessRender();
    };

    // Cursor local -> servidor (usar coords del grafo)
    const handleMouseMove = throttle((e: MouseEvent) => {
      const sock = socketRef.current;
      if (!sock || !sock.id) return;

      let x = 0,
        y = 0;
      const graph = graphRef.current;
      if (graph) {
        const p = graph.clientToLocal(e.clientX, e.clientY);
        x = p.x;
        y = p.y;
      } else if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        x = e.clientX - rect.left;
        y = e.clientY - rect.top;
      }

      const sid = sock.id;

      sock.emit("awareness:update", {
        projectId: pid,
        states: {
          [sid]: {
            cursor: { x, y },
            name: user?.name ?? "Invitado",
            color: colorFromId(sid),
          },
        },
      });
    }, 40);

    s.on("y:sync", onYSync);
    s.on("y:update", onYUpdate);
    s.on("awareness:remote", onAwarenessRemote);

    const el = containerRef.current;
    el?.addEventListener("mousemove", handleMouseMove, { passive: true });

    // Cleanup
    return () => {
      try {
        el?.removeEventListener("mousemove", handleMouseMove as any);
        s.off("y:sync", onYSync);
        s.off("y:update", onYUpdate);
        s.off("awareness:remote", onAwarenessRemote);
      } catch {}
      try {
        ydoc.off("update", onLocalYUpdate);
        ydoc.destroy();
      } catch {}
      try {
        s.removeAllListeners();
        s.disconnect();
      } catch {}
      socketRef.current = null;
      createdSocketOnce.current = false;
    };
  }, [pid, effectiveToken, shareToken, user?.id]);

  /* ========== Inicializar Graph con readonly dinámico (se recrea si cambia) ========== */
  useEffect(() => {
    if (!containerRef.current) return;

    const graph = new Graph({
      container: containerRef.current,
      background: { color: "#ffffff" },
      grid: {
        visible: true,
        size: 10,
        type: "dot",
        args: { color: "#e5e7eb" },
      },
      panning: true,
      mousewheel: { enabled: true, modifiers: ["ctrl"] },
      connecting: {
        allowBlank: false,
        allowLoop: false,
        snap: true,
        router: ROUTER_CONFIG.normal, // Cambiar por defecto a líneas rectas
        connector: CONNECTOR_CONFIG.smooth,
        highlight: true,
        validateMagnet({ magnet }) {
          if (isReadonly) return false;
          const isActive = oneShotRef.current.active;
          if (!isActive) return false;
          return magnet?.getAttribute?.("magnet") !== "passive";
        },
      },
      interacting: isReadonly ? false : { edgeLabelMovable: true },
    });

    (graph.container as HTMLElement).style.cursor = "default";

    graph.use(
      new Selection({
        enabled: !isReadonly,
        multiple: !isReadonly,
        rubberband: !isReadonly,
        movable: !isReadonly,
        showNodeSelectionBox: !isReadonly,
      })
    );

    graph.on("edge:added", ({ edge }) => {
      edge.setZIndex(1000);
      edge.toFront();
      applyEdgeLabels(edge);
    });
    graph.on("edge:connected", ({ edge }) => {
      edge.setZIndex(1000);
      edge.toFront();
      reassignEdgePorts(edge, "normal", "smooth");
    });

    graph.on("node:moved", ({ node }) => {
      const edges = graph.getConnectedEdges(node);
      edges.forEach((e) => {
        const currentRouter = e.getRouter()?.name || "normal";
        const currentConnector = e.getConnector()?.name || "smooth";

        // Validar tipos antes de usar como índices
        const routerType: RouterType = isValidRouterType(currentRouter)
          ? currentRouter
          : "normal";
        const connectorType: ConnectorType = isValidConnectorType(
          currentConnector
        )
          ? currentConnector
          : "smooth";

        reassignEdgePorts(e, routerType, connectorType);
      });
      edges.forEach((e) => {
        e.setZIndex(1000);
        e.toFront();
      });
    });

    const changeHandler = ({ node }: { node: any }) => {
      if (node?.shape === "uml-class") scheduleResize(node.id);
    };
    graph.on("node:change:attrs", changeHandler);
    graph.on("node:added", changeHandler);
    graph.on("node:change:size", changeHandler);

    graph.on("cell:removed", ({ cell }) => {
      const idCell = (cell && (cell as any).id) || null;
      if (idCell) detachNodeObservers(idCell);
    });

    const handleNodeClick = ({ node }: { node: any }) => {
      const cfg = oneShotRef.current;
      if (!cfg.active) return;
      const sourceId = cfg.sourceCellId;
      if (!sourceId || node.id === sourceId) {
        cfg.sourceCellId = node.id;
        graph.cleanSelection();
        graph.select(node);
        return;
      }

      const kind = (cfg.kind ?? "assoc") as EdgeKind;
      const style = EDGE_STYLE[kind];
      const baseLine: any = {
        stroke: style.stroke ?? "#6366f1",
        strokeWidth: style.strokeWidth ?? 1.5,
        strokeDasharray: style.dashed ? 4 : undefined,
        sourceMarker: style.sourceMarker ?? null,
        targetMarker: style.targetMarker ?? null,
      };

      const sourceNode = graph.getCellById(sourceId)! as any;
      const targetNode = node as any;
      const sc = sourceNode.getBBox().center;
      const tc = targetNode.getBBox().center;
      const distance = Math.hypot(tc.x - sc.x, tc.y - sc.y);
      const routerType: RouterType = distance < 200 ? "normal" : "er";
      const connectorType: ConnectorType = distance < 200 ? "normal" : "smooth";

      const sourceSide = pickSide(sc, tc);
      const targetSide = opposite(sourceSide);
      const sourcePort = allocPortPreferMiddle(sourceId, sourceSide);
      const targetPort = allocPortPreferMiddle(targetNode.id, targetSide);

      const edge = graph.addEdge({
        attrs: { line: baseLine },
        zIndex: 1000,
        router: ROUTER_CONFIG[routerType],
        connector: CONNECTOR_CONFIG[connectorType],
        source: { cell: sourceId, port: sourcePort },
        target: { cell: targetNode.id, port: targetPort },
        data: {
          name: "",
          multSource: "",
          multTarget: "",
          routerType,
          connectorType,
        },
      });

      if (kind === "assoc") {
        edge.attr("line/sourceMarker", null);
        edge.attr("line/targetMarker", null);
      }
      applyEdgeLabels(edge);

      graph.cleanSelection();
      oneShotRef.current = { active: false, kind: null, sourceCellId: null };
      setTool("cursor");
      graph.off("node:click", handleNodeClick);
    };
    nodeClickHandlerRef.current = handleNodeClick;

    const hideMenu = () =>
      setMenu((m) => ({ ...m, visible: false, kind: null, id: null }));

    if (!isReadonly) {
      graph.on("node:contextmenu", ({ e, node }) => {
        e.preventDefault();
        graph.cleanSelection();
        graph.select(node);
        setMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          kind: "node",
          id: node.id,
        });
      });
      graph.on("edge:contextmenu", ({ e, edge }) => {
        e.preventDefault();
        graph.cleanSelection();
        graph.select(edge);
        setMenu({
          visible: true,
          x: e.clientX,
          y: e.clientY,
          kind: "edge",
          id: edge.id,
        });
      });
      graph.on("blank:click", hideMenu);
      graph.on("node:click", hideMenu);
      graph.on("edge:click", hideMenu);
    } else {
      graph.on("node:contextmenu", (ev) => ev.e.preventDefault());
      graph.on("edge:contextmenu", (ev) => ev.e.preventDefault());
    }

    const onKeyDownForMenu = (ev: KeyboardEvent) => {
      if (ev.key === "Escape")
        setMenu((m) => ({ ...m, visible: false, kind: null, id: null }));
    };
    window.addEventListener("keydown", onKeyDownForMenu);

    const containerContextMenuHandler = (ev: MouseEvent) => {
      if (isReadonly) ev.preventDefault();
    };
    containerRef.current?.addEventListener(
      "contextmenu",
      containerContextMenuHandler
    );

    graphRef.current = graph;
    setGraphReady(true);

    const resize = () => {
      if (!containerRef.current) return;
      graph.resize(
        containerRef.current.clientWidth,
        containerRef.current.clientHeight
      );
      setTransformTick((t) => t + 1);
    };
    resize();
    window.addEventListener("resize", resize);

    graph.on("scale", () => setTransformTick((t) => t + 1));
    graph.on("translate", () => setTransformTick((t) => t + 1));

    // Listener para actualización de clases desde AI Assistant
    const handleClassUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { nodeId, node } = customEvent.detail || {};

      if (node && node.shape === "uml-class") {
        resizeUmlClass(node);
        // Sincronizar cambios con Y.Doc para colaboración en tiempo real
        requestAnimationFrame(() => pushSnapshotToYDoc());
      } else if (nodeId) {
        const foundNode = graph.getCellById(nodeId);
        if (foundNode && (foundNode as any).shape === "uml-class") {
          resizeUmlClass(foundNode as any);
          // Sincronizar cambios con Y.Doc para colaboración en tiempo real
          requestAnimationFrame(() => pushSnapshotToYDoc());
        }
      }
    };
    window.addEventListener("uml:class:updated", handleClassUpdate);

    const handleBlankClick = ({ x, y }: { x: number; y: number }) => {
      if (!placingNodeKindRef.current) return;
      addClassAt(graph, x, y);
      placingNodeKindRef.current = null;
      setTool("cursor");
    };
    graph.on("blank:click", handleBlankClick);

    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && oneShotRef.current.active) {
        oneShotRef.current = { active: false, kind: null, sourceCellId: null };
        graph.cleanSelection();
        if (nodeClickHandlerRef.current)
          graph.off("node:click", nodeClickHandlerRef.current);
        setTool("cursor");
      }
    };
    window.addEventListener("keyup", onKeyUp);

    const onDragOver = (ev: DragEvent) => {
      if (isReadonly) return;
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (ev: DragEvent) => {
      if (isReadonly) return;
      ev.preventDefault();
      const kind = ev.dataTransfer?.getData("x6");
      if (kind !== "uml-class") return;
      const p = graph.clientToLocal(ev.clientX, ev.clientY);
      addClassAt(graph, p.x, p.y);
    };

    const el = containerRef.current!;
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", onKeyDownForMenu);
      window.removeEventListener("uml:class:updated", handleClassUpdate);
      if (containerRef.current) {
        containerRef.current.removeEventListener(
          "contextmenu",
          containerContextMenuHandler
        );
        containerRef.current.removeEventListener("dragover", onDragOver);
        containerRef.current.removeEventListener("drop", onDrop);
      }
      graph.off("blank:click", handleBlankClick);
      graph.off("blank:click", hideMenu);
      graph.off("node:click", hideMenu);
      graph.off("edge:click", hideMenu);
      graph.off("node:change:attrs", changeHandler);
      graph.off("node:added", changeHandler);
      graph.off("node:change:size", changeHandler);
      if (nodeClickHandlerRef.current)
        graph.off("node:click", nodeClickHandlerRef.current);
      graphRef.current = null;
      nodeClickHandlerRef.current = null;
      TSPAN_OBS.forEach((arr) => arr.forEach((o) => o.disconnect()));
      TSPAN_OBS.clear();
      graph.dispose();
      setGraphReady(false);
    };
  }, [isReadonly]);

  function isValidRouterType(type: any): type is RouterType {
    return ["manhattan", "normal", "oneSide", "er"].includes(type);
  }
  function isValidConnectorType(type: any): type is ConnectorType {
    return ["rounded", "smooth", "jumpover", "normal"].includes(type);
  }

  // Autosave debounced (solo si puede editar)
  useEffect(() => {
    if (!graphRef.current || !canEdit) return;
    let timer: any = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const snap = toSnapshot(graphRef.current!);

          // Publicar al Y.Doc para RT colaborativo
          pushSnapshotToYDoc();

          await api.put(`/projects/${pid}/diagram`, {
            nodes: snap.nodes,
            edges: snap.edges,
            updatedAt: new Date().toISOString(),
          });
        } catch (e) {
          console.error("Autosave falló", e);
        }
      }, 1200);
    };
    const g = graphRef.current;
    const onDirty = () => schedule();
    g.on("node:moved", onDirty);
    g.on("node:change:attrs", onDirty);
    g.on("node:change:size", onDirty);
    g.on("node:added", onDirty);
    g.on("cell:removed", onDirty);
    g.on("edge:connected", onDirty);
    g.on("edge:removed", onDirty);
    return () => {
      if (timer) clearTimeout(timer);
      g.off("node:moved", onDirty);
      g.off("node:change:attrs", onDirty);
      g.off("node:change:size", onDirty);
      g.off("node:added", onDirty);
      g.off("cell:removed", onDirty);
      g.off("edge:connected", onDirty);
      g.off("edge:removed", onDirty);
    };
  }, [pid, graphReady, canEdit]);

  // Cargar snapshot + rol inicial (evitando /projects cuando hay shareToken)
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        if (!shareToken && effectiveToken) {
          try {
            const meta = await api.get(`/projects/${pid}`);
            const fetched: UiRole = (meta?.data?.role as UiRole) || "VIEWER";
            setMyRole((prev) => promoteRole(prev, fetched));
          } catch {
            setMyRole((prev) => promoteRole(prev, "VIEWER"));
          }
        } else {
          setMyRole((prev) => promoteRole(prev, "VIEWER"));
        }

        let snapshotPayload: any = null;
        if (shareToken) {
          const { data } = await api.get(`/public/projects/${pid}/diagram`, {
            params: { share: shareToken },
          });
          snapshotPayload = data?.snapshot ?? { nodes: [], edges: [] };
        } else {
          const { data } = await api.get(`/projects/${pid}/diagram`);
          snapshotPayload = data?.snapshot ?? data ?? { nodes: [], edges: [] };
        }

        if (graphRef.current) {
          fromSnapshot(graphRef.current, snapshotPayload);
          graphRef.current.getNodes().forEach((n: any) => {
            if (n.shape === "uml-class")
              requestAnimationFrame(() => resizeUmlClass(n));
          });
          graphRef.current.getEdges().forEach((e: any) => {
            e.setZIndex(1000);
            e.toFront();

            // Aplicar configuración flexible según datos guardados
            const data = e.getData() || {};
            const savedRouterType = data.routerType || "normal";
            const savedConnectorType = data.connectorType || "smooth";

            // Validar tipos antes de usar
            const routerType: RouterType = isValidRouterType(savedRouterType)
              ? savedRouterType
              : "normal";
            const connectorType: ConnectorType = isValidConnectorType(
              savedConnectorType
            )
              ? savedConnectorType
              : "smooth";

            e.setRouter(ROUTER_CONFIG[routerType]);
            e.setConnector(CONNECTOR_CONFIG[connectorType]);

            applyEdgeLabels(e);
            reassignEdgePorts(e, routerType, connectorType);
          });
        }
      } catch (e: any) {
        setError(
          e?.response?.data?.message ||
            e?.message ||
            "No se pudo cargar el diagrama"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [pid, shareToken, effectiveToken, user?.id]);

  // ===== Helpers =====
  const addClassAt = (graph: Graph, x: number, y: number) => {
    const node = graph.addNode({
      shape: "uml-class",
      x: x - (CLASS_SIZES as any).WIDTH / 2,
      y: y - (CLASS_SIZES as any).HEIGHT / 2,
      width: (CLASS_SIZES as any).WIDTH,
      height: (CLASS_SIZES as any).HEIGHT,
      attrs: {
        name: { text: "Class" },
        attrs: { text: "" },
        methods: { text: "" },
      },
      zIndex: 2,
      data: { name: "Class", attributes: [], methods: [] },
    }) as any;
    resizeUmlClass(node);
  };

  const handleEdit = () => {
    if (isReadonly) return;
    if (!menu.visible || !menu.id || !graphRef.current || !menu.kind) return;
    const graph = graphRef.current;
    if (menu.kind === "node") {
      const node = graph.getCellById(menu.id) as any;
      if (!node) return;
      setInitialClassForm(readNodeToForm(node));
      setEditingNodeId(menu.id);
      setEditingEdgeId(null);
      setInitialRelForm(null);
      setEditorOpen(true);
    } else {
      const edge = graph.getCellById(menu.id) as any;
      if (!edge) return;

      const sourceNode = graph.getCellById(edge.getSourceCellId());
      const targetNode = graph.getCellById(edge.getTargetCellId());

      const sourceNodeData = sourceNode
        ? {
            name: sourceNode.getData()?.name || "Clase",
            attributes: sourceNode.getData()?.attributes || [],
          }
        : undefined;

      const targetNodeData = targetNode
        ? {
            name: targetNode.getData()?.name || "Clase",
            attributes: targetNode.getData()?.attributes || [],
          }
        : undefined;
      setInitialRelForm(readEdgeToForm(edge));
      setEditingEdgeId(menu.id);
      setEditingNodeId(null);
      setInitialClassForm(null);
      setEditorOpen(true);

      setSourceNodeData(sourceNodeData);
      setTargetNodeData(targetNodeData);

      setEditorOpen(true);
    }
    setMenu((m) => ({ ...m, visible: false }));
  };

  const handleDelete = () => {
    if (isReadonly) return;
    if (!menu.visible || !menu.id || !graphRef.current || !menu.kind) return;
    const graph = graphRef.current;
    if (menu.kind === "node") graph.removeNode(menu.id);
    else graph.removeEdge(menu.id);
    setMenu((m) => ({ ...m, visible: false, kind: null, id: null }));
  };

  const onToolClick = (t: Tool) => {
    const graph = graphRef.current;
    setTool(t);
    if (!graph) return;

    if (isReadonly) {
      if (t !== "cursor") return;
      placingNodeKindRef.current = null;
      oneShotRef.current = { active: false, kind: null, sourceCellId: null };
      graph.cleanSelection();
      if (nodeClickHandlerRef.current)
        graph.off("node:click", nodeClickHandlerRef.current);
      return;
    }

    if (t === "class" || t === "interface" || t === "abstract") {
      placingNodeKindRef.current = t as NodeKind;
      return;
    }

    // Agregar many-to-many al array de relaciones
    if (
      [
        "assoc",
        "nav",
        "aggr",
        "comp",
        "dep",
        "inherit",
        "many-to-many",
      ].includes(t)
    ) {
      // many-to-many se maneja de forma especial en el Sidebar
      if (t !== "many-to-many") {
        oneShotRef.current = {
          active: true,
          kind: t as EdgeKind,
          sourceCellId: null,
        };
        if (nodeClickHandlerRef.current)
          graph.on("node:click", nodeClickHandlerRef.current);
      }
      return;
    }

    if (t === "cursor") {
      placingNodeKindRef.current = null;
      oneShotRef.current = { active: false, kind: null, sourceCellId: null };
      graph.cleanSelection();
      if (nodeClickHandlerRef.current)
        graph.off("node:click", nodeClickHandlerRef.current);
    }
  };

  const handleClassDragStart = (e: React.DragEvent) => {
    if (isReadonly) return;
    if (e.dataTransfer) {
      e.dataTransfer.setData("x6", "uml-class");
      e.dataTransfer.setData("text/plain", "uml-class");
      e.dataTransfer.effectAllowed = "copyMove";
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const toolbarDisabled = !graphReady || loading;
  const canShare = isOwner;

  const handleSendEditRequest = async () => {
    try {
      await api.post(`/projects/${pid}/request-edit`, {
        message: "Solicito permisos de edición para este diagrama",
      });
      toast.success("Solicitud enviada al anfitrión.");
      setRequestSent(true);
      socketRef.current?.emit("requestEdit", {
        projectId: pid,
        message: "Solicito permisos de edición para este diagrama",
      });

      if (!shareToken) {
        let attempts = 0;
        const fastCheck = setInterval(async () => {
          attempts += 1;
          await refreshRole();
          if (canEdit || attempts >= 3) clearInterval(fastCheck);
        }, 3000);
      }
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message || "No se pudo enviar la solicitud"
      );
      setRequestSent(false);
    }
  };

  // Handlers básicos para el AIAssistant
  const handleAddClassFromAI = (
    className: string,
    attributes: string[],
    methods: string[]
  ) => {
    if (!graphRef.current) return;

    const existing = graphRef.current.getNodes();
    const count = existing.length;
    const cols = Math.ceil(Math.sqrt(count + 1));
    const row = Math.floor(count / cols);
    const col = count % cols;
    const spacing = 250;
    const startX = 200;
    const startY = 150;
    const x = startX + col * spacing;
    const y = startY + row * spacing;

    const node = graphRef.current.addNode({
      shape: "uml-class",
      x,
      y,
      width: (CLASS_SIZES as any).WIDTH,
      height: (CLASS_SIZES as any).HEIGHT,
      attrs: {
        name: { text: className },
        attrs: { text: attributes.join("\n") },
        methods: { text: methods.join("\n") },
      },
      zIndex: 2,
      data: { name: className, attributes, methods },
    }) as any;

    resizeUmlClass(node);
    pushSnapshotToYDoc();
  };

  const handleAddRelationFromAI = (
    from: string,
    to: string,
    type: string,
    multiplicity?: { source?: string; target?: string }
  ) => {
    if (!graphRef.current) return;

    const nodes = graphRef.current.getNodes();
    const sourceNode = nodes.find((n: any) => n.getData()?.name === from);
    const targetNode = nodes.find((n: any) => n.getData()?.name === to);

    if (!(sourceNode && targetNode)) return;

    const normalizedType = type.toLowerCase();
    const typeMapping: Record<string, EdgeKind> = {
      assoc: "assoc",
      inherit: "inherit",
      comp: "comp",
      aggr: "aggr",
      dep: "dep",
      "many-to-many": "many-to-many",
      nav: "nav",
    };

    const edgeKind: EdgeKind = typeMapping[normalizedType] || "assoc";
    const edgeStyle = EDGE_STYLE[edgeKind] || EDGE_STYLE.assoc;

    const sc = sourceNode.getBBox().center;
    const tc = targetNode.getBBox().center;
    const sourceSide = pickSide(sc, tc);
    const targetSide = opposite(sourceSide);
    const sourcePort = allocPortPreferMiddle(sourceNode.id, sourceSide);
    const targetPort = allocPortPreferMiddle(targetNode.id, targetSide);

    const edge = graphRef.current.addEdge({
      attrs: {
        line: {
          stroke: edgeStyle.stroke ?? "#374151",
          strokeWidth: edgeStyle.strokeWidth ?? 1.5,
          strokeDasharray: edgeStyle.dashed ? 4 : undefined,
          sourceMarker: edgeStyle.sourceMarker ?? null,
          targetMarker: edgeStyle.targetMarker ?? null,
        },
      },
      zIndex: 1000,
      router: ROUTER_CONFIG.orth,
      connector: CONNECTOR_CONFIG.rounded,
      source: { cell: sourceNode.id, port: sourcePort },
      target: { cell: targetNode.id, port: targetPort },
      data: {
        name: "",
        multSource: multiplicity?.source || "",
        multTarget: multiplicity?.target || "",
        type: edgeKind,
        routerType: "orth",
        connectorType: "rounded",
      },
    });

    applyEdgeLabels(edge);
    pushSnapshotToYDoc();
  };

  const goToRegister = () => navigate("/register");
  const goToLogin = () => navigate("/login");

  // helper: convertir coords del grafo a coords del contenedor para cursores
  function localToClientPoint(x: number, y: number) {
    const graph = graphRef.current;
    if (!graph || !containerRef.current) return { left: x, top: y };
    const p = graph.localToClient(x, y);
    const rect = containerRef.current.getBoundingClientRect();
    return { left: p.x - rect.left, top: p.y - rect.top };
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar
        tool={tool}
        onToolClick={onToolClick}
        onBack={() => navigate("/app")}
        graph={graphRef.current}
        onClassDragStart={handleClassDragStart}
      />
      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0 cursor-default" />

        {/* Cursors remotos */}
        <div className="absolute inset-0 pointer-events-none z-40">
          {/* Forzar rerender con zoom/pan */}
          <div style={{ display: "none" }}>{transformTick}</div>
          {Object.entries(awarenessStates).map(([id, state]) => {
            if (!state?.cursor) return null;
            if (id === socketRef.current?.id) return null; // ocultá tu propio cursor
            const pos = localToClientPoint(state.cursor.x, state.cursor.y);
            return (
              <div
                key={`cursor-${id}`}
                style={{
                  position: "absolute",
                  left: pos.left,
                  top: pos.top,
                  transform: "translate(-50%, -50%)",
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                }}
              >
                <svg width={16} height={16}>
                  <circle
                    cx={8}
                    cy={8}
                    r={7}
                    fill={state.color || "#1f77b4"}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                </svg>
                <span
                  style={{
                    fontSize: 12,
                    background: "#fff",
                    border: "1px solid #ccc",
                    borderRadius: 4,
                    padding: "2px 4px",
                    marginLeft: 4,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                  }}
                >
                  {state.name || "Usuario"}
                </span>
              </div>
            );
          })}
        </div>

        {isReadonly && (
          <div className="absolute top-3 left-3 z-20 rounded bg-amber-50 border border-amber-200 px-3 py-1 text-amber-700 text-sm">
            Vista pública / solo lectura
          </div>
        )}

        {/* Aviso de aprobación */}
        {approvalNoticeVisible && (
          <div className="absolute top-3 right-3 z-30 max-w-md rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-800 shadow">
            <div className="font-medium">Solicitud aceptada</div>
            <div className="mt-1 text-sm">
              El anfitrión aceptó tu solicitud. Ya podés editar.
            </div>
          </div>
        )}

        {/* Banner de solicitud (cuando hay sesión y es solo lectura) */}
        {user && isReadonly && (
          <div className="absolute top-3 right-3 z-20 max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 shadow">
            <div className="font-medium">
              {requestApproved ? "Solicitud aceptada" : "Solo lectura"}
            </div>
            <div className="mt-1 text-sm">
              {requestApproved
                ? "El anfitrión aceptó tu solicitud. El editor se habilitará automáticamente."
                : "Para editar este diagrama necesitás permiso del anfitrión."}
            </div>

            {!requestApproved && (
              <button
                onClick={handleSendEditRequest}
                className="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700 disabled:opacity-60"
                disabled={requestSent}
              >
                {requestSent
                  ? "Solicitud enviada… (esperando aprobación)"
                  : "Enviar solicitud de edición"}
              </button>
            )}
          </div>
        )}

        {/* Banner cuando no hay sesión */}
        {!user && isReadonly && (
          <div className="absolute top-3 right-3 z-20 max-w-md rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800 shadow">
            <div className="font-medium">¿Querés editar este diagrama?</div>
            <div className="mt-1 text-sm">
              Creá una cuenta o iniciá sesión para poder enviar una solicitud de
              edición al anfitrión.
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={goToRegister}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700"
              >
                Crear cuenta
              </button>
              <button
                onClick={goToLogin}
                className="rounded-md border border-blue-600 px-3 py-1.5 text-blue-700 hover:bg-blue-100"
              >
                Iniciar sesión
              </button>
            </div>
          </div>
        )}

        <DiagramControls
          graph={graphRef.current}
          tool={tool}
          onToolClick={onToolClick}
          onSave={canEdit ? save : undefined}
          disabled={toolbarDisabled}
          exportName={`diagram-${pid ?? "unsaved"}`}
          canShare={canShare}
          onGetShareLink={
            canShare
              ? async () => {
                  const { data } = await api.post(`/projects/${pid}/share`, {
                    role: "VIEWER",
                  });
                  return `${window.location.origin}/project/${pid}?share=${data.token}`;
                }
              : async () => window.location.href
          }
        />

        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/40">
            <div className="rounded-xl bg-white px-4 py-2 text-sm text-gray-700 shadow">
              Cargando diagrama…
            </div>
          </div>
        )}
        {error && (
          <div className="absolute left-4 top-4 z-20 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 shadow">
            {error}
          </div>
        )}

        {!isReadonly && menu.visible && menu.id && (
          <div
            className="fixed z-50 w-44 rounded-lg border border-gray-200 bg-white/95 shadow-xl backdrop-blur"
            style={{ top: menu.y, left: menu.x }}
            onMouseLeave={() =>
              setMenu((m) => ({ ...m, visible: false, kind: null, id: null }))
            }
          >
            <button
              className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
              onClick={handleEdit}
            >
              Editar {menu.kind === "edge" ? "relación" : "clase"}
            </button>
            <button
              className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              onClick={handleDelete}
            >
              Eliminar {menu.kind === "edge" ? "relación" : "clase"}
            </button>
          </div>
        )}

        {!isReadonly && editorOpen && (
          <ClassEditorModal
            open={editorOpen}
            mode={editingEdgeId ? "edge" : "class"}
            initialValues={
              editingEdgeId
                ? (initialRelForm as any)
                : (initialClassForm as any)
            }
            size="lg"
            // *** AGREGAR ESTAS PROPS ***
            sourceNodeData={sourceNodeData}
            targetNodeData={targetNodeData}
            onClose={() => {
              setEditorOpen(false);
              setSourceNodeData(undefined);
              setTargetNodeData(undefined);
            }}
            onSubmit={(values: any) => {
              const graph = graphRef.current!;
              if (editingEdgeId) {
                const edge = graph.getCellById(editingEdgeId) as any;
                if (edge) writeFormToEdge(edge, values as RelationFormValues);
                setEditingEdgeId(null);
              } else if (editingNodeId) {
                const node = graph.getCellById(editingNodeId) as any;
                if (node) writeFormToNode(node, values as ClassFormValues);
                setEditingNodeId(null);
              }
              setEditorOpen(false);
              setSourceNodeData(undefined);
              setTargetNodeData(undefined);
            }}
          />
        )}
      </div>
      {/* AIAssistant con handlers estables */}
      <AIAssistant
        graph={graphRef.current}
        onAddClass={handleAddClassFromAI}
        onAddRelation={handleAddRelationFromAI}
        onToolChange={(newTool: Tool) => {
          setTool(newTool);
          onToolClick(newTool);
        }}
        currentTool={tool}
        canEdit={canEdit}
      />
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: { background: "#363636", color: "#fff" },
          success: {
            duration: 3000,
            iconTheme: { primary: "#4ade80", secondary: "#fff" },
          },
          error: {
            duration: 4000,
            iconTheme: { primary: "#ef4444", secondary: "#fff" },
          },
        }}
      />
    </div>
  );
}
