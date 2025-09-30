import { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Sparkles, Lightbulb, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../../lib/api";

interface AIMessage {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: Date;
  suggestions?: {
    classes?: Array<{ name: string; attributes: string[]; methods: string[] }>;
    relations?: Array<{ from: string; to: string; type: string }>;
  };
}

interface AIAssistantProps {
  graph?: any;
  onAddClass?: (
    className: string,
    attributes: string[],
    methods: string[]
  ) => void;
  onAddRelation?: (from: string, to: string, type: string) => void;
}

export default function AIAssistant({
  onAddClass,
  onAddRelation,
}: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: "1",
      type: "assistant",
      content:
        "¡Hola! Soy tu asistente de IA para diagramas UML. Puedo ayudarte a:\n\n• Analizar requisitos y sugerir clases\n• Recomendar métodos y atributos\n• Sugerir relaciones entre clases\n• Validar tu diseño\n\n¿Qué sistema quieres diseñar?",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

    try {
      // Simular respuesta de IA (aquí integrarías la API real)
      const response = await simulateAIResponse(inputValue);

      const aiMessage: AIMessage = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        content: response.content,
        suggestions: response.suggestions,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Error al procesar mensaje:", error);
      toast.error("Error al procesar tu solicitud");
    } finally {
      setIsLoading(false);
    }
  };

  const simulateAIResponse = async (
    input: string
  ): Promise<{ content: string; suggestions?: any }> => {
    try {
      // Llamar a la API del backend usando la configuración de axios
      const response = await api.post("/ai/analyze-uml", {
        userInput: input,
      });

      return response.data;
    } catch (error) {
      console.error("Error al llamar a la API de IA:", error);

      // Fallback a respuesta simulada si falla la API
      return getFallbackResponse(input);
    }
  };

  const getFallbackResponse = (
    input: string
  ): { content: string; suggestions?: any } => {
    const lowerInput = input.toLowerCase();

    if (lowerInput.includes("biblioteca") || lowerInput.includes("library")) {
      return {
        content:
          "Perfecto! Para un sistema de biblioteca, te sugiero estas clases principales:",
        suggestions: {
          classes: [
            {
              name: "Usuario",
              attributes: [
                "String nombre",
                "String email",
                "Date fechaRegistro",
              ],
              methods: [
                "prestarLibro()",
                "devolverLibro()",
                "consultarHistorial()",
              ],
            },
            {
              name: "Libro",
              attributes: [
                "String titulo",
                "String autor",
                "String isbn",
                "Boolean disponible",
              ],
              methods: [
                "marcarDisponible()",
                "marcarPrestado()",
                "obtenerInformacion()",
              ],
            },
            {
              name: "Prestamo",
              attributes: [
                "Date fechaPrestamo",
                "Date fechaVencimiento",
                "Boolean devuelto",
              ],
              methods: [
                "calcularMulta()",
                "marcarDevuelto()",
                "extenderPrestamo()",
              ],
            },
          ],
          relations: [
            { from: "Usuario", to: "Prestamo", type: "ONE_TO_MANY" },
            { from: "Libro", to: "Prestamo", type: "ONE_TO_MANY" },
          ],
        },
      };
    }

    if (lowerInput.includes("tienda") || lowerInput.includes("ecommerce")) {
      return {
        content:
          "Excelente! Para un sistema de e-commerce, estas son las clases que recomiendo:",
        suggestions: {
          classes: [
            {
              name: "Cliente",
              attributes: ["String nombre", "String email", "String direccion"],
              methods: [
                "realizarCompra()",
                "consultarPedidos()",
                "actualizarPerfil()",
              ],
            },
            {
              name: "Producto",
              attributes: [
                "String nombre",
                "Double precio",
                "Integer stock",
                "String categoria",
              ],
              methods: [
                "actualizarStock()",
                "calcularDescuento()",
                "obtenerDetalles()",
              ],
            },
            {
              name: "Pedido",
              attributes: ["Date fechaPedido", "Double total", "String estado"],
              methods: [
                "calcularTotal()",
                "actualizarEstado()",
                "generarFactura()",
              ],
            },
          ],
          relations: [
            { from: "Cliente", to: "Pedido", type: "ONE_TO_MANY" },
            { from: "Producto", to: "Pedido", type: "MANY_TO_MANY" },
          ],
        },
      };
    }

    return {
      content:
        'Interesante! Para ayudarte mejor, podrías describir más detalles sobre:\n\n• ¿Qué tipo de sistema es?\n• ¿Cuáles son las entidades principales?\n• ¿Qué funcionalidades necesita?\n\nEjemplos: "Sistema de biblioteca", "E-commerce", "Gestión de empleados", etc.',
    };
  };

  const applySuggestion = (type: "class" | "relation", data: any) => {
    if (type === "class" && onAddClass) {
      onAddClass(data.name, data.attributes, data.methods);
      toast.success(`Clase "${data.name}" agregada al diagrama`);
    } else if (type === "relation" && onAddRelation) {
      onAddRelation(data.from, data.to, data.type);
      toast.success(`Relación ${data.from} → ${data.to} agregada`);
    }
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-1/2 right-6 transform -translate-y-1/2 z-50 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2 group"
        title="Asistente de IA"
      >
        <Bot className="h-5 w-5" />
        <span className="hidden group-hover:inline-block text-sm font-medium whitespace-nowrap">
          AI Assistant
        </span>
      </button>

      {/* Modal de chat */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[600px] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-t-2xl">
              <div className="flex items-center gap-3">
                <Bot className="h-6 w-6" />
                <div>
                  <h3 className="font-semibold">Asistente de IA</h3>
                  <p className="text-sm opacity-90">Diseño de diagramas UML</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
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

                    {/* Sugerencias */}
                    {message.suggestions && (
                      <div className="mt-4 space-y-3">
                        {message.suggestions.classes && (
                          <div>
                            <h4 className="font-semibold text-sm mb-2 flex items-center gap-1">
                              <Lightbulb className="h-4 w-4" />
                              Clases Sugeridas:
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
                                    <div>
                                      <strong>Métodos:</strong>{" "}
                                      {cls.methods.join(", ")}
                                    </div>
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
                              Relaciones Sugeridas:
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
                      <span className="text-sm text-gray-600">Pensando...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Describe tu sistema o pregunta sobre el diseño..."
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
