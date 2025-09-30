import { Graph } from "@antv/x6";
import { CLASS_SIZES, TOKENS } from "../tokens";

export type NodeKind = "class" | "interface" | "abstract";

type Pt = { x: number; y: number };

export function addUmlNode(graph: Graph, kind: NodeKind, pos?: Pt) {
  const p =
    pos ??
    graph.pageToLocal({
      x: 120 + Math.random() * 80,
      y: 120 + Math.random() * 40,
    });

  const nameText =
    kind === "interface"
      ? "<<interface>>\nInterface"
      : kind === "abstract"
      ? "<<abstract>>\nAbstract"
      : "Class";

  graph.addNode({
    shape: "uml-class",
    x: p.x,
    y: p.y,
    width: CLASS_SIZES.WIDTH,
    height: CLASS_SIZES.HEIGHT,
    attrs: {
      name: {
        text: nameText,
        fontStyle: kind === "abstract" ? "italic" : "normal",
      },
      "name-rect": { fill: "#ffffff", stroke: TOKENS.headerStroke },
      "attrs-rect": { fill: "#ffffff", stroke: TOKENS.headerStroke },
      "methods-rect": { fill: "#ffffff", stroke: TOKENS.headerStroke },
    },
  });
}

/**
 * Activa el modo “click para colocar” un nodo del tipo indicado.
 * Crea la clase en el próximo click sobre el área en blanco del lienzo.
 * Retorna un cleanup para cancelar el modo.
 */
export function startPlaceNodeMode(
  graph: Graph,
  kind: NodeKind,
  onDone?: () => void
) {
  const el = graph.container as HTMLElement;
  const prevCursor = el.style.cursor;
  el.style.cursor = "crosshair";

  const handler = ({ x, y }: { x: number; y: number }) => {
    addUmlNode(graph, kind, { x, y });
    cleanup();
    onDone?.();
  };

  graph.once("blank:click", handler);

  function cleanup() {
    el.style.cursor = prevCursor;
    graph.off("blank:click", handler as any);
  }

  return cleanup;
}
