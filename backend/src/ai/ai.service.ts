import { Injectable, InternalServerErrorException } from '@nestjs/common';
import Groq from 'groq-sdk';
import sharp from 'sharp';
import { createWorker, PSM, OEM } from 'tesseract.js';

export type RelationType =
  | 'ONE_TO_ONE'
  | 'ONE_TO_MANY'
  | 'MANY_TO_ONE'
  | 'MANY_TO_MANY'
  | 'ASSOCIATION'
  | 'INHERITANCE'
  | 'COMPOSITION'
  | 'AGGREGATION';

const RELATION_TYPES: RelationType[] = [
  'ONE_TO_ONE',
  'ONE_TO_MANY',
  'MANY_TO_ONE',
  'MANY_TO_MANY',
  'ASSOCIATION',
  'INHERITANCE',
  'COMPOSITION',
  'AGGREGATION',
];

export interface UmlSuggestion {
  classes?: Array<{
    name: string;
    attributes: string[];
    methods: string[];
  }>;
  relations?: Array<{
    from: string;
    to: string;
    type: RelationType | string;
  }>;
}

export interface CardinalitySuggestion {
  suggestion: string;
  sourceCardinality: string;
  targetCardinality: string;
  relationType: RelationType;
  explanation: string;
  //relaciones
  umlRelationType: 'assoc' | 'aggr' | 'comp' | 'inherit' | 'dep';
  umlRelationExplanation: string;
}

export interface AiResponse {
  content: string;
  suggestions?: {
    classes?: Array<{ name: string; attributes: string[]; methods: string[] }>;
    relations?: Array<{ from: string; to: string; type: string }>;
  };
  tips?: string[];
  nextSteps?: string[];
}

