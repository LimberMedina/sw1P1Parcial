import { useState } from "react";
import { api } from "../../lib/api";

interface CardinalitySuggestion {
  suggestion: string;
  sourceCardinality: string;
  targetCardinality: string;
  relationType: string;
  explanation: string;
  umlRelationType: "assoc" | "aggr" | "comp" | "inherit" | "dep";
  umlRelationExplanation: string;
}

interface Props {
  sourceClass: string;
  targetClass: string;
  sourceAttributes?: string[];
  targetAttributes?: string[];
  onApplySuggestion: (
    sourceCard: string,
    targetCard: string,
    umlRelationType: string
  ) => void;
}

// Mapeo de tipos UML a nombres legibles
const UML_RELATION_NAMES = {
  assoc: "Asociación",
  aggr: "Agregación",
  comp: "Composición",
  inherit: "Herencia",
  dep: "Dependencia",
};

// Mapeo de tipos UML a iconos/símbolos
const UML_RELATION_SYMBOLS = {
  assoc: "—",
  aggr: "◇—",
  comp: "♦—",
  inherit: "△—",
  dep: "- - ->",
};

export default function CardinalitySuggestion({
  sourceClass,
  targetClass,
  sourceAttributes,
  targetAttributes,
  onApplySuggestion,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<CardinalitySuggestion | null>(
    null
  );
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSuggestion = async () => {
    if (!sourceClass || !targetClass) {
      setError("Necesitas especificar ambas clases");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.post("/ai/suggest-cardinality", {
        sourceClass,
        targetClass,
        sourceAttributes,
        targetAttributes,
      });

      setSuggestion(response.data);
      setApplied(false);
    } catch (error) {
      console.error("Error getting cardinality suggestion:", error);
      setError("Error al obtener sugerencia de IA");
    } finally {
      setLoading(false);
    }
  };

  const applySuggestion = () => {
    if (!suggestion) return;

    onApplySuggestion(
      suggestion.sourceCardinality,
      suggestion.targetCardinality,
      suggestion.umlRelationType
    );
    setApplied(true);
  };

  if (!sourceClass || !targetClass) {
    return null;
  }

  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">🪄</span>
        <span className="font-medium text-gray-700">
          Sugerencia de Relación UML con IA
        </span>
      </div>

      {!suggestion && (
        <button
          type="button"
          onClick={getSuggestion}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>🧠</span>
          {loading ? "Analizando..." : "Obtener Sugerencia"}
        </button>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {suggestion && (
        <div className="space-y-3">
          <div className="rounded-lg border border-white bg-white p-3">
            <h4 className="mb-2 font-medium text-gray-800">
              {suggestion.suggestion}
            </h4>

            {/* Tipo de Relación UML */}
            <div className="mb-3 rounded-md bg-purple-50 p-3 border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium text-purple-800">
                  Tipo de Relación:
                </span>
                <span className="rounded bg-purple-100 px-2 py-1 font-mono text-purple-800">
                  {UML_RELATION_NAMES[suggestion.umlRelationType]}{" "}
                  {UML_RELATION_SYMBOLS[suggestion.umlRelationType]}
                </span>
              </div>
              <p className="text-sm text-purple-700">
                {suggestion.umlRelationExplanation}
              </p>
            </div>

            {/* Cardinalidades */}
            <div className="mb-3 grid grid-cols-2 gap-4">
              <div className="text-sm">
                <span className="font-medium text-gray-600">
                  De {sourceClass}:
                </span>
                <span className="ml-2 rounded bg-blue-100 px-2 py-1 font-mono text-blue-800">
                  {suggestion.sourceCardinality}
                </span>
              </div>
              <div className="text-sm">
                <span className="font-medium text-gray-600">
                  A {targetClass}:
                </span>
                <span className="ml-2 rounded bg-green-100 px-2 py-1 font-mono text-green-800">
                  {suggestion.targetCardinality}
                </span>
              </div>
            </div>

            <p className="mb-3 text-sm text-gray-600">
              {suggestion.explanation}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={applySuggestion}
                disabled={applied}
                className="inline-flex items-center gap-2 rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {applied ? (
                  <>
                    <span>✅</span>
                    Aplicado
                  </>
                ) : (
                  "Aplicar Sugerencia Completa"
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSuggestion(null);
                  setApplied(false);
                  setError(null);
                }}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Nueva Sugerencia
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
