import React from "react";
import { IconBack } from "../icons";
import { JavaSpringGenerator } from "../codegen/JavaSpringGenerator";
import type { Graph } from "@antv/x6";
import toast from "react-hot-toast";
import JSZip from "jszip";
import { startEdgeMode } from "../actions/edges";
import type { EdgeShape } from "../actions/edges";

export type Tool =
  | "cursor"
  | "class"
  | "interface"
  | "abstract"
  // Relaciones:
  | "assoc" // Asociación
  | "nav" // Asociación directa (flecha)
  | "aggr" // Agregación (rombo vacío)
  | "comp" // Composición (rombo sólido)
  | "dep" // Dependencia (punteada + flecha)
  | "inherit"
  | "many-to-many"; // Generalización (triángulo vacío)

type Props = {
  tool: Tool;
  onToolClick: (t: Tool) => void;
  onBack: () => void;
  graph?: Graph | null;

  // Drag para crear clase
  onClassDragStart?: (e: React.DragEvent) => void;
};

function IconAssociation({ className = "h-4 w-4" }: { className?: string }) {
  // Línea en L
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 18V6M4 6H16" />
    </svg>
  );
}

function IconDirectedAssociation({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  // Línea con flecha al final
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 12H18" />
      <path d="M18 12l-4-3m4 3l-4 3" fill="currentColor" />
    </svg>
  );
}

function IconAggregation({ className = "h-4 w-4" }: { className?: string }) {
  // Rombo vacío
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 12l4-4 4 4-4 4-4-4z" />
      <path d="M14 12H20" />
    </svg>
  );
}

function IconComposition({ className = "h-4 w-4" }: { className?: string }) {
  // Rombo sólido
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 12l4-4 4 4-4 4-4-4z" />
      <path d="M14 12H20" fill="none" />
    </svg>
  );
}

function IconDependency({ className = "h-4 w-4" }: { className?: string }) {
  // Línea punteada + flecha
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 12h10" strokeDasharray="4 3" />
      <path d="M18 12l-4-3m4 3l-4 3" />
    </svg>
  );
}

function IconGeneralization({ className = "h-4 w-4" }: { className?: string }) {
  // Triángulo vacío (hollow)
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M18 12l-6-4-6 4 6 4 6-4z" fill="white" />
      <path d="M6 12H4" />
    </svg>
  );
}

function IconManyToMany({ className = "h-4 w-4" }: { className?: string }) {
  // Dos líneas con una clase intermedia
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      {/* Línea izquierda */}
      <path d="M2 12H8" />
      {/* Clase intermedia (rectángulo pequeño) */}
      <rect
        x="8"
        y="9"
        width="8"
        height="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
      {/* Línea derecha */}
      <path d="M16 12H22" />
      {/* Multiplicidades */}
      <circle cx="4" cy="10" r="1" fill="currentColor" />
      <text x="4" y="15" fontSize="8" textAnchor="middle" fill="currentColor">
        *
      </text>
      <circle cx="20" cy="10" r="1" fill="currentColor" />
      <text x="20" y="15" fontSize="8" textAnchor="middle" fill="currentColor">
        *
      </text>
    </svg>
  );
}

/* ========= Auxiliares de saneamiento / normalización ========= */
function sanitizeIdentifier(raw: unknown, fallback: string): string {
  let s = String(raw ?? "").trim();
  if (!s) return fallback;
  // Reemplaza espacios y caracteres no válidos por '_'
  s = s.replace(/[^\p{L}\p{N}_$]/gu, "_");
  // No iniciar con dígito
  if (/^\d/.test(s)) s = "_" + s;
  return s;
}

function coerceArrayOfLines(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? "").trim()).filter(Boolean);
  }
  return String(value ?? "")
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
}