@Injectable()
export class AiService {
  private groq: Groq;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
    }
    this.groq = new Groq({
      apiKey: apiKey || 'gsk_dev_placeholder', // evita hardcodear un key “real”
    });
  }

  async suggestCardinality(
    sourceClass: string,
    targetClass: string,
    sourceAttributes?: string[],
    targetAttributes?: string[],
  ): Promise<CardinalitySuggestion> {
    const systemPrompt = `Eres un experto en diseño de bases de datos y diagramas UML.
Analiza la relación entre dos clases y sugiere tanto la cardinalidad como el tipo de relación UML más apropiado.

TIPOS DE RELACIÓN UML:
- "assoc" (Asociación): Relación general entre clases independientes
- "aggr" (Agregación): "Tiene un" - Relación de contención débil (rombo vacío)
- "comp" (Composición): "Parte de" - Relación de contención fuerte (rombo lleno)
- "inherit" (Herencia/Generalización): "Es un" - Relación de herencia (triángulo)
- "dep" (Dependencia): "Usa" - Dependencia temporal (línea punteada)

Responde SIEMPRE en formato JSON con esta estructura exacta:
{
  "suggestion": "Descripción breve de la relación sugerida",
  "sourceCardinality": "1" | "0..1" | "1..*" | "*",
  "targetCardinality": "1" | "0..1" | "1..*" | "*", 
  "relationType": "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_ONE" | "MANY_TO_MANY" | "ASSOCIATION",
  "explanation": "Explicación detallada del por qué de esta cardinalidad",
  "umlRelationType": "assoc" | "aggr" | "comp" | "inherit" | "dep",
  "umlRelationExplanation": "Explicación del tipo de relación UML elegido"
}`;

    const userPrompt = `Analiza la relación entre estas clases:

Clase origen: ${sourceClass}
${sourceAttributes?.length ? `Atributos: ${sourceAttributes.join(', ')}` : ''}

Clase destino: ${targetClass}
${targetAttributes?.length ? `Atributos: ${targetAttributes.join(', ')}` : ''}

¿Qué tipo de relación UML, cardinalidad y explicación recomiendas?

Ejemplos de análisis:
- Auto -> Motor: Composición (comp) porque el motor es parte esencial del auto
- Estudiante -> Universidad: Agregación (aggr) porque el estudiante pertenece a la universidad pero puede existir sin ella
- Producto -> Categoria: Asociación (assoc) con cardinalidad muchos-a-uno
- Empleado -> Persona: Herencia (inherit) porque empleado es un tipo de persona
- Controlador -> Servicio: Dependencia (dep) porque el controlador usa el servicio`;

    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.2,
        max_tokens: 600,
      });

      const raw = completion.choices?.[0]?.message?.content ?? '';
      const parsed = this.tryParseJsonStrictOrLoose(raw);

      if (parsed && this.isValidCardinalitySuggestion(parsed)) {
        return parsed;
      }

      return this.getCardinalityFallback(sourceClass, targetClass);
    } catch (err) {
      console.error('[AiService] Error in suggestCardinality:', err);
      return this.getCardinalityFallback(sourceClass, targetClass);
    }
  }

  private isValidCardinalitySuggestion(obj: any): obj is CardinalitySuggestion {
    return (
      obj &&
      typeof obj.suggestion === 'string' &&
      typeof obj.sourceCardinality === 'string' &&
      typeof obj.targetCardinality === 'string' &&
      typeof obj.relationType === 'string' &&
      typeof obj.explanation === 'string' &&
      typeof obj.umlRelationType === 'string' &&
      typeof obj.umlRelationExplanation === 'string' &&
      ['assoc', 'aggr', 'comp', 'inherit', 'dep'].includes(obj.umlRelationType)
    );
  }

  private getCardinalityFallback(
    sourceClass: string,
    targetClass: string,
  ): CardinalitySuggestion {
    const sourceLower = sourceClass.toLowerCase();
    const targetLower = targetClass.toLowerCase();

    // Detectar herencia por nombres
    if (this.isInheritancePattern(sourceLower, targetLower)) {
      return {
        suggestion: `${sourceClass} hereda de ${targetClass}`,
        sourceCardinality: '1',
        targetCardinality: '1',
        relationType: 'INHERITANCE',
        explanation: `${sourceClass} es un tipo específico de ${targetClass}.`,
        umlRelationType: 'inherit',
        umlRelationExplanation:
          'Relación de herencia (generalización) porque una clase es un tipo específico de la otra.',
      };
    }

    // Detectar composición por nombres
    if (this.isCompositionPattern(sourceLower, targetLower)) {
      return {
        suggestion: `${targetClass} es parte esencial de ${sourceClass}`,
        sourceCardinality: '1',
        targetCardinality: '1..*',
        relationType: 'ONE_TO_MANY',
        explanation: `${targetClass} es una parte vital de ${sourceClass} y no puede existir sin él.`,
        umlRelationType: 'comp',
        umlRelationExplanation:
          'Composición porque una clase es parte esencial de la otra.',
      };
    }

    // Detectar agregación
    if (this.isAggregationPattern(sourceLower, targetLower)) {
      return {
        suggestion: `${sourceClass} contiene ${targetClass}`,
        sourceCardinality: '1',
        targetCardinality: '*',
        relationType: 'ONE_TO_MANY',
        explanation: `${sourceClass} puede contener múltiples ${targetClass}.`,
        umlRelationType: 'aggr',
        umlRelationExplanation:
          'Agregación porque hay una relación de contención pero las partes pueden existir independientemente.',
      };
    }

    // Fallback a asociación
    return {
      suggestion: 'Asociación simple entre las clases',
      sourceCardinality: '1',
      targetCardinality: '*',
      relationType: 'ONE_TO_MANY',
      explanation: 'Relación de asociación estándar entre las clases.',
      umlRelationType: 'assoc',
      umlRelationExplanation:
        'Asociación simple porque las clases están relacionadas pero son independientes.',
    };
  }

  private isInheritancePattern(source: string, target: string): boolean {
    const inheritanceKeywords = [
      'persona',
      'animal',
      'vehiculo',
      'documento',
      'usuario',
      'producto',
    ];
    const specificKeywords = [
      'empleado',
      'cliente',
      'estudiante',
      'perro',
      'gato',
      'auto',
      'moto',
    ];

    return (
      (inheritanceKeywords.some((keyword) => target.includes(keyword)) &&
        specificKeywords.some((keyword) => source.includes(keyword))) ||
      source.includes('abstract') ||
      target.includes('abstract')
    );
  }

  private isCompositionPattern(source: string, target: string): boolean {
    const compositionPairs = [
      ['auto', 'motor'],
      ['casa', 'habitacion'],
      ['libro', 'pagina'],
      ['universidad', 'facultad'],
      ['empresa', 'departamento'],
    ];

    return compositionPairs.some(
      ([container, part]) =>
        source.includes(container) && target.includes(part),
    );
  }

  private isAggregationPattern(source: string, target: string): boolean {
    const aggregationPairs = [
      ['universidad', 'estudiante'],
      ['equipo', 'jugador'],
      ['departamento', 'empleado'],
      ['categoria', 'producto'],
      ['proyecto', 'tarea'],
    ];

    return aggregationPairs.some(
      ([whole, part]) => source.includes(whole) && target.includes(part),
    );
  }

  async analyzeUmlFromImage(imageBuffer: Buffer): Promise<AiResponse> {
    try {
      // 1. Convertir imagen y redimensionar para mejor OCR
      const processedBuffer = await sharp(imageBuffer)
        .resize(1920, 1080, { fit: 'inside' })
        .jpeg({ quality: 90 })
        .toBuffer();

      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      await worker.setParameters({
        tessedit_char_whitelist:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789(){}[]:;,.-+*_=<>!@#$%^&|\\/"\'`~? \n\t',
        tessedit_pageseg_mode: 6 as any, // ✅ Cast como any para evitar el error de tipo
      });

      const {
        data: { text: extractedText },
      } = await worker.recognize(processedBuffer);

      await worker.terminate();

      console.log('[AI] Extracted text from image:', extractedText);

      if (!extractedText || extractedText.trim().length < 10) {
        return this.getImageAnalysisFallback();
      }

      // 3. Procesar el texto extraído con Groq para identificar clases UML
      const systemPrompt = `Analiza este texto extraído de un diagrama UML y extrae la información de clases.

El texto puede contener nombres de clases, atributos, métodos y relaciones.
Busca patrones típicos de UML como:
- Nombres de clases (usualmente en mayúsculas o CamelCase)
- Atributos con tipos (ej: "name: String", "id: int", "email: string")
- Métodos con paréntesis (ej: "getName()", "setId(int)", "login()")
- Palabras de relación como "extends", "implements", "has", "uses"

IMPORTANTE: 
- Extrae TODOS los atributos y métodos que encuentres para cada clase
- Si ves líneas como "+attribute", "-method", "public", "private", inclúyelos
- Mantén los tipos de datos originales si están presentes

RESPONDE SIEMPRE en formato JSON válido:
{
  "content": "Descripción de lo encontrado en el diagrama",
  "suggestions": {
    "classes": [
      {
        "name": "NombreClase",
        "attributes": ["tipo atributo1", "tipo atributo2"],
        "methods": ["metodo1()", "metodo2()"]
      }
    ],
    "relations": [
      {
        "from": "ClaseA",
        "to": "ClaseB", 
        "type": "ASSOCIATION"
      }
    ]
  }
}`;

      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Analiza este texto extraído de un diagrama UML y extrae TODAS las clases, atributos, métodos y relaciones que puedas identificar:\n\nTEXTO EXTRAÍDO:\n${extractedText}\n\nPor favor, extrae toda la información posible de clases UML.`,
          },
        ],
        model: 'llama-3.1-8b-instant', // Cambiar a un modelo válido
        temperature: 0.1,
        max_tokens: 2000,
      });

      const raw = completion.choices?.[0]?.message?.content ?? '';
      console.log('[AI] Raw Groq response:', raw);

      if (!raw) {
        return this.getImageAnalysisFallbackWithText(extractedText);
      }

      const parsed = this.tryParseJsonStrictOrLoose(raw);
      if (!parsed) {
        console.log('[AI] Failed to parse JSON, using fallback with text');
        return this.getImageAnalysisFallbackWithText(extractedText);
      }

      const normalized = this.normalizeAiResponse(parsed);
      if (!normalized || !normalized.suggestions?.classes?.length) {
        console.log('[AI] No valid classes found, using fallback with text');
        return this.getImageAnalysisFallbackWithText(extractedText);
      }

      console.log('[AI] Successfully analyzed image:', {
        classCount: normalized.suggestions.classes.length,
        relationCount: normalized.suggestions.relations?.length || 0,
      });

      return normalized;
    } catch (err) {
      console.error('[AiService] Error analyzing image:', err);
      return this.getImageAnalysisFallback();
    }
  }

  // ✅ Agregar función fallback mejorada con análisis de texto
  private getImageAnalysisFallbackWithText(extractedText?: string): AiResponse {
    if (!extractedText || extractedText.trim().length < 5) {
      return this.getImageAnalysisFallback();
    }

    // Fallback mejorado: extraer información básica del texto
    const lines = extractedText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const possibleClasses: Array<{
      name: string;
      attributes: string[];
      methods: string[];
    }> = [];

    // Patrones mejorados para detectar elementos UML
    const classPattern = /\b[A-Z][a-zA-Z0-9]*\b/g;
    const methodPattern = /\b\w+\s*\([^)]*\)\s*:?\s*\w*/g;
    const attributePattern = /\b\w+\s*:\s*\w+\b/g;

    // Buscar posibles nombres de clases
    const potentialClassNames = new Set<string>();

    lines.forEach((line) => {
      const matches = line.match(classPattern);
      if (matches) {
        matches.forEach((match) => {
          // Filtrar palabras comunes que no son clases
          if (
            match.length > 2 &&
            ![
              'String',
              'Integer',
              'Boolean',
              'Date',
              'Array',
              'List',
              'void',
              'int',
              'bool',
            ].includes(match) &&
            !match.toLowerCase().includes('class') // Evitar la palabra "class" misma
          ) {
            potentialClassNames.add(match);
          }
        });
      }
    });

    // Crear clases básicas con la información disponible
    Array.from(potentialClassNames)
      .slice(0, 8) // Incrementar límite
      .forEach((className) => {
        const attributes: string[] = [];
        const methods: string[] = [];

        // Buscar atributos y métodos relacionados con esta clase
        lines.forEach((line) => {
          if (line.toLowerCase().includes(className.toLowerCase())) {
            const attrMatches = line.match(attributePattern);
            const methodMatches = line.match(methodPattern);

            if (attrMatches) {
              attributes.push(...attrMatches.map((attr) => attr.trim()));
            }
            if (methodMatches) {
              methods.push(...methodMatches.map((method) => method.trim()));
            }
          }
        });

        // Agregar atributos y métodos genéricos si no se encontraron
        if (attributes.length === 0) {
          attributes.push(
            `id: int`,
            `${className.toLowerCase()}Name: string`,
            `createdAt: date`,
          );
        }

        if (methods.length === 0) {
          methods.push(
            `get${className}()`,
            `set${className}()`,
            `save(): void`,
            `delete(): void`,
          );
        }

        possibleClasses.push({
          name: className,
          attributes: [...new Set(attributes)].slice(0, 8), // Eliminar duplicados
          methods: [...new Set(methods)].slice(0, 8), // Eliminar duplicados
        });
      });

    // Si no se encontraron clases, crear al menos una clase ejemplo
    if (possibleClasses.length === 0 && extractedText.length > 20) {
      const allMatches = extractedText.match(/\b\w{3,}\b/g) || [];
      const uniqueWords = [...new Set(allMatches)].slice(0, 5);

      if (uniqueWords.length > 0) {
        possibleClasses.push({
          name: 'ClaseDetectada',
          attributes: ['id: int', 'name: string', 'status: string'],
          methods: ['getId(): int', 'getName(): string', 'save(): void'],
        });
      }
    }

    const resultMessage =
      possibleClasses.length > 0
        ? `Se extrajeron ${possibleClasses.length} clases del diagrama. Revisa y ajusta los atributos y métodos según sea necesario.`
        : 'Se extrajo texto de la imagen pero no se pudieron identificar clases UML claras. Revisa que la imagen contenga un diagrama UML con texto legible.';

    return {
      content: resultMessage,
      suggestions: {
        classes: possibleClasses,
        relations: [], // Las relaciones son difíciles de extraer del OCR simple
      },
    };
  }

  private getImageAnalysisFallback(): AiResponse {
    return {
      content:
        'No se pudo procesar la imagen. Asegúrate de que sea un diagrama UML claro con clases visibles y texto legible. Recomendaciones: usar alta resolución, buen contraste y texto claramente visible.',
      suggestions: {
        classes: [],
        relations: [],
      },
    };
  }

  async analyzeUmlRequest(userInput: string): Promise<AiResponse> {
    const systemPrompt = `Eres un experto en diseño de software y diagramas UML. 
Responde SIEMPRE en formato JSON con esta estructura exacta:
{
  "content": "Explicación del análisis en español",
  "suggestions": {
    "classes": [
      {
        "name": "NombreClase",
        "attributes": ["String nombre", "Integer edad"],
        "methods": ["metodo1()", "metodo2()"]
      }
    ],
    "relations": [
      {
        "from": "ClaseA",
        "to": "ClaseB",
        "type": "ONE_TO_MANY"
      }
    ]
  }
}
Tipos de relaciones válidos: ONE_TO_ONE, ONE_TO_MANY, MANY_TO_ONE, MANY_TO_MANY, ASSOCIATION, INHERITANCE, COMPOSITION, AGGREGATION.
Si no hay sugerencias claras, responde solo con "content".`;

    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInput },
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.3, // más determinista para JSON
        max_tokens: 1000,
      });

      const raw = completion.choices?.[0]?.message?.content ?? '';
      if (!raw) {
        return this.getFallbackResponse(userInput);
      }

      const parsed = this.tryParseJsonStrictOrLoose(raw);
      if (!parsed) {
        // Devolver el texto crudo si no logramos parsear; el front igual verá algo útil.
        return { content: raw };
      }

      const normalized = this.normalizeAiResponse(parsed);
      return normalized ?? { content: raw };
    } catch (err) {
      console.error('[AiService] Error calling Groq API:', err);

      return this.getFallbackResponse(userInput);
    }
  }

  /** Intenta parsear JSON:
   *  1) Si viene con ```json ... ```, lo limpia.
   *  2) Si hay texto extra, intenta extraer el primer bloque JSON balanceado.
   */
  private tryParseJsonStrictOrLoose(text: string): any | null {
    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/```(json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch?.[2]) {
      cleaned = fenceMatch[2].trim();
      try {
        return JSON.parse(cleaned);
      } catch {}
    }

    // 2) Intentar JSON.parse directo
    try {
      return JSON.parse(cleaned);
    } catch {
      /* sigue */
    }

    // 3) Extraer primer bloque {...} balanceado
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace >= 0) {
      let depth = 0;
      for (let i = firstBrace; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (ch === '{') depth++;
        if (ch === '}') depth--;
        if (depth === 0) {
          const candidate = cleaned.slice(firstBrace, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            /* sigue */
          }
          break;
        }
      }
    }

    return null;
  }

  /** Normaliza AiResponse, asegura arrays y filtra tipos de relación inválidos */
  private normalizeAiResponse(input: any): AiResponse | null {
    if (!input || typeof input !== 'object') return null;

    const content =
      typeof input.content === 'string'
        ? input.content
        : 'Análisis no disponible.';

    const suggestions = input.suggestions ?? {};
    const classes = Array.isArray(suggestions.classes)
      ? suggestions.classes
      : [];
    const relations = Array.isArray(suggestions.relations)
      ? suggestions.relations
      : [];

    const normClasses = classes
      .map((c) => ({
        name: String(c?.name ?? '').trim(),
        attributes: Array.isArray(c?.attributes)
          ? c.attributes.map(String)
          : [],
        methods: Array.isArray(c?.methods) ? c.methods.map(String) : [],
      }))
      .filter((c) => c.name);

    const normRelations = relations
      .map((r) => {
        const typeRaw = String(r?.type ?? '')
          .toUpperCase()
          .trim();
        const validType = RELATION_TYPES.includes(typeRaw as RelationType)
          ? (typeRaw as RelationType)
          : undefined;
        return {
          from: String(r?.from ?? '').trim(),
          to: String(r?.to ?? '').trim(),
          type: validType ?? 'ASSOCIATION', // fallback seguro
        };
      })
      .filter((r) => r.from && r.to);

    const out: AiResponse = {
      content,
      suggestions: {
        classes: normClasses,
        relations: normRelations,
      },
    };

    // Si no hay nada útil en suggestions, puedes optar por devolver solo `content`
    if (
      !out.suggestions?.classes?.length &&
      !out.suggestions?.relations?.length
    ) {
      return { content };
    }

    return out;
  }

  /** Fallback simple para ambientes sin clave o errores de red */
  private getFallbackResponse(userInput: string): AiResponse {
    const lower = userInput.toLowerCase();

    if (lower.includes('biblioteca') || lower.includes('library')) {
      return {
        content:
          'Propuesta para sistema de biblioteca con entidades Usuario, Libro y Préstamo.',
        suggestions: {
          classes: [
            {
              name: 'Usuario',
              attributes: [
                'String nombre',
                'String email',
                'Date fechaRegistro',
              ],
              methods: [
                'prestarLibro()',
                'devolverLibro()',
                'consultarHistorial()',
              ],
            },
            {
              name: 'Libro',
              attributes: [
                'String titulo',
                'String autor',
                'String isbn',
                'Boolean disponible',
              ],
              methods: [
                'marcarDisponible()',
                'marcarPrestado()',
                'obtenerInformacion()',
              ],
            },
            {
              name: 'Prestamo',
              attributes: [
                'Date fechaPrestamo',
                'Date fechaVencimiento',
                'Boolean devuelto',
              ],
              methods: [
                'calcularMulta()',
                'marcarDevuelto()',
                'extenderPrestamo()',
              ],
            },
          ],
          relations: [
            { from: 'Usuario', to: 'Prestamo', type: 'ONE_TO_MANY' },
            { from: 'Libro', to: 'Prestamo', type: 'ONE_TO_MANY' },
          ],
        },
      };
    }

    if (
      lower.includes('tienda') ||
      lower.includes('ecommerce') ||
      lower.includes('e-commerce')
    ) {
      return {
        content: 'Propuesta para e-commerce con Cliente, Producto y Pedido.',
        suggestions: {
          classes: [
            {
              name: 'Cliente',
              attributes: ['String nombre', 'String email', 'String direccion'],
              methods: [
                'realizarCompra()',
                'consultarPedidos()',
                'actualizarPerfil()',
              ],
            },
            {
              name: 'Producto',
              attributes: [
                'String nombre',
                'Double precio',
                'Integer stock',
                'String categoria',
              ],
              methods: [
                'actualizarStock()',
                'calcularDescuento()',
                'obtenerDetalles()',
              ],
            },
            {
              name: 'Pedido',
              attributes: ['Date fechaPedido', 'Double total', 'String estado'],
              methods: [
                'calcularTotal()',
                'actualizarEstado()',
                'generarFactura()',
              ],
            },
          ],
          relations: [
            { from: 'Cliente', to: 'Pedido', type: 'ONE_TO_MANY' },
            { from: 'Producto', to: 'Pedido', type: 'MANY_TO_MANY' },
          ],
        },
      };
    }

    return {
      content:
        'Para ayudarte mejor, cuéntame: tipo de sistema, entidades principales y funcionalidades. Ej.: “Biblioteca”, “E-commerce”, “RRHH”, etc.',
    };
  }
}
