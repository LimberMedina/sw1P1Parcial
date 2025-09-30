// Lógica del grafo: shapes, medidas, auto-resize, puertos, aristas, construcción
import { Graph } from "@antv/x6";
import { Selection } from "@antv/x6-plugin-selection";
import { CLASS_SIZES } from "../uml/tokens";
import { registerShapesOnce } from "../uml/shapes";
import type {
  ClassFormValues,
  RelationFormValues,
  EdgeKind,
  Side,
} from "./ayudas";

/* ===== Registrar shapes una sola vez ===== */
let _registered = false;
export function ensureShapes() {
  if (_registered) return;
  registerShapesOnce();
  _registered = true;
}

/* =================== Estilos de aristas =================== */
export const EDGE_STYLE: Record<EdgeKind, any> = {
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
};

/* =================== Medidas y auto-resize =================== */
const MONO_FONT =
  "12px JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const NAME_FONT =
  "13px JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const TEXT_LH = 18;
const NAME_HEIGHT = (CLASS_SIZES as any).H_NAME ?? 44;
const MIN_ATTRS_H = 28;
const MIN_METHODS_H = 28;
const SEG_TOP = 8;
const SEG_BOTTOM = 6;
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
  const attrsH =
    attrsArr.length > 0
      ? SEG_TOP + attrsArr.length * TEXT_LH + SEG_BOTTOM
      : MIN_ATTRS_H;
  const methodsH =
    methodsArr.length > 0
      ? SEG_TOP + methodsArr.length * TEXT_LH + SEG_BOTTOM
      : MIN_METHODS_H;
  const nameH = NAME_HEIGHT;
  const totalH = nameH + attrsH + methodsH;
  return { width, nameH, attrsH, methodsH, totalH };
}

/* ============ Fijar textos/segmentos + observers ============ */
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
          lineHeight: TEXT_LH,
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
          lineHeight: TEXT_LH,
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
export function resizeUmlClass(node: any) {
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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // medir DOM real y ajustar si hace falta (opcional)
      });
    });
  } finally {
    RESIZING.delete(node.id);
  }
}

