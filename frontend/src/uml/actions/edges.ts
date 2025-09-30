import { Graph } from "@antv/x6";

export type EdgeShape =
  | "assoc" // asociación simple: solo línea
  | "assoc_direct" // asociación directa: línea con flecha al destino
  | "nav" // alias de asociación directa (compatibilidad)
  | "inherit"
  | "dep"
  | "comp"
  | "aggr";

const COLORS = {
  indigo: "#6366f1",
  grayText: "#475569",
  black: "#000000",
  white: "#ffffff",
};

// Para evitar dependencias de tipos que cambian entre versiones de X6
type EdgeProps = any;

function cardinalityLabel(text: string, distance: number) {
  return {
    position: { distance }, // 0..1 relativo al largo de la arista
    attrs: {
      label: {
        text,
        fill: COLORS.grayText,
        fontFamily:
          "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 11,
      },
    },
  };
}

/** Devuelve el "estilo" que queremos aplicar al edge resultante */
function buildEdgeConfig(kind: EdgeShape): EdgeProps {
  const base: EdgeProps = {
    connector: { name: "rounded" },
    router: { name: "manhattan" },
    attrs: {
      line: {
        stroke: COLORS.indigo,
        strokeWidth: 1.5,
        targetMarker: { name: "none" }, // por defecto SIN flecha
      },
    },
    labels: [] as any[], // por defecto SIN cardinalidades
  };

  switch (kind) {
    case "assoc":
      return {
        ...base,
        attrs: {
          line: {
            ...base.attrs.line,
            stroke: COLORS.black,
            targetMarker: null, // SIN flecha
          },
        },
        labels: [cardinalityLabel("1", 0.1), cardinalityLabel("1", 0.9)],
      };

    case "assoc_direct":
    case "nav":
      return {
        ...base,
        attrs: {
          line: {
            ...base.attrs.line,
            stroke: COLORS.black,
            targetMarker: {
              name: "block",
              width: 10,
              height: 10,
              fill: COLORS.black,
            },
          },
        },
        labels: [cardinalityLabel("1", 0.1), cardinalityLabel("1", 0.9)],
      };

    case "inherit":
      return {
        ...base,
        attrs: {
          line: {
            stroke: COLORS.black,
            strokeWidth: 1,
            targetMarker: {
              name: "block",
              width: 18,
              height: 12,
              fill: COLORS.white, // hueco
              stroke: COLORS.black,
            },
          },
        },
      };

    case "dep":
      return {
        ...base,
        attrs: {
          line: {
            stroke: COLORS.black,
            strokeWidth: 1,
            strokeDasharray: "5 5",
            targetMarker: {
              name: "block",
              width: 18,
              height: 12,
              fill: COLORS.white,
              stroke: COLORS.black,
            },
          },
        },
      };

    case "comp":
      return {
        ...base,
        attrs: {
          line: {
            stroke: COLORS.black,
            strokeWidth: 1,
            targetMarker: {
              name: "path",
              d: "M 0 0 L 8 6 L 0 12 L -8 6 z", // rombo sólido
              fill: COLORS.black,
              stroke: COLORS.black,
            },
          },
        },
      };

    case "aggr":
      return {
        ...base,
        attrs: {
          line: {
            stroke: COLORS.black,
            strokeWidth: 1,
            targetMarker: {
              name: "path",
              d: "M 0 0 L 8 6 L 0 12 L -8 6 z",
              fill: COLORS.white,
              stroke: COLORS.black,
            },
          },
        },
      };
  }
}

function applyEdgeStyle(edge: any, cfg: EdgeProps) {
  if (!edge) return;

  if (cfg.connector) edge.setConnector(cfg.connector);
  if (cfg.router) edge.setRouter(cfg.router);

  if (cfg.attrs?.line) {
    edge.setAttrs({ line: cfg.attrs.line });
  }

  if (Array.isArray(cfg.labels)) {
    edge.setLabels(cfg.labels);
  }
}

export function startEdgeMode(
  graph: Graph,
  kind: EdgeShape,
  onFinish?: () => void
) {
  if (!graph) return;

  const cfg = buildEdgeConfig(kind);
  let sourceNode: any = null;

  const onNodeClick = (args: any) => {
    const { node } = args;

    if (!sourceNode) {
      // Primer click: nodo origen
      sourceNode = node;
      try {
        node.addClass?.("edge-source-selected");
      } catch {}
      args.e?.stopPropagation?.();
      args.e?.preventDefault?.();
      return;
    }

    // Segundo click: nodo destino (distinto al origen)
    if (sourceNode.id !== node.id) {
      const targetNode = node;

      const edge = graph.addEdge({
        source: { cell: sourceNode.id },
        target: { cell: targetNode.id },
        ...cfg,
      });

      applyEdgeStyle(edge, cfg);

      try {
        sourceNode.removeClass?.("edge-source-selected");
      } catch {}
      args.e?.stopPropagation?.();
      args.e?.preventDefault?.();

      finish();
    }
  };

  const onBlankClick = (args: any) => {
    if (sourceNode) {
      try {
        sourceNode.removeClass?.("edge-source-selected");
      } catch {}
      sourceNode = null;
      args.e?.stopPropagation?.();
      args.e?.preventDefault?.();
      return;
    }
    finish();
  };

  const finish = () => {
    try {
      graph.off("node:click", onNodeClick);
      graph.off("blank:click", onBlankClick);
      if (sourceNode) {
        try {
          sourceNode.removeClass?.("edge-source-selected");
        } catch {}
        sourceNode = null;
      }
      onFinish?.();
    } catch (e) {
      console.error("Error en finish:", e);
    }
  };

  // Registrar handlers (¡sin namespaces!)
  graph.on("node:click", onNodeClick);
  graph.on("blank:click", onBlankClick);
}
