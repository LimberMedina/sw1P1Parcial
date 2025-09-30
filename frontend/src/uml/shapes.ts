// src/uml/shapes.ts
import { Graph } from "@antv/x6";
import { TOKENS, CLASS_SIZES } from "./tokens";

let registered = false;

export function registerShapesOnce() {
  if (registered) return;
  registered = true;

  const { WIDTH, H_NAME, H_ATTRS, H_METHODS, HEIGHT } = CLASS_SIZES;

  // === PUERTOS INVISIBLES: 5 por lado (top/right/bottom/left) ===
  const portGroups = {
    top: {
      position: "top",
      attrs: {
        circle: {
          r: 3,
          magnet: true,
          stroke: "transparent",
          fill: "transparent",
        },
      },
    },
    right: {
      position: "right",
      attrs: {
        circle: {
          r: 3,
          magnet: true,
          stroke: "transparent",
          fill: "transparent",
        },
      },
    },
    bottom: {
      position: "bottom",
      attrs: {
        circle: {
          r: 3,
          magnet: true,
          stroke: "transparent",
          fill: "transparent",
        },
      },
    },
    left: {
      position: "left",
      attrs: {
        circle: {
          r: 3,
          magnet: true,
          stroke: "transparent",
          fill: "transparent",
        },
      },
    },
  } as const;

  // 5 IDs por lado => 20 puertos por clase
  const portItems = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, group: "top" })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, group: "right" })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, group: "bottom" })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, group: "left" })),
  ];

  Graph.registerNode(
    "uml-class",
    {
      inherit: "rect",
      width: WIDTH,
      height: HEIGHT,
      markup: [
        { tagName: "rect", selector: "body" }, // marco externo
        { tagName: "rect", selector: "name-rect" },
        { tagName: "rect", selector: "attrs-rect" },
        { tagName: "rect", selector: "methods-rect" },
        { tagName: "text", selector: "name" },
        { tagName: "text", selector: "attrs" },
        { tagName: "text", selector: "methods" },
      ],
      attrs: {
        body: {
          x: 0,
          y: 0,
          refWidth: "100%",
          refHeight: "100%",
          fill: "#ffffff",
          stroke: TOKENS.headerStroke,
          strokeWidth: 2,
          rx: 8,
          ry: 8,
          magnet: true, // sólo el body será magnet (para mover)
        },
        "name-rect": {
          x: 0,
          y: 0,
          refWidth: "100%",
          height: H_NAME,
          fill: "#ffffff",
          stroke: TOKENS.headerStroke,
          strokeWidth: 2,
          rx: 8,
          ry: 8,
          magnet: "passive", // evita drag desde encabezado
        },
        "attrs-rect": {
          x: 0,
          y: H_NAME,
          refWidth: "100%",
          height: H_ATTRS,
          fill: "#ffffff",
          stroke: TOKENS.headerStroke,
          strokeWidth: 2,
          magnet: "passive",
        },
        "methods-rect": {
          x: 0,
          y: H_NAME + H_ATTRS,
          refWidth: "100%",
          height: H_METHODS,
          fill: "#ffffff",
          stroke: TOKENS.headerStroke,
          strokeWidth: 2,
          magnet: "passive",
        },
        name: {
          ref: "name-rect",
          refX: 0.5,
          refY: 0.5,
          textAnchor: "middle",
          textVerticalAnchor: "middle",
          fontFamily:
            "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 11,
          fontWeight: 700,
          fill: "#1e293b",
          text: "Class",
        },
        attrs: {
          ref: "attrs-rect",
          refX: 6,
          refY: 8,
          textAnchor: "start",
          fontFamily:
            "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 10,
          fill: "#475569",
          text: "+attribute: type",
        },
        methods: {
          ref: "methods-rect",
          refX: 6,
          refY: 8,
          textAnchor: "start",
          fontFamily:
            "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 10,
          fill: "#475569",
          text: "+method(): Return",
        },
      },
      // 👉 puertos invisibles para fan-out de aristas
      ports: { groups: portGroups as any, items: portItems },
    },
    true
  );

  // ====== (Opcional) Edges pre-registrados ======
  Graph.registerEdge(
    "uml-association",
    {
      inherit: "edge",
      attrs: { line: { stroke: TOKENS.indigo, strokeWidth: 1.5 } },
      labels: [
        {
          position: { distance: 0.1 },
          attrs: {
            text: {
              text: "1",
              fill: TOKENS.slate,
              fontFamily: "JetBrains Mono",
              fontSize: 10,
            },
          },
        },
        {
          position: { distance: 0.9 },
          attrs: {
            text: {
              text: "1",
              fill: TOKENS.slate,
              fontFamily: "JetBrains Mono",
              fontSize: 10,
            },
          },
        },
      ],
    },
    true
  );

  Graph.registerEdge(
    "uml-navigable",
    {
      inherit: "edge",
      attrs: {
        line: {
          stroke: TOKENS.indigo,
          strokeWidth: 1.5,
          targetMarker: { name: "block", width: 10, height: 8 },
        },
      },
      labels: [
        {
          position: { distance: 0.1 },
          attrs: {
            text: {
              text: "1",
              fill: TOKENS.slate,
              fontFamily: "JetBrains Mono",
              fontSize: 10,
            },
          },
        },
        {
          position: { distance: 0.9 },
          attrs: {
            text: {
              text: "1",
              fill: TOKENS.slate,
              fontFamily: "JetBrains Mono",
              fontSize: 10,
            },
          },
        },
      ],
    },
    true
  );

  Graph.registerEdge(
    "uml-inheritance",
    {
      inherit: "edge",
      attrs: {
        line: {
          stroke: TOKENS.black,
          strokeWidth: 1,
          targetMarker: {
            name: "classic",
            width: 16,
            height: 10,
            fill: "#ffffff",
          },
        },
      },
    },
    true
  );

  Graph.registerEdge(
    "uml-implementation",
    {
      inherit: "edge",
      attrs: {
        line: {
          stroke: TOKENS.black,
          strokeWidth: 1,
          strokeDasharray: 5,
          targetMarker: {
            name: "classic",
            width: 16,
            height: 10,
            fill: "#ffffff",
          },
        },
      },
    },
    true
  );

  Graph.registerEdge(
    "uml-composition",
    {
      inherit: "edge",
      attrs: {
        line: {
          stroke: TOKENS.black,
          strokeWidth: 1,
          targetMarker: {
            name: "diamond",
            width: 16,
            height: 14,
            fill: TOKENS.black,
          },
        },
      },
    },
    true
  );

  Graph.registerEdge(
    "uml-aggregation",
    {
      inherit: "edge",
      attrs: {
        line: {
          stroke: TOKENS.black,
          strokeWidth: 1,
          targetMarker: {
            name: "diamond",
            width: 16,
            height: 14,
            fill: "#ffffff",
          },
        },
      },
    },
    true
  );
}
