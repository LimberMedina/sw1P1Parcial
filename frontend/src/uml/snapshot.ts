import { Graph } from "@antv/x6";

export type DiagramSnapshot = {
  nodes: any[];
  edges: any[];
  updatedAt: string;
};

export const toSnapshot = (graph: Graph): DiagramSnapshot => {
  const json = graph.toJSON();
  const cells = Array.isArray(json?.cells) ? json.cells : [];
  const nodes = cells.filter((c: any) => c && c.shape !== "edge");
  const edges = cells.filter((c: any) => c && c.shape === "edge");
  return { nodes, edges, updatedAt: new Date().toISOString() };
};

export const fromSnapshot = (graph: Graph, snap: DiagramSnapshot) => {
  if (!graph || !snap) return;

  const nodes = Array.isArray(snap.nodes) ? snap.nodes : [];
  const edges = Array.isArray(snap.edges) ? snap.edges : [];
  const cells = [...nodes, ...edges];

  const model: any = graph.model;

  // Preferencia 1: batchUpdate(name, execute, data?)
  if (model?.batchUpdate && typeof model.batchUpdate === "function") {
    try {
      if (model.batchUpdate.length >= 2) {
        // firma: (name, execute, data?)
        model.batchUpdate("load-snapshot", () => {
          graph.clearCells();
          graph.fromJSON({ cells });
        });
        return;
      } else if (model.batchUpdate.length === 1) {
        // firma antigua: (execute)  ← por si acaso
        model.batchUpdate(() => {
          graph.clearCells();
          graph.fromJSON({ cells });
        });
        return;
      }
    } catch {
      // cae a start/stopBatch o carga directa
    }
  }

  // Preferencia 2: startBatch/stopBatch
  if (
    typeof model?.startBatch === "function" &&
    typeof model?.stopBatch === "function"
  ) {
    model.startBatch("load-snapshot");
    try {
      graph.clearCells();
      graph.fromJSON({ cells });
    } finally {
      model.stopBatch("load-snapshot");
    }
    return;
  }

  // Fallback: carga directa
  graph.clearCells();
  graph.fromJSON({ cells });
};