/* ======= Parseo de métodos (lo mantengo) ======= */
function parseMethod(methodStr: string) {
  const regex =
    /([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)\s*:\s*([a-zA-Z_][a-zA-Z0-9_<>]*)/;
  const match = methodStr.match(regex);
  if (match) {
    return {
      nombre: match[1],
      parametros: match[2].split(",").map((p) => p.trim()),
      tipoRetorno: match[3],
    };
  }
  return null;
}

/* ======= Mapeo tipos de relación UML -> JPA ======= */
function mapearTipoRelacion(
  tipo: string
): "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_ONE" | "MANY_TO_MANY" {
  switch (tipo) {
    case "comp":
      return "ONE_TO_ONE";
    case "aggr":
      return "ONE_TO_MANY";
    case "assoc":
      return "MANY_TO_MANY";
    case "dep":
      return "MANY_TO_ONE";
    case "inherit":
      return "ONE_TO_ONE"; // la herencia se maneja aparte
    default:
      return "MANY_TO_ONE";
  }
}

export default function Sidebar({
  tool,
  onToolClick,
  onBack,
  graph,
  onClassDragStart,
}: Props) {
  const handleRelationTool = (relationTool: Tool) => {
    if (!graph) return;

    // Manejar many-to-many de forma especial
    if (relationTool === "many-to-many") {
      // Activar modo especial para muchos a muchos
      startManyToManyMode(graph, () => {
        onToolClick("cursor"); // Volver al cursor
      });
      onToolClick(relationTool);
      return;
    }

    const toolToEdgeShape: Record<string, EdgeShape> = {
      assoc: "assoc",
      nav: "nav",
      aggr: "aggr",
      comp: "comp",
      dep: "dep",
      inherit: "inherit",
    };

    const edgeShape = toolToEdgeShape[relationTool];
    if (edgeShape) {
      // Usar startEdgeMode SOLO cuando se presiona el botón
      startEdgeMode(graph, edgeShape, () => {
        onToolClick("cursor"); // Volver al cursor
      });

      // Actualizar UI
      onToolClick(relationTool);
    }
  };

  function startManyToManyMode(graph: Graph, onComplete: () => void) {
    let selectedNodes: any[] = [];

    const handleNodeClick = ({ node }: { node: any }) => {
      selectedNodes.push(node);

      // Resaltar nodo seleccionado
      graph.cleanSelection();
      selectedNodes.forEach((n) => graph.select(n));

      if (selectedNodes.length === 2) {
        // Crear relación muchos a muchos
        createManyToManyRelation(graph, selectedNodes[0], selectedNodes[1]);

        // Limpiar y terminar
        graph.cleanSelection();
        graph.off("node:click", handleNodeClick);
        selectedNodes = [];
        onComplete();
      }
    };

    graph.on("node:click", handleNodeClick);
  }

  function createManyToManyRelation(graph: Graph, node1: any, node2: any) {
    // Obtener centros de los nodos
    const center1 = node1.getBBox().center;
    const center2 = node2.getBBox().center;

    // Calcular posición de la clase intermedia
    const midX = (center1.x + center2.x) / 2;
    const midY = (center1.y + center2.y) / 2;

    // Calcular vector perpendicular para posicionar la clase intermedia
    const dx = center2.x - center1.x;
    const dy = center2.y - center1.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    // Vector perpendicular normalizado
    const perpX = length > 0 ? -dy / length : 0;
    const perpY = length > 0 ? dx / length : 1;

    // Distancia de separación de la clase intermedia
    const offset = 100;
    const intermediateX = midX + perpX * offset;
    const intermediateY = midY + perpY * offset;

    // Crear clase intermedia
    const intermediateName = `${node1.getData()?.name || "Class1"}${
      node2.getData()?.name || "Class2"
    }`;

    const intermediateNode = graph.addNode({
      shape: "uml-class",
      x: intermediateX - 90,
      y: intermediateY - 60,
      width: 180,
      height: 120,
      attrs: {
        name: { text: intermediateName },
        attrs: {
          text: `id: Long\n${
            node1.getData()?.name?.toLowerCase() || "class1"
          }Id: Long\n${
            node2.getData()?.name?.toLowerCase() || "class2"
          }Id: Long`,
        },
        methods: { text: "" },
      },
      zIndex: 2,
      data: {
        name: intermediateName,
        attributes: [
          "id: Long",
          `${node1.getData()?.name?.toLowerCase() || "class1"}Id: Long`,
          `${node2.getData()?.name?.toLowerCase() || "class2"}Id: Long`,
        ],
        methods: [],
        // *** MARCAR COMO RELACIÓN MUCHOS A MUCHOS ***
        isManyToManyTable: true,
        relatedNodes: [node1.id, node2.id],
      },
    });

    // 1. Crear relación principal directa entre node1 y node2
    const mainEdge = graph.addEdge({
      attrs: {
        line: {
          stroke: "#7C3AED",
          strokeWidth: 2,
          targetMarker: null,
          sourceMarker: null,
        },
      },
      zIndex: 1000,
      router: { name: "normal" },
      connector: { name: "normal" },
      source: { cell: node1.id },
      target: { cell: node2.id },
      data: {
        name: "many-to-many",
        multSource: "*",
        multTarget: "*",
        // *** DATOS PARA PERSISTENCIA ***
        intermediateNodeId: intermediateNode.id,
        isManyToManyRelation: true,
      },
    });

    // 2. Crear nodos de conexión INVISIBLES en cada arista de la clase intermedia
    const bbox = intermediateNode.getBBox();

    // Nodo superior (INVISIBLE)
    const topConnectionNode = graph.addNode({
      shape: "circle",
      x: bbox.x + bbox.width / 2 - 1,
      y: bbox.y - 1,
      width: 2,
      height: 2,
      attrs: {
        body: {
          fill: "transparent", // *** INVISIBLE ***
          stroke: "transparent",
          strokeWidth: 0,
        },
      },
      zIndex: 1003,
      data: { isConnectionNode: true, parentId: intermediateNode.id },
    });

    // Nodo inferior (INVISIBLE)
    const bottomConnectionNode = graph.addNode({
      shape: "circle",
      x: bbox.x + bbox.width / 2 - 1,
      y: bbox.y + bbox.height - 1,
      width: 2,
      height: 2,
      attrs: {
        body: {
          fill: "transparent",
          stroke: "transparent",
          strokeWidth: 0,
        },
      },
      zIndex: 1003,
      data: { isConnectionNode: true, parentId: intermediateNode.id },
    });

    // Nodo izquierdo (INVISIBLE)
    const leftConnectionNode = graph.addNode({
      shape: "circle",
      x: bbox.x - 1,
      y: bbox.y + bbox.height / 2 - 1,
      width: 2,
      height: 2,
      attrs: {
        body: {
          fill: "transparent",
          stroke: "transparent",
          strokeWidth: 0,
        },
      },
      zIndex: 1003,
      data: { isConnectionNode: true, parentId: intermediateNode.id },
    });

    // Nodo derecho (INVISIBLE)
    const rightConnectionNode = graph.addNode({
      shape: "circle",
      x: bbox.x + bbox.width - 1,
      y: bbox.y + bbox.height / 2 - 1,
      width: 2,
      height: 2,
      attrs: {
        body: {
          fill: "transparent",
          stroke: "transparent",
          strokeWidth: 0,
        },
      },
      zIndex: 1003,
      data: { isConnectionNode: true, parentId: intermediateNode.id },
    });

    const connectionNodes = [
      topConnectionNode,
      bottomConnectionNode,
      leftConnectionNode,
      rightConnectionNode,
    ];

    // 3. Crear punto visual en el punto medio de la línea principal (INVISIBLE)
    const midPointMarker = graph.addNode({
      shape: "circle",
      x: midX - 1,
      y: midY - 1,
      width: 2,
      height: 2,
      attrs: {
        body: {
          fill: "transparent", // *** INVISIBLE ***
          stroke: "transparent",
          strokeWidth: 0,
        },
      },
      zIndex: 1002,
      data: {
        isMidPointMarker: true,
        mainEdgeId: mainEdge.id,
        relatedNodes: [node1.id, node2.id],
      },
    });

    // 4. Función para encontrar el nodo de conexión más cercano
    function getClosestConnectionNode(fromX: number, fromY: number) {
      let closestNode = connectionNodes[0];
      let minDistance = Number.MAX_VALUE;

      connectionNodes.forEach((node) => {
        const nodePos = node.getPosition();
        const distance = Math.sqrt(
          Math.pow(nodePos.x + 1 - fromX, 2) +
            Math.pow(nodePos.y + 1 - fromY, 2)
        );
        if (distance < minDistance) {
          minDistance = distance;
          closestNode = node;
        }
      });

      return closestNode;
    }

    // 5. Crear línea perpendicular inicial
    const initialClosestNode = getClosestConnectionNode(midX, midY);
    let perpendicularEdge = graph.addEdge({
      attrs: {
        line: {
          stroke: "#7C3AED",
          strokeWidth: 2,
          targetMarker: null,
          sourceMarker: null,
          strokeDasharray: "5,5",
        },
      },
      zIndex: 1000,
      router: { name: "normal" },
      connector: { name: "normal" },
      source: { cell: midPointMarker.id },
      target: { cell: initialClosestNode.id },
      data: {
        name: "",
        multSource: "",
        multTarget: "",
        // *** DATOS PARA PERSISTENCIA ***
        isPerpendicularEdge: true,
        mainEdgeId: mainEdge.id,
        intermediateNodeId: intermediateNode.id,
      },
    });

    // 6. Función mejorada para actualizar posiciones
    const updatePositions = () => {
      try {
        // Verificar que los nodos aún existen
        const currentNode1 = graph.getCellById(node1.id);
        const currentNode2 = graph.getCellById(node2.id);

        if (!currentNode1 || !currentNode2) return;

        // Recalcular centros
        const newCenter1 = currentNode1.getBBox().center;
        const newCenter2 = currentNode2.getBBox().center;
        const newMidX = (newCenter1.x + newCenter2.x) / 2;
        const newMidY = (newCenter1.y + newCenter2.y) / 2;

        // Actualizar posición del marcador del punto medio
        if (graph.getCellById(midPointMarker.id)) {
          midPointMarker.setPosition(newMidX - 1, newMidY - 1);
        }

        // Recalcular posición perpendicular de la clase intermedia
        const newDx = newCenter2.x - newCenter1.x;
        const newDy = newCenter2.y - newCenter1.y;
        const newLength = Math.sqrt(newDx * newDx + newDy * newDy);

        if (newLength > 0) {
          const newPerpX = -newDy / newLength;
          const newPerpY = newDx / newLength;

          const newIntermediateX = newMidX + newPerpX * offset;
          const newIntermediateY = newMidY + newPerpY * offset;

          // Actualizar posición de la clase intermedia
          if (graph.getCellById(intermediateNode.id)) {
            intermediateNode.setPosition(
              newIntermediateX - 90,
              newIntermediateY - 60
            );
            updateConnectionNodesPositions();
          }

          // Encontrar el nodo de conexión más cercano al punto medio
          const closestNode = getClosestConnectionNode(newMidX, newMidY);

          // Si cambió el nodo más cercano, actualizar la conexión
          if (graph.getCellById(perpendicularEdge.id)) {
            const currentTarget = perpendicularEdge.getTargetCell();
            if (currentTarget && currentTarget.id !== closestNode.id) {
              perpendicularEdge.setTarget({ cell: closestNode.id });
            }
          }
        }
      } catch (error) {
        console.log("Error updating positions:", error);
      }
    };

    // 7. Función para actualizar posiciones de nodos de conexión
    const updateConnectionNodesPositions = () => {
      try {
        const newBbox = intermediateNode.getBBox();

        if (graph.getCellById(topConnectionNode.id)) {
          topConnectionNode.setPosition(
            newBbox.x + newBbox.width / 2 - 1,
            newBbox.y - 1
          );
        }
        if (graph.getCellById(bottomConnectionNode.id)) {
          bottomConnectionNode.setPosition(
            newBbox.x + newBbox.width / 2 - 1,
            newBbox.y + newBbox.height - 1
          );
        }
        if (graph.getCellById(leftConnectionNode.id)) {
          leftConnectionNode.setPosition(
            newBbox.x - 1,
            newBbox.y + newBbox.height / 2 - 1
          );
        }
        if (graph.getCellById(rightConnectionNode.id)) {
          rightConnectionNode.setPosition(
            newBbox.x + newBbox.width - 1,
            newBbox.y + newBbox.height / 2 - 1
          );
        }
      } catch (error) {
        console.log("Error updating connection nodes:", error);
      }
    };

    // 8. Función para actualizar cuando se mueva la clase intermedia manualmente
    const updateConnectionNodesOnIntermediateMove = () => {
      updateConnectionNodesPositions();

      // Actualizar conexión al nodo más cercano
      try {
        const midPos = midPointMarker.getPosition();
        const closestNode = getClosestConnectionNode(
          midPos.x + 1,
          midPos.y + 1
        );
        if (graph.getCellById(perpendicularEdge.id)) {
          perpendicularEdge.setTarget({ cell: closestNode.id });
        }
      } catch (error) {
        console.log("Error updating intermediate move:", error);
      }
    };

    // 9. Event listeners con verificación de existencia
    const setupEventListeners = () => {
      try {
        if (graph.getCellById(node1.id)) {
          node1.on("change:position", updatePositions);
        }
        if (graph.getCellById(node2.id)) {
          node2.on("change:position", updatePositions);
        }
        if (graph.getCellById(intermediateNode.id)) {
          intermediateNode.on(
            "change:position",
            updateConnectionNodesOnIntermediateMove
          );
        }
      } catch (error) {
        console.log("Error setting up event listeners:", error);
      }
    };

    // Configurar event listeners después de un pequeño delay
    setTimeout(setupEventListeners, 100);

    // Aplicar estilos y etiquetas
    [mainEdge, perpendicularEdge].forEach((edge) => {
      edge.setZIndex(1000);
      edge.toFront();
    });

    // Aplicar etiquetas solo a la relación principal
    mainEdge.setLabels([
      {
        position: 0.1,
        attrs: {
          text: {
            text: "*",
            fontSize: 12,
            fill: "#7C3AED",
            fontWeight: "bold",
          },
        },
      },
      {
        position: 0.9,
        attrs: {
          text: {
            text: "*",
            fontSize: 12,
            fill: "#7C3AED",
            fontWeight: "bold",
          },
        },
      },
    ]);

    toast.success(`Relación muchos a muchos creada: ${intermediateName}`);
  }

  const handleGenerateCode = async () => {
    try {
      if (!graph) {
        toast.error("Error: No se pudo acceder al diagrama");
        return;
      }

      // ===== Clases (normalizadas a lo que espera el generador) =====
      const clases = graph.getNodes().map((nodo: any, idx: number) => {
        const data = nodo.getData?.() ?? {};

        // nombre de clase seguro
        const rawName = data.name || `Clase_${idx + 1}`;
        const className = sanitizeIdentifier(rawName, `Clase_${idx + 1}`);

        // atributos: convertir a strings "nombre: Tipo"
        const rawAttrs = coerceArrayOfLines(data.attributes);
        const attributes = rawAttrs
          .map((line, i) => {
            // soporta "a: int" o "a" (sin tipo => String)
            const [n, t] = String(line).split(":");
            const nombre = sanitizeIdentifier(n, `campo_${i + 1}`);
            const tipo = String(t ?? "String").trim() || "String";
            return `${nombre}: ${tipo}`;
          })
          .filter(Boolean);

        // métodos: convertir a strings "metodo(a: T): R"
        const rawMethods = coerceArrayOfLines(data.methods);
        const methods = rawMethods
          .map((m) => {
            const parsed = parseMethod(m);
            if (parsed) {
              const metodo = sanitizeIdentifier(parsed.nombre, "metodo");
              const params = parsed.parametros
                .map((p, k) => {
                  // soporta "x: T" o "x"
                  const [pn, pt] = p.split(":");
                  const pName = sanitizeIdentifier(pn, `p${k + 1}`);
                  const pType = String(pt ?? "String").trim() || "String";
                  return `${pName}: ${pType}`;
                })
                .join(", ");
              const ret = String(parsed.tipoRetorno || "void").trim();
              return `${metodo}(${params}): ${ret}`;
            }
            // si el usuario ya escribió en formato correcto, lo dejamos
            return m;
          })
          .filter(Boolean);

        return {
          // IMPORTANTE: claves en inglés como espera el generador
          name: String(className),
          attributes,
          methods,
          isAbstract: !!data.isAbstract,
          isInterface: !!data.isInterface,
        };
      });

      if (!clases.length) {
        toast.error("No hay clases en el diagrama");
        return;
      }

      // ===== Relaciones (con campos en inglés) =====
      const relaciones = graph.getEdges().map((edge: any) => {
        const data = edge.getData?.() ?? {};
        const source =
          sanitizeIdentifier(
            edge.getSourceCell?.()?.getData?.()?.name,
            "Source"
          ) || "Source";
        const target =
          sanitizeIdentifier(
            edge.getTargetCell?.()?.getData?.()?.name,
            "Target"
          ) || "Target";

        const edgeType = mapearTipoRelacion(edge.shape || data.type);

        return {
          source,
          target,
          type: edgeType,
          bidirectional: !!data.bidirectional,
          // datos extra por si tu generador los usa
          sourceMultiplicity: String(data.sourceMultiplicity || "").trim(),
          targetMultiplicity: String(data.targetMultiplicity || "").trim(),
          name: String(data.name || "").trim(),
          navigationProperty: String(data.navigationProperty || "").trim(),
        };
      });

      // ===== Crear generador y cargar estructuras =====
      const generator = new JavaSpringGenerator("com.example");
      clases.forEach((cls) => generator.addClass(cls));
      relaciones.forEach((rel) => generator.addRelation(rel));

      // ===== Generar archivos =====
      const files = generator.generateAll();

      // ===== Empaquetar ZIP =====
      const zip = new JSZip();

      // Config
      zip.file("pom.xml", generatePomXml());
      zip.file(
        "src/main/resources/application.properties",
        generateApplicationProperties()
      );

      const srcMainJava = zip.folder("src/main/java/com/example")!;
      srcMainJava.file("Application.java", generateApplicationClass());

      const modelFolder = srcMainJava.folder("model")!;
      const dtoFolder = srcMainJava.folder("dto")!;
      const repoFolder = srcMainJava.folder("repository")!;
      const serviceFolder = srcMainJava.folder("service")!;
      const controllerFolder = srcMainJava.folder("controller")!;

      Object.entries(files).forEach(([filename, content]) => {
        const text = String(content ?? "");
        if (filename.endsWith("DTO.java")) {
          dtoFolder.file(filename, text);
        } else if (filename.includes("Repository")) {
          repoFolder.file(filename, text);
        } else if (filename.includes("Service")) {
          serviceFolder.file(filename, text);
        } else if (filename.includes("Controller")) {
          controllerFolder.file(filename, text);
        } else {
          modelFolder.file(filename, text);
        }
      });

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "spring-boot-project.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("¡Proyecto Spring Boot generado exitosamente!");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al generar el proyecto");
    }
  };

  // ======= Auxiliares POM / properties / Application.java =======
  function generatePomXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.1.0</version>
    </parent>
    
    <groupId>com.example</groupId>
    <artifactId>spring-boot-project</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    
    <properties>
        <java.version>17</java.version>
    </properties>
    
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>org.modelmapper</groupId>
            <artifactId>modelmapper</artifactId>
            <version>3.1.1</version>
        </dependency>
    </dependencies>
    
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>`;
  }

  function generateApplicationProperties(): string {
    return `# Database Configuration
spring.datasource.url=jdbc:postgresql://localhost:5432/mydb
spring.datasource.username=postgres
spring.datasource.password=postgres
spring.datasource.driver-class-name=org.postgresql.Driver

# JPA Configuration
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect

# Server Configuration
server.port=8080
`;
  }

  function generateApplicationClass(): string {
    return `package com.example;

import org.modelmapper.ModelMapper;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
    
    @Bean
    public ModelMapper modelMapper() {
        return new ModelMapper();
    }
}`;
  }

  const relationButtons: Array<{
    key: Tool;
    label: string;
    Icon: React.FC<{ className?: string }>;
  }> = [
    { key: "assoc", label: "Asociación", Icon: IconAssociation },
    { key: "nav", label: "Asociación directa", Icon: IconDirectedAssociation },
    { key: "aggr", label: "Agregación", Icon: IconAggregation },
    { key: "comp", label: "Composición", Icon: IconComposition },
    { key: "dep", label: "Dependencia", Icon: IconDependency },
    { key: "inherit", label: "Generalización", Icon: IconGeneralization },
    { key: "many-to-many", label: "Muchos a Muchos", Icon: IconManyToMany },
  ];

  return (
    <aside className="w-80 border-r border-gray-200 bg-white p-6 hidden md:flex md:flex-col">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-xl p-2 text-gray-600 hover:bg-gray-100"
        >
          <IconBack className="h-5 w-5" />
        </button>
        <div>
          <div className="text-xs font-bold text-gray-400">UML</div>
          <div className="text-base font-semibold leading-tight text-gray-900">
            CLASS DIAGRAM
          </div>
          <div className="text-sm font-semibold text-indigo-600">EDITOR</div>
        </div>
      </div>

      <div className="mt-2 flex-1 space-y-6 overflow-y-auto pr-2">
        {/* Elements */}
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <span className="inline-block h-4 w-4 rounded border border-gray-300" />
            Elementos
          </h3>
          <div className="space-y-2">
            {/* Botón 'Clase' con click-to-place y handle interno para drag */}
            <button
              onClick={() => onToolClick("class")}
              aria-pressed={tool === "class"}
              className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-medium ${
                tool === "class"
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
              title="Clic para colocar en el lienzo • Arrastra el handle para soltar en el lienzo"
            >
              <div className="flex items-center justify-between">
                <span>Clase (clic o arrastrar)</span>
                <span
                  role="button"
                  aria-label="Arrastrar Clase"
                  draggable
                  onDragStart={onClassDragStart}
                  className="cursor-grab select-none rounded border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                  title="Arrastra desde aquí"
                >
                  ⋮⋮
                </span>
              </div>
            </button>
          </div>
        </section>

        {/* Relationships */}
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <span className="inline-block h-4 w-4 border-b-2 border-gray-400" />
            Relaciones
          </h3>
          <div className="space-y-2">
            {relationButtons.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => handleRelationTool(key)}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-medium hover:bg-gray-50 ${
                  tool === key
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 text-gray-800"
                }`}
              >
                <span className="flex items-center gap-2">
                  {/* Icono en el mismo color que las clases */}
                  <Icon className="h-4 w-4 text-indigo-600" />
                  <span>{label}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Code Generation */}
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <span className="inline-block h-4 w-4 border-2 border-indigo-400" />
            Code Generation
          </h3>
          <div className="space-y-2">
            <button
              onClick={handleGenerateCode}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              title="Generar código Spring Boot"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
              Generar Código Spring Boot
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}

