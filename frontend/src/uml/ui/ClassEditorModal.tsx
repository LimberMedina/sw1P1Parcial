// src/uml/ui/ClassEditorModal.tsx
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import CardinalitySuggestion from "./CardinalitySuggestion";

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

type Props = {
  open: boolean;
  mode?: "class" | "edge";
  initialValues: ClassFormValues | RelationFormValues;
  size?: "md" | "lg" | "xl";
  onClose: () => void;
  onSubmit: (values: ClassFormValues | RelationFormValues) => void;
  sourceNodeData?: { name: string; attributes: string[] };
  targetNodeData?: { name: string; attributes: string[] };
};

const sizeToMaxWidth: Record<NonNullable<Props["size"]>, string> = {
  md: "max-w-2xl",
  lg: "max-w-3xl", // media pantalla aprox
  xl: "max-w-5xl",
};

// ====== Tipos que imitan la respuesta del backend AI ======
type AiUmlSuggestion = {
  classes?: Array<{
    name: string;
    attributes: string[];
    methods: string[];
  }>;
  relations?: Array<{
    from: string;
    to: string;
    type: string;
  }>;
};

type AiResponse = {
  content: string;
  suggestions?: AiUmlSuggestion;
};

export default function ClassEditorModal({
  open,
  mode = "class",
  initialValues,
  size = "lg",
  onClose,
  onSubmit,
  sourceNodeData,
  targetNodeData,
}: Props) {
  // ---- Estado para CLASE ----
  const [name, setName] = useState(
    mode === "class"
      ? (initialValues as ClassFormValues).name
      : (initialValues as RelationFormValues).name
  );
  const [attrsText, setAttrsText] = useState(
    mode === "class"
      ? (initialValues as ClassFormValues).attributes.join("\n")
      : ""
  );
  const [methodsText, setMethodsText] = useState(
    mode === "class"
      ? (initialValues as ClassFormValues).methods.join("\n")
      : ""
  );

  const handleApplyCardinalitySuggestion = (
    sourceCard: string,
    targetCard: string,
    umlRelationType: string
  ) => {
    setMultSource(sourceCard);
    setMultTarget(targetCard);

    console.log("Aplicando sugerencia:", {
      sourceCard,
      targetCard,
      umlRelationType,
    });
  };

  {
    sourceNodeData && targetNodeData && (
      <CardinalitySuggestion
        sourceClass={sourceNodeData.name}
        targetClass={targetNodeData.name}
        sourceAttributes={sourceNodeData.attributes}
        targetAttributes={targetNodeData.attributes}
        onApplySuggestion={handleApplyCardinalitySuggestion}
      />
    );
  }

  // ---- Estado para RELACIÓN ----
  const [relName, setRelName] = useState(
    mode === "edge" ? (initialValues as RelationFormValues).name : ""
  );
  const [multSource, setMultSource] = useState(
    mode === "edge" ? (initialValues as RelationFormValues).multSource : ""
  );
  const [multTarget, setMultTarget] = useState(
    mode === "edge" ? (initialValues as RelationFormValues).multTarget : ""
  );

  // ---- Estado IA: atributos ----
  const [aiLoadingAttr, setAiLoadingAttr] = useState(false);
  const [aiErrorAttr, setAiErrorAttr] = useState<string | null>(null);
  const [aiInfoAttr, setAiInfoAttr] = useState<string | null>(null);

  // ---- Estado IA: métodos ----
  const [aiLoadingMeth, setAiLoadingMeth] = useState(false);
  const [aiErrorMeth, setAiErrorMeth] = useState<string | null>(null);
  const [aiInfoMeth, setAiInfoMeth] = useState<string | null>(null);

  // Si cambian los initialValues desde afuera, sincronizar
  useEffect(() => {
    if (mode === "class") {
      const iv = initialValues as ClassFormValues;
      setName(iv.name);
      setAttrsText(iv.attributes.join("\n"));
      setMethodsText(iv.methods.join("\n"));
    } else {
      const iv = initialValues as RelationFormValues;
      setRelName(iv.name ?? "");
      setMultSource(iv.multSource ?? "");
      setMultTarget(iv.multTarget ?? "");
    }
  }, [initialValues, mode]);

  if (!open) return null;

  function toLines(s: string): string[] {
    return s
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function uniqMerge(existing: string[], incoming: string[]): string[] {
    const seen = new Set(existing.map((x) => x.trim()).filter(Boolean));
    const out = [...existing];
    for (const raw of incoming) {
      const v = (raw || "").trim();
      if (!v) continue;
      if (!seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
    return out;
  }

  // ===== IA: sugerir atributos según el nombre =====
  async function handleSuggestAttributesAI() {
    setAiErrorAttr(null);
    setAiInfoAttr(null);

    const className = (name || "").trim();
    if (!className) {
      setAiErrorAttr("Primero ingresa el nombre de la clase.");
      return;
    }

    const userInput = `
Quiero sugerencias de ATRIBUTOS para una clase UML.
Devuélvelos exclusivamente en "suggestions.classes[0].attributes" (arreglo de strings).
Clase objetivo: "${className}".

Evita métodos. No incluyas descripciones, solo nombres de atributos con tipo cuando sea razonable.
Ejemplos del estilo esperado:
- Para "Producto": ["id: int", "nombre: string", "precio: decimal", "stock: int", "categoria: string"]
- Para "Usuario": ["id: int", "nombre: string", "email: string", "fechaRegistro: date", "activo: bool"]
    `.trim();

    try {
      setAiLoadingAttr(true);
      const { data } = await api.post<AiResponse>("/ai/analyze-uml", {
        userInput,
      });

      const suggested = data?.suggestions?.classes?.[0]?.attributes ?? [];
      if (!Array.isArray(suggested) || suggested.length === 0) {
        setAiErrorAttr(
          "La IA no devolvió atributos para esta clase. Ajusta el nombre o intenta nuevamente."
        );
        return;
      }

      const current = toLines(attrsText);
      const merged = uniqMerge(current, suggested);
      setAttrsText(merged.join("\n"));
      setAiInfoAttr(
        `Se agregaron ${merged.length - current.length} atributo(s) sugeridos.`
      );
    } catch (e: any) {
      setAiErrorAttr(
        "No fue posible obtener sugerencias con IA. Verifica el backend y la clave de GROQ."
      );
    } finally {
      setAiLoadingAttr(false);
    }
  }

  // ===== IA: sugerir métodos según nombre + atributos =====
  async function handleSuggestMethodsAI() {
    setAiErrorMeth(null);
    setAiInfoMeth(null);

    const className = (name || "").trim();
    if (!className) {
      setAiErrorMeth("Primero ingresa el nombre de la clase.");
      return;
    }

    const attributes = toLines(attrsText);
    const attrsForPrompt =
      attributes.length > 0
        ? `Atributos actuales:\n- ${attributes.join("\n- ")}`
        : "Sin atributos definidos.";

    const userInput = `
Quiero sugerencias de METODOS para una clase UML en base al NOMBRE y a sus ATRIBUTOS.
Devuélvelos exclusivamente en "suggestions.classes[0].methods" (arreglo de strings).
Clase objetivo: "${className}".

${attrsForPrompt}

Requisitos:
- No incluyas atributos en la respuesta, solo métodos.
- Métodos en estilo "nombre(parametros): retorno" cuando sea razonable.
- Si el dominio lo sugiere, incluye CRUD y operaciones de negocio.
- Evita descripciones; solo las firmas.

Ejemplos de estilo:
- Producto: ["guardar(): void", "actualizarPrecio(nuevo: decimal): void", "descontarStock(cantidad: int): bool", "estaDisponible(): bool"]
- Usuario: ["validarPassword(pass: string): bool", "activar(): void", "desactivar(): void", "cambiarEmail(nuevo: string): void"]
    `.trim();

    try {
      setAiLoadingMeth(true);
      const { data } = await api.post<AiResponse>("/ai/analyze-uml", {
        userInput,
      });

      const suggested = data?.suggestions?.classes?.[0]?.methods ?? [];
      if (!Array.isArray(suggested) || suggested.length === 0) {
        setAiErrorMeth(
          "La IA no devolvió métodos para esta clase. Ajusta el nombre o define algunos atributos y vuelve a intentar."
        );
        return;
      }

      const current = toLines(methodsText);
      const merged = uniqMerge(current, suggested);
      setMethodsText(merged.join("\n"));
      setAiInfoMeth(
        `Se agregaron ${merged.length - current.length} método(s) sugeridos.`
      );
    } catch (e: any) {
      setAiErrorMeth(
        "No fue posible obtener sugerencias con IA. Verifica el backend y la clave de GROQ."
      );
    } finally {
      setAiLoadingMeth(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === "class") {
      onSubmit({
        name: (name || "").trim() || "Class",
        attributes: toLines(attrsText),
        methods: toLines(methodsText),
      } as ClassFormValues);
      return;
    }

    // mode === "edge"
    onSubmit({
      name: (relName || "").trim(),
      multSource: (multSource || "").trim(),
      multTarget: (multTarget || "").trim(),
    } as RelationFormValues);
  }

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  const isClass = mode === "class";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className={`w-full ${sizeToMaxWidth[size]} h-[70vh] rounded-2xl bg-white shadow-xl border border-gray-200 overflow-hidden`}
        onClick={stop}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-900">
            {isClass ? "Editar clase" : "Editar relación"}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit}
          className="h-[calc(70vh-48px-64px)] overflow-auto px-5 py-4"
        >
          {isClass ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Nombre de la clase
                  </label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-400"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="p. ej. Producto"
                  />
                </div>

                <div className="flex gap-2">
                  {/* Botón IA: atributos */}
                  <button
                    type="button"
                    onClick={handleSuggestAttributesAI}
                    disabled={aiLoadingAttr}
                    className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-60"
                    title="Sugerir atributos con IA según el nombre de la clase"
                  >
                    <span aria-hidden>🪄</span>
                    {aiLoadingAttr
                      ? "Sugeriendo..."
                      : "Sugerir atributos con IA"}
                  </button>

                  {/* Botón IA: métodos (usa nombre + atributos) */}
                  <button
                    type="button"
                    onClick={handleSuggestMethodsAI}
                    disabled={aiLoadingMeth}
                    className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-60"
                    title="Sugerir métodos con IA según el nombre y atributos de la clase"
                  >
                    <span aria-hidden>🧠</span>
                    {aiLoadingMeth ? "Sugeriendo..." : "Sugerir métodos con IA"}
                  </button>
                </div>
              </div>

              {/* Mensajes IA: atributos */}
              {aiErrorAttr && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
                  {aiErrorAttr}
                </div>
              )}
              {aiInfoAttr && (
                <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 border border-green-200">
                  {aiInfoAttr}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Atributos (uno por línea)
                </label>
                <textarea
                  className="mt-1 h-36 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  value={attrsText}
                  onChange={(e) => setAttrsText(e.target.value)}
                  placeholder={`id: int\nnombre: string\nprecio: decimal\nstock: int\ncategoria: string`}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Usa “Sugerir atributos con IA” para generar una base según el
                  nombre de la clase.
                </p>
              </div>

              {/* Mensajes IA: métodos */}
              {aiErrorMeth && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
                  {aiErrorMeth}
                </div>
              )}
              {aiInfoMeth && (
                <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 border border-green-200">
                  {aiInfoMeth}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Métodos (uno por línea)
                </label>
                <textarea
                  className="mt-1 h-36 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  value={methodsText}
                  onChange={(e) => setMethodsText(e.target.value)}
                  placeholder={`guardar(): void\nactualizarPrecio(nuevo: decimal): void\ndescontarStock(cantidad: int): bool\nestaDisponible(): bool`}
                />
                <p className="mt-1 text-xs text-gray-500">
                  “Sugerir métodos con IA” usa el nombre y los atributos
                  actuales para proponer firmas.
                </p>
              </div>
            </div>
          ) : (
            // ===== Formulario de RELACIÓN =====
            <div className="space-y-4">
              {/* Agregar el componente de sugerencia IA aquí */}
              {sourceNodeData && targetNodeData && (
                <CardinalitySuggestion
                  sourceClass={sourceNodeData.name}
                  targetClass={targetNodeData.name}
                  sourceAttributes={sourceNodeData.attributes}
                  targetAttributes={targetNodeData.attributes}
                  onApplySuggestion={handleApplyCardinalitySuggestion}
                />
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Nombre de la relación
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  value={relName}
                  onChange={(e) => setRelName(e.target.value)}
                  placeholder="p. ej. perteneceA"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Se mostrará encima y al centro de la línea.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Multiplicidad (origen) - {sourceNodeData?.name || "Origen"}
                  </label>
                  <select
                    value={multSource}
                    onChange={(e) => setMultSource(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none bg-white focus:border-gray-400"
                  >
                    <option value="1..*">1..*</option>
                    <option value="0..*">0..*</option>
                    <option value="0..1">0..1</option>
                    <option value="1..1">1..1</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Aparecerá debajo del extremo de origen.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Multiplicidad (destino) -{" "}
                    {targetNodeData?.name || "Destino"}
                  </label>
                  <select
                    value={multTarget}
                    onChange={(e) => setMultTarget(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none bg-white focus:border-gray-400"
                  >
                    <option value="1..*">1..*</option>
                    <option value="0..*">0..*</option>
                    <option value="0..1">0..1</option>
                    <option value="1..1">1..1</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Aparecerá debajo del extremo de destino.
                  </p>
                </div>
              </div>

              <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-600">
                Sugerencias: <code>1..1</code>, <code>0..1</code>,{" "}
                <code>1..*</code>, <code>0..*</code>.
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 flex items-center justify-end gap-2 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800"
            >
              Guardar cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
