import { useState, useRef, useEffect } from "react";
import {
  Bot,
  X,
  Send,
  Sparkles,
  Lightbulb,
  CheckCircle,
  Eye,
} from "lucide-react";
import toast from "react-hot-toast";
import { Graph } from "@antv/x6";

// Importa el tipo Tool real desde tu Sidebar
import type { Tool } from "./Sidebar";

interface AIMessage {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: Date;
  suggestions?: {
    classes?: Array<{ name: string; attributes: string[]; methods: string[] }>;
    relations?: Array<{ from: string; to: string; type: string }>;
  };
  tips?: string[];
  nextSteps?: string[];
  contextualHelp?: {
    action: string;
    description: string;
    shortcut?: string;
    priority: "high" | "medium" | "low";
  }[];
}

interface AIAssistantProps {
  graph: Graph | null;
  onAddClass: (
    className: string,
    attributes: string[],
    methods: string[]
  ) => void;
  onAddRelation: (from: string, to: string, type: string) => void; // type usa keys del editor: "assoc" | "inherit" | ...
  onToolChange?: (tool: Tool) => void;
  currentTool?: Tool;
  canEdit?: boolean;
  backendUrl?: string; // opcional; si no, usa ruta relativa
}

export default function AIAssistant({
  graph,
  onAddClass,
  onAddRelation,
  onToolChange,
  currentTool,
  canEdit = true,
  backendUrl = "/api/ai/asistente",
}: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [contextualSuggestion, setContextualSuggestion] = useState<
    string | null
  >(null);
  const [diagramAnalysis, setDiagramAnalysis] = useState<any>(null);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // -------------------- ANALISIS DEL DIAGRAMA --------------------
  const analyzeDiagramState = () => {
    if (!graph)
      return {
        hasClasses: false,
        classCount: 0,
        hasRelations: false,
        relationCount: 0,
        hasEmptyClasses: false,
        hasUnconnectedClasses: false,
        needsMoreDetail: false,
        isWellStructured: false,
        classNames: [] as string[],
      };

    const nodes = graph.getNodes();
    const edges = graph.getEdges();

    const hasEmptyClasses = nodes.some((node) => {
      const data = node.getData();
      return (
        (!data?.attributes || data.attributes.length === 0) &&
        (!data?.methods || data.methods.length === 0)
      );
    });

    const hasUnconnectedClasses = nodes.some(
      (node) =>
        !edges.some(
          (edge) =>
            edge.getSourceCellId() === node.id ||
            edge.getTargetCellId() === node.id
        )
    );

    const needsMoreDetail = nodes.some((node) => {
      const d = node.getData() || {};
      const a = (d.attributes || []) as string[];
      const m = (d.methods || []) as string[];
      return a.length < 2 && m.length < 1;
    });

    const classNames = nodes
      .map((n) => n.getData()?.name || "Unnamed")
      .filter(Boolean);

    return {
      hasClasses: nodes.length > 0,
      classCount: nodes.length,
      hasRelations: edges.length > 0,
      relationCount: edges.length,
      hasEmptyClasses,
      hasUnconnectedClasses,
      needsMoreDetail,
      isWellStructured:
        nodes.length >= 3 && edges.length >= 2 && !hasEmptyClasses,
      classNames,
    };
  };

  // -------------------- CONTEXTO PARA BACKEND --------------------
  const getDiagramContext = () => {
    if (!graph) return { nodes: [], edges: [] };

    const nodes = graph.getNodes().map((node) => {
      const data = node.getData() || {};
      return {
        id: node.id,
        name: data.name || "Unnamed",
        attributes: data.attributes || [],
        methods: data.methods || [],
        position: node.position(),
        shape: node.shape,
      };
    });

    const edges = graph.getEdges().map((edge) => ({
      id: edge.id,
      source: edge.getSourceCellId(),
      target: edge.getTargetCellId(),
      // usa el tipo guardado en data; si no, ‘assoc’ por defecto
      type: edge.getData()?.type || "assoc",
      labels:
        edge
          .getLabels()
          ?.map((l: any) => l?.attrs?.text?.text)
          .filter(Boolean) || [],
    }));

    return { nodes, edges };
  };

  // -------------------- MENSAJE INICIAL --------------------
  const getInitialMessage = (): AIMessage => {
    if (!canEdit) {
      return {
        id: "readonly-welcome",
        type: "assistant",
        content:
          "¡Hola! 👋 Estás en modo solo lectura. Puedo analizar el diagrama y explicar conceptos UML.",
        timestamp: new Date(),
        contextualHelp: [
          {
            action: "analyze_diagram",
            description: "Analizar el diagrama actual",
            shortcut: "Te explico qué representa este diseño",
            priority: "high",
          },
          {
            action: "explain_concepts",
            description: "Explicar tipos de relaciones",
            shortcut: "Asociación, herencia, composición, etc.",
            priority: "medium",
          },
        ],
        tips: ["🔍 Puedo analizar y explicar el diagrama actual"],
      };
    }

    const analysis = analyzeDiagramState();

    if (!analysis.hasClasses) {
      return {
        id: "welcome",
        type: "assistant",
        content: "¡Hola! 👋 Tu diagrama está vacío. Te ayudo a comenzar.",
        timestamp: new Date(),
        contextualHelp: [
          {
            action: "create_first_class",
            description: "Crear tu primera clase",
            shortcut: "Activa la herramienta 'Clase' y haz clic en el canvas",
            priority: "high",
          },
          {
            action: "describe_system",
            description: "Describir tu sistema para generar clases",
            shortcut: "Ej: 'Quiero un sistema de biblioteca'",
            priority: "high",
          },
        ],
        tips: [
          "💡 Comienza con 2–3 entidades principales",
          "🎯 Piensa en sustantivos clave del dominio",
        ],
        nextSteps: [
          "1) Crea 2–3 clases",
          "2) Agrega atributos",
          "3) Conéctalas",
        ],
      };
    }

    if (!analysis.hasRelations && analysis.classCount >= 2) {
      return {
        id: "need-relations",
        type: "assistant",
        content: `Tienes ${analysis.classCount} clases pero sin relaciones. ¡Conectémoslas!`,
        timestamp: new Date(),
        contextualHelp: [
          {
            action: "create_association",
            description: "Crear asociación",
            shortcut: "Herramienta 'Asociación' → origen → destino",
            priority: "high",
          },
          {
            action: "create_inheritance",
            description: "Crear herencia",
            shortcut: "Hija → Padre",
            priority: "medium",
          },
          {
            action: "create_composition",
            description: "Crear composición",
            shortcut: "Contenedor → Contenido",
            priority: "medium",
          },
        ],
      };
    }

    return {
      id: "general-welcome",
      type: "assistant",
      content:
        "¡Hola! Soy tu asistente UML. Puedo crear clases, sugerir relaciones o analizar el diseño. ¿Qué necesitas?",
      timestamp: new Date(),
    };
  };

  const [messages, setMessages] = useState<AIMessage[]>([getInitialMessage()]);

  // -------------------- SUGERENCIAS CONTEXTUALES EN VIVO --------------------
  useEffect(() => {
    if (!graph) return;

    const updateContextualHelp = () => {
      const analysis = analyzeDiagramState();
      setDiagramAnalysis(analysis);

      if (!analysis.hasClasses)
        setContextualSuggestion("💡 Crea tu primera clase");
      else if (analysis.hasEmptyClasses)
        setContextualSuggestion("💡 Agrega atributos/métodos");
      else if (!analysis.hasRelations && analysis.classCount >= 2)
        setContextualSuggestion("💡 Conecta tus clases con relaciones");
      else if (analysis.isWellStructured)
        setContextualSuggestion("🚀 Genera el código backend");
      else setContextualSuggestion(null);
    };

    graph.on("node:added", updateContextualHelp);
    graph.on("node:removed", updateContextualHelp);
    graph.on("edge:added", updateContextualHelp);
    graph.on("edge:removed", updateContextualHelp);
    graph.on("node:change:data", updateContextualHelp);
    graph.on("edge:change:labels", updateContextualHelp);

    updateContextualHelp();

    return () => {
      graph.off("node:added", updateContextualHelp);
      graph.off("node:removed", updateContextualHelp);
      graph.off("edge:added", updateContextualHelp);
      graph.off("edge:removed", updateContextualHelp);
      graph.off("node:change:data", updateContextualHelp);
      graph.off("edge:change:labels", updateContextualHelp);
    };
  }, [graph]);

  // -------------------- ACCIONES RAPIDAS (activan herramientas) --------------------
  const handleContextualAction = (action: string) => {
    if (!canEdit) {
      toast.error("No tienes permisos para editar este diagrama");
      return;
    }

    switch (action) {
      case "create_first_class":
        onToolChange?.("class");
        toast("🎯 Herramienta 'Clase' activada. Haz clic en el lienzo.");
        break;
      case "create_association":
        onToolChange?.("assoc");
        toast("🔗 Herramienta 'Asociación' activada. Origen → Destino");
        break;
      case "create_inheritance":
        onToolChange?.("inherit");
        toast("🏗️ Herramienta 'Herencia' activada. Hija → Padre");
        break;
      case "create_composition":
        onToolChange?.("comp");
        toast("💎 Herramienta 'Composición' activada. Contenedor → Contenido");
        break;
      case "analyze_diagram": {
        const analysis = analyzeDiagramState();
        setInputValue(
          `Analiza mi diagrama: ${analysis.classCount} clases, ${analysis.relationCount} relaciones`
        );
        break;
      }
      case "describe_system":
        setInputValue("");
        toast(
          "💡 Describe tu sistema: 'Quiero un sistema de biblioteca', etc."
        );
        break;
      default:
        setInputValue(action);
        break;
    }
  };

  // -------------------- ENVIAR MENSAJE (con timeout + auto-apply creación) --------------------
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: AIMessage = {
      id: Date.now().toString(),
      type: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const context = getDiagramContext();
      const analysis = analyzeDiagramState();

      const res = await fetch(backendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          context: {
            nodes: context.nodes,
            edges: context.edges,
            userLevel: "beginner",
            lastAction: currentTool,
          },
          message: userMessage.content,
        }),
      });

      clearTimeout(timeout);

      if (res.ok) {
        const aiResponse = await res.json();

        const aiMessage: AIMessage = {
          id: (Date.now() + 1).toString(),
          type: "assistant",
          content: aiResponse.message,
          suggestions: aiResponse.suggestions
            ? {
                classes: aiResponse.suggestions.classes,
                relations: aiResponse.suggestions.relations,
              }
            : undefined,
          contextualHelp: aiResponse.contextualHelp,
          tips: aiResponse.tips,
          nextSteps: aiResponse.nextSteps,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, aiMessage]);

        // 🔥 AUTO-APLICAR creación de clase si el usuario lo pidió explícitamente
        const normalized = userMessage.content
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "");

        if (
          canEdit &&
          aiMessage.suggestions?.classes?.length &&
          (normalized.includes("crear clase") ||
            normalized.includes("crea una clase") ||
            normalized.startsWith("crea ") ||
            normalized.includes("crear "))
        ) {
          const first = aiMessage.suggestions.classes[0];
          applySuggestion("class", first, { silentToast: false });
        }
      } else {
        // fallback local
        const fallback = await getFallbackResponse(
          userMessage.content,
          analysis
        );
        const aiMessage: AIMessage = {
          id: (Date.now() + 1).toString(),
          type: "assistant",
          content: fallback.content,
          suggestions: fallback.suggestions,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);

        // auto-aplicar si viene creación de clase
        if (fallback.suggestions?.classes?.length) {
          applySuggestion("class", fallback.suggestions.classes[0], {
            silentToast: false,
          });
        }
      }
    } catch (err) {
      clearTimeout(timeout);
      console.error("AI error:", err);
      const fallback = await getFallbackResponse(
        userMessage.content,
        analyzeDiagramState()
      );
      const aiMessage: AIMessage = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        content: fallback.content,
        suggestions: fallback.suggestions,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);

      if (fallback.suggestions?.classes?.length) {
        applySuggestion("class", fallback.suggestions.classes[0], {
          silentToast: false,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------- FALLBACK LOCAL INTELIGENTE --------------------
  const getFallbackResponse = async (input: string, analysis: any) => {
    const normalized = input
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");

    // crear clase simple
    if (normalized.includes("crea") && normalized.includes("clase")) {
      // intenta extraer "clase X"
      const m = input.match(/clase\s+([a-z0-9_][\w-]*)/i);
      const name = (m?.[1] || "Clase").replace(/[^A-Za-z0-9_]/g, "_");
      return {
        content: `Puedo crear la clase **${name}** ahora mismo.`,
        suggestions: {
          classes: [
            {
              name,
              attributes: ["id: Long", "nombre: String"],
              methods: [],
            },
          ],
        },
      };
    }

    // analizar
    if (normalized.includes("analiza") && normalized.includes("diagrama")) {
      if (analysis.classCount === 0) {
        return {
          content:
            "Tu diagrama está vacío. Crea 2–3 clases base y después conéctalas con asociaciones.",
        };
      }
      if (analysis.classCount >= 1 && !analysis.hasRelations) {
        return {
          content: `Tienes ${
            analysis.classCount
          } clases (${analysis.classNames.join(", ")}), pero sin relaciones.`,
          suggestions: {
            relations:
              analysis.classNames.length >= 2
                ? [
                    {
                      from: analysis.classNames[0],
                      to: analysis.classNames[1],
                      type: "assoc",
                    },
                  ]
                : undefined,
          },
        };
      }
      return {
        content: `Clases: ${analysis.classCount}, Relaciones: ${analysis.relationCount}.`,
      };
    }

    // relacionar
    if (normalized.includes("relacion") || normalized.includes("conectar")) {
      if (analysis.classCount < 2) {
        return {
          content: "Necesitas al menos 2 clases para crear una relación.",
        };
      }
      return {
        content:
          "Para relacionar: selecciona la herramienta, luego clic en clase origen y después en clase destino.",
        suggestions: {
          relations: [
            {
              from: analysis.classNames[0] || "Clase1",
              to: analysis.classNames[1] || "Clase2",
              type: "assoc",
            },
          ],
        },
      };
    }

    if (analysis.classCount === 0) {
      return {
        content:
          "Tu diagrama está vacío. Dime: “Crea una clase Usuario con atributos nombre, email”.",
      };
    }

    return {
      content: `Estado: ${analysis.classCount} clases, ${analysis.relationCount} relaciones. ¿Creo una clase nueva?`,
    };
  };

  // -------------------- APLICAR SUGERENCIAS (CREAR EN EL LIENZO) --------------------
  const applySuggestion = (
    type: "class" | "relation",
    data: any,
    opts: { silentToast?: boolean } = {}
  ) => {
    if (!canEdit) {
      toast.error("No tienes permisos para editar este diagrama");
      return;
    }

    if (type === "class" && onAddClass) {
      const attrs = (data.attributes || []).map((s: string) => s.trim());
      const methods = (data.methods || []).map((s: string) => s.trim());
      onAddClass(data.name, attrs, methods);
      if (!opts.silentToast) toast.success(`✅ Clase "${data.name}" creada`);

      // sugerir siguiente paso
      setTimeout(() => {
        const analysis = analyzeDiagramState();
        if (analysis.classCount === 1) {
          toast("💡 Crea otra clase para poder relacionarlas", {
            duration: 4000,
          });
        } else if (analysis.classCount >= 2 && !analysis.hasRelations) {
          toast("💡 Ahora conecta las clases con relaciones", {
            duration: 4000,
          });
        }
      }, 800);
    }

    if (type === "relation" && onAddRelation) {
      // IMPORTANTE: el editor espera keys: "assoc" | "inherit" | "comp" | "aggr" | "dep" | "many-to-many"
      const relType = (data.type || "assoc").toLowerCase();
      onAddRelation(data.from, data.to, relType);
      if (!opts.silentToast)
        toast.success(`✅ Relación ${data.from} → ${data.to} creada`);
    }
  };

  // -------------------- UI --------------------
  const renderQuickSuggestions = () => {
    if (!canEdit) {
      return (
        <>
          <button
            onClick={() => setInputValue("Analiza este diagrama")}
            className="text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1"
          >
            🔍 Analizar diagrama
          </button>
          <button
            onClick={() => setInputValue("Explícame las relaciones")}
            className="text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1"
          >
            📊 Explicar relaciones
          </button>
        </>
      );
    }

    const analysis = analyzeDiagramState();

    if (!analysis.hasClasses) {
      return (
        <>
          <button
            onClick={() =>
              setInputValue(
                "Crea una clase Usuario con atributos nombre, email"
              )
            }
            className="text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1"
          >
            ➕ Crea clase Usuario
          </button>
          <button
            onClick={() => setInputValue("Sistema de biblioteca")}
            className="text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1"
          >
            📚 Sistema biblioteca
          </button>
          <button
            onClick={() => setInputValue("¿Cómo creo una clase?")}
            className="text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1"
          >
            ❓ ¿Cómo crear clase?
          </button>
        </>
      );
    }

    if (analysis.hasEmptyClasses) {
      return (
        <>
          <button
            onClick={() => setInputValue("¿Qué atributos agregar?")}
            className="text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1"
          >
            📝 ¿Qué atributos?
          </button>
          <button
            onClick={() => setInputValue("¿Cómo edito una clase?")}
            className="text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1"
          >
            ✏️ ¿Cómo editar?
          </button>
        </>
      );
    }

    if (!analysis.hasRelations && analysis.classCount >= 2) {
      return (
        <>
          <button
            onClick={() => setInputValue("¿Cómo relaciono clases?")}
            className="text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1"
          >
            🔗 ¿Cómo relacionar?
          </button>
          <button
            onClick={() => setInputValue("Tipos de relaciones")}
            className="text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1"
          >
            📊 Tipos relaciones
          </button>
        </>
      );
    }

    if (analysis.isWellStructured) {
      return (
        <>
          <button
            onClick={() => setInputValue("¿Cómo genero código?")}
            className="text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1"
          >
            🚀 ¿Generar código?
          </button>
          <button
            onClick={() => setInputValue("Revisar mi diseño")}
            className="text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1"
          >
            🔍 Revisar diseño
          </button>
        </>
      );
    }

    return (
      <>
        <button
          onClick={() => setInputValue("¿Qué me falta?")}
          className="text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1"
        >
          🤔 ¿Qué falta?
        </button>
        <button
          onClick={() => setInputValue("Ayúdame a mejorar")}
          className="text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1"
        >
          ⭐ Mejorar
        </button>
      </>
    );
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <>
      {/* Sugerencia flotante */}
      {!isOpen && contextualSuggestion && (
        <div className="fixed top-20 right-6 z-40 max-w-xs">
          <div className="bg-blue-600 text-white p-3 rounded-lg shadow-lg relative animate-pulse">
            <div className="text-sm">{contextualSuggestion}</div>
            <button
              onClick={() => setContextualSuggestion(null)}
              className="absolute -top-1 -right-1 bg-white text-blue-600 rounded-full w-5 h-5 flex items-center justify-center text-xs"
            >
              ×
            </button>
            <div className="absolute -bottom-1 right-4 w-3 h-3 bg-blue-600 rotate-45"></div>
          </div>
        </div>
      )}

      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed top-1/2 right-6 transform -translate-y-1/2 z-50 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2 group ${
          diagramAnalysis?.hasClasses
            ? "bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
            : "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 animate-bounce"
        }`}
        title="Asistente de IA"
      >
        <Bot className="h-5 w-5" />
        {!diagramAnalysis?.hasClasses && (
          <span className="hidden group-hover:inline-block text-sm font-medium whitespace-nowrap">
            ¡Empezar!
          </span>
        )}
      </button>

      {/* Modal/chat */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[600px] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-t-2xl">
              <div className="flex items-center gap-3">
                <Bot className="h-6 w-6" />
                <div>
                  <h3 className="font-semibold">Asistente UML</h3>
                  <p className="text-sm opacity-90">
                    {diagramAnalysis
                      ? `${diagramAnalysis.classCount} clases, ${diagramAnalysis.relationCount} relaciones`
                      : "Diseño de diagramas UML"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {diagramAnalysis && (
                  <div className="flex items-center gap-1 text-xs bg-white bg-opacity-20 px-2 py-1 rounded">
                    <Eye className="h-3 w-3" />
                    {diagramAnalysis.isWellStructured
                      ? "Completo"
                      : "En progreso"}
                  </div>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.type === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.type === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-900"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{message.content}</div>

                    {/* Acciones sugeridas */}
                    {message.contextualHelp && (
                      <div className="mt-3 space-y-2">
                        <h4 className="font-semibold text-sm flex items-center gap-1">
                          <Lightbulb className="h-4 w-4" />
                          Acciones sugeridas:
                        </h4>
                        {message.contextualHelp.map((help, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleContextualAction(help.action)}
                            className={`w-full text-left text-xs rounded px-2 py-2 border ${
                              help.priority === "high"
                                ? "bg-red-50 border-red-200 hover:bg-red-100 text-red-800"
                                : help.priority === "medium"
                                ? "bg-yellow-50 border-yellow-200 hover:bg-yellow-100 text-yellow-800"
                                : "bg-green-50 border-green-200 hover:bg-green-100 text-green-800"
                            }`}
                          >
                            <div className="font-medium">
                              {help.description}
                            </div>
                            {help.shortcut && (
                              <div className="opacity-75 mt-1">
                                {help.shortcut}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Tips / Next steps */}
                    {message.tips && (
                      <div className="mt-3">
                        <h4 className="font-semibold text-sm mb-1">💡 Tips:</h4>
                        {message.tips.map((tip, idx) => (
                          <div key={idx} className="text-xs opacity-90 mb-1">
                            {tip}
                          </div>
                        ))}
                      </div>
                    )}

                    {message.nextSteps && (
                      <div className="mt-3">
                        <h4 className="font-semibold text-sm mb-1">
                          📋 Próximos pasos:
                        </h4>
                        {message.nextSteps.map((step, idx) => (
                          <div key={idx} className="text-xs opacity-90 mb-1">
                            {step}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Sugerencias (crear clase / relación) */}
                    {message.suggestions && (
                      <div className="mt-4 space-y-3">
                        {message.suggestions.classes && (
                          <div>
                            <h4 className="font-semibold text-sm mb-2 flex items-center gap-1">
                              <Lightbulb className="h-4 w-4" />
                              Clases sugeridas
                            </h4>
                            <div className="space-y-2">
                              {message.suggestions.classes.map((cls, index) => (
                                <div
                                  key={index}
                                  className="bg-white bg-opacity-50 rounded-lg p-3"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium">
                                      {cls.name}
                                    </span>
                                    <button
                                      onClick={() =>
                                        applySuggestion("class", cls)
                                      }
                                      className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded flex items-center gap-1"
                                    >
                                      <CheckCircle className="h-3 w-3" />
                                      Agregar
                                    </button>
                                  </div>
                                  <div className="text-xs space-y-1">
                                    <div>
                                      <strong>Atributos:</strong>{" "}
                                      {cls.attributes.join(", ")}
                                    </div>
                                    {cls.methods?.length ? (
                                      <div>
                                        <strong>Métodos:</strong>{" "}
                                        {cls.methods.join(", ")}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {message.suggestions.relations && (
                          <div>
                            <h4 className="font-semibold text-sm mb-2 flex items-center gap-1">
                              <Sparkles className="h-4 w-4" />
                              Relaciones sugeridas
                            </h4>
                            <div className="space-y-2">
                              {message.suggestions.relations.map(
                                (rel, index) => (
                                  <div
                                    key={index}
                                    className="bg-white bg-opacity-50 rounded-lg p-3"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm">
                                        {rel.from} → {rel.to} ({rel.type})
                                      </span>
                                      <button
                                        onClick={() =>
                                          applySuggestion("relation", rel)
                                        }
                                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded flex items-center gap-1"
                                      >
                                        <CheckCircle className="h-3 w-3" />
                                        Agregar
                                      </button>
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                      <span className="text-sm text-gray-600">
                        Analizando...
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input + sugerencias rápidas */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Describe tu sistema o pide que cree una clase..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={isLoading}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isLoading}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 rounded-xl transition-all duration-200"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>

              <div className="flex flex-wrap gap-1">
                {renderQuickSuggestions()}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