// Agregar al final del archivo, ANTES del export default:

export function reconnectManyToManyRelations(graph: Graph) {
  // Buscar todas las relaciones muchos a muchos al cargar
  const manyToManyEdges = graph
    .getEdges()
    .filter((edge) => edge.getData()?.isManyToManyRelation);

  manyToManyEdges.forEach((mainEdge) => {
    const edgeData = mainEdge.getData();
    const intermediateNodeId = edgeData?.intermediateNodeId;

    if (intermediateNodeId) {
      const intermediateNode = graph.getCellById(intermediateNodeId);
      const sourceNode = mainEdge.getSourceCell();
      const targetNode = mainEdge.getTargetCell();

      if (intermediateNode && sourceNode && targetNode) {
        // Buscar la línea perpendicular
        const perpendicularEdge = graph
          .getEdges()
          .find(
            (edge) =>
              edge.getData()?.isPerpendicularEdge &&
              edge.getData()?.mainEdgeId === mainEdge.id
          );

        if (perpendicularEdge) {
          // Buscar el marcador del punto medio
          const midPointMarker = graph
            .getNodes()
            .find(
              (node) =>
                node.getData()?.isMidPointMarker &&
                node.getData()?.mainEdgeId === mainEdge.id
            );

          if (midPointMarker) {
            // Reconfigurar event listeners
            const updatePositions = () => {
              const center1 = sourceNode.getBBox().center;
              const center2 = targetNode.getBBox().center;
              const newMidX = (center1.x + center2.x) / 2;
              const newMidY = (center1.y + center2.y) / 2;

              (midPointMarker as any).setPosition(newMidX - 1, newMidY - 1);

              // Actualizar posición de la clase intermedia
              const dx = center2.x - center1.x;
              const dy = center2.y - center1.y;
              const length = Math.sqrt(dx * dx + dy * dy);

              if (length > 0) {
                const perpX = -dy / length;
                const perpY = dx / length;
                const offset = 100;

                const newIntermediateX = newMidX + perpX * offset;
                const newIntermediateY = newMidY + perpY * offset;

                (intermediateNode as any).setPosition(
                  newIntermediateX - 90,
                  newIntermediateY - 60
                );
              }
            };

            (sourceNode as any).on("change:position", updatePositions);
            (targetNode as any).on("change:position", updatePositions);
          }
        }
      }
    }
  });
}