/* =================== Etiquetas de aristas =================== */
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
  return { total, firstLen, lastLen };
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
  return { src, dst: 1 - dstOff };
}
export function applyEdgeLabels(edge: any) {
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

/* =================== Puertos / ruteo =================== */
type PortMap = Record<Side, string[]>;
const SIDE_PORTS: PortMap = {
  top: ["t0", "t1", "t2", "t3", "t4"],
  right: ["r0", "r1", "r2", "r3", "r4"],
  bottom: ["b0", "b1", "b2", "b3", "b4"],
  left: ["l0", "l1", "l2", "l3", "l4"],
};
const PREFERRED_ORDER = [2, 1, 3, 0, 4];
const portCursor: Record<string, Record<Side, number>> = {};
export function allocPortPreferMiddle(nodeId: string, side: Side): string {
  portCursor[nodeId] ||= { top: 0, right: 0, bottom: 0, left: 0 };
  const cursor = portCursor[nodeId][side] % PREFERRED_ORDER.length;
  const idx = PREFERRED_ORDER[cursor];
  portCursor[nodeId][side] += 1;
  return SIDE_PORTS[side][idx];
}
function pickSide(
  a: { x: number; y: number },
  b: { x: number; y: number }
): Side {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "right" : "left";
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
function nearestPort(
  b: { x: number; y: number; width: number; height: number },
  side: Side,
  towards: { x: number; y: number }
) {
  const { x, y, width, height } = b;
  const N = SIDE_PORTS[side].length;
  if (side === "top" || side === "bottom") {
    const t = (towards.x - x) / Math.max(1, width);
    return SIDE_PORTS[side][
      Math.min(N - 1, Math.max(0, Math.round(t * (N - 1))))
    ];
  }
  const t = (towards.y - y) / Math.max(1, height);
  return SIDE_PORTS[side][
    Math.min(N - 1, Math.max(0, Math.round(t * (N - 1))))
  ];
}
export function reassignEdgePorts(edge: any, graphLike: any) {
  if (!graphLike || typeof graphLike.getCellById !== "function") return;
  const graph = graphLike as Graph;
  const src = edge.getSource();
  const tgt = edge.getTarget();
  if (!src?.cell || !tgt?.cell) return;
  const srcNode = graph.getCellById(src.cell)! as any;
  const tgtNode = graph.getCellById(tgt.cell)! as any;
  if (!(srcNode && tgtNode)) return;
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
  edge.setRouter({ name: "orth", args: { padding: 6 } });
  edge.setConnector({ name: "rounded" });
  applyEdgeLabels(edge);
}

/* =================== Construcción del grafo =================== */
export function crearGrafo(opts: {
  container: HTMLDivElement;
  soloLectura: boolean;
}) {
  ensureShapes();
  const graph = new Graph({
    container: opts.container,
    background: { color: "#ffffff" },
    grid: { visible: true, size: 10, type: "dot", args: { color: "#e5e7eb" } },
    panning: true,
    mousewheel: { enabled: true, modifiers: ["ctrl"] },
    connecting: {
      allowBlank: false,
      allowLoop: false,
      snap: true,
      router: { name: "orth", args: { padding: 6 } },
      connector: { name: "rounded" },
      highlight: true,
      validateMagnet({ magnet }) {
        return (
          !opts.soloLectura && magnet?.getAttribute?.("magnet") !== "passive"
        );
      },
    },
    interacting: opts.soloLectura ? false : { edgeLabelMovable: true },
  });

  graph.use(
    new Selection({
      enabled: !opts.soloLectura,
      multiple: !opts.soloLectura,
      rubberband: !opts.soloLectura,
      movable: !opts.soloLectura,
      showNodeSelectionBox: !opts.soloLectura,
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
    edge.setRouter({ name: "orth", args: { padding: 6 } });
    edge.setConnector({ name: "rounded" });
    applyEdgeLabels(edge);
    reassignEdgePorts(edge, graph);
  });

  graph.on("node:moved", ({ node }) => {
    const edges = graph.getConnectedEdges(node);
    edges.forEach((e) => reassignEdgePorts(e, graph));
    edges.forEach((e) => {
      e.setZIndex(1000);
      e.toFront();
    });
  });

  const changeHandler = ({ node }: { node: any }) => {
    if (node?.shape === "uml-class") resizeUmlClass(node);
  };
  graph.on("node:change:attrs", changeHandler);
  graph.on("node:added", changeHandler);
  graph.on("node:change:size", changeHandler);

  graph.on("cell:removed", ({ cell }) => {
    const idCell = (cell as any)?.id || null;
    if (idCell) {
      try {
        detachNodeObservers(idCell);
      } catch {}
    }
  });

  return graph;
}

/* =================== Helpers para nodos y formularios =================== */
export function addClassAt(graph: Graph, x: number, y: number) {
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
}
export function readNodeToForm(node: any): ClassFormValues {
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
export function writeFormToNode(node: any, form: ClassFormValues) {
  node.setAttrs?.(
    {
      name: { text: form.name },
      attrs: { text: form.attributes.join("\n") },
      methods: { text: form.methods.join("\n") },
    },
    { silent: true }
  );
  node.setData?.(
    {
      ...(node.getData?.() ?? {}),
      name: form.name,
      attributes: form.attributes,
      methods: form.methods,
    },
    { overwrite: true }
  );
  resizeUmlClass(node);
}
export function readEdgeToForm(edge: any): RelationFormValues {
  const data = edge.getData?.() ?? {};
  return {
    name: String(data?.name ?? ""),
    multSource: String(data?.multSource ?? ""),
    multTarget: String(data?.multTarget ?? ""),
  };
}
export function writeFormToEdge(edge: any, form: RelationFormValues) {
  edge.setData?.(
    {
      ...(edge.getData?.() ?? {}),
      name: form.name,
      multSource: form.multSource,
      multTarget: form.multTarget,
    },
    { overwrite: true }
  );
  applyEdgeLabels(edge);
}
