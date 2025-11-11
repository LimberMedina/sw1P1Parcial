import { Injectable } from '@nestjs/common';
import { AiService } from './ai.service';

export interface DiagramContext {
  nodes: Array<{
    id: string;
    name: string;
    attributes: string[];
    methods: string[];
    shape?: string;
  }>;
  edges: Array<{
    id: string;
    source: string; // normalmente IDs de nodos
    target: string;
    type: string; // 'assoc' | 'inherit' | 'comp' | 'aggr' | 'dep' | 'many-to-many' | ...
    labels?: string[];
  }>;
  lastAction?: string;
  userLevel: 'beginner' | 'intermediate' | 'advanced';
}

export interface AssistantSuggestion {
  action: string;
  description: string;
  shortcut?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface AssistantResponse {
  message: string;
  suggestions?: {
    classes?: Array<{ name: string; attributes: string[]; methods: string[] }>;
    relations?: Array<{
      from: string;
      to: string;
      type: string;
      // multiplicity opcional para each end
      multiplicity?: {
        source?: string;
        target?: string;
      };
    }>;
  };
  tips?: string[];
  nextSteps?: string[];
  // Para que el front las muestre como "acciones rápidas"
  contextualHelp?: AssistantSuggestion[];
}

@Injectable()
export class AiAssistantService {
  constructor(private readonly aiService: AiService) {}

  /**
   * Convierte el resultado del scan de imagen en sugerencias del asistente
   * que el frontend puede interpretar y ejecutar automáticamente
   */
  async convertScanToSuggestions(scanResult: any): Promise<AssistantResponse> {
    console.log('[AiAssistant] Convirtiendo scan a sugerencias:', {
      classCount: scanResult.classes?.length || 0,
      relationCount: scanResult.relations?.length || 0,
    });

    // Convertir las clases del scan al formato de sugerencias
    const classSuggestions = (scanResult.classes || []).map((cls: any) => ({
      name: cls.name,
      attributes: cls.attributes || [],
      methods: cls.methods || [],
    }));

    // Convertir las relaciones del scan al formato de sugerencias
    const relationSuggestions = (scanResult.relations || []).map(
      (rel: any) => ({
        from: rel.from,
        to: rel.to,
        type: rel.type || 'assoc',
        multiplicity: rel.multiplicity
          ? {
              source: rel.multiplicity.source
                ? String(rel.multiplicity.source).trim()
                : undefined,
              target: rel.multiplicity.target
                ? String(rel.multiplicity.target).trim()
                : undefined,
            }
          : undefined,
      }),
    );

    const message =
      `✨ **Diagrama detectado desde imagen:**\n\n` +
      `📦 **${classSuggestions.length} clases encontradas:** ${classSuggestions.map((c) => c.name).join(', ')}\n` +
      `🔗 **${relationSuggestions.length} relaciones detectadas**\n\n` +
      `${scanResult.description || 'Diagrama UML de clases'}\n\n` +
      `⭐ **Confianza:** ${scanResult.confidence || 'medium'}\n\n` +
      `Las clases y relaciones se crearán automáticamente.`;

    console.log('[AiAssistant] Sugerencias generadas:', {
      classes: classSuggestions.length,
      relations: relationSuggestions.length,
    });

    return {
      message,
      suggestions: {
        classes: classSuggestions,
        relations: relationSuggestions,
      },
      tips: [
        '🎨 Las clases se crearán automáticamente en el editor',
        '🔗 Las relaciones se conectarán después de crear las clases',
        '✏️ Puedes editar cualquier clase después de crearla',
      ],
      nextSteps: [
        'Revisa las clases creadas',
        'Verifica las relaciones',
        'Edita o agrega más detalles si es necesario',
      ],
    };
  }

  async getContextualHelp(
    context: DiagramContext,
    userMessage?: string,
  ): Promise<AssistantResponse> {
    const analysis = this.analyzeDiagramState(context);

    if (userMessage && userMessage.trim()) {
      return this.handleUserMessage(userMessage, context, analysis);
    }

    return this.generateProactiveGuidance(context, analysis);
  }

  // -------------------- ANALISIS DEL DIAGRAMA --------------------
  private analyzeDiagramState(context: DiagramContext) {
    const { nodes, edges } = context;

    const hasClasses = nodes.length > 0;
    const hasRelations = edges.length > 0;

    // nodos sin relación (comparando por ID)
    const unconnected = nodes.filter(
      (n) => !edges.some((e) => e.source === n.id || e.target === n.id),
    );

    // clases “vacías”
    const empty = nodes.filter(
      (n) =>
        (n.attributes?.length ?? 0) === 0 && (n.methods?.length ?? 0) === 0,
    );

    const needsMoreDetail = nodes.some((n) => {
      const a = n.attributes ?? [];
      const m = n.methods ?? [];
      return a.length < 2 && m.length < 1;
    });

    const relTypes = new Set(edges.map((e) => e.type));
    const flags = {
      hasInheritance: relTypes.has('inherit'),
      hasAssociations: relTypes.has('assoc') || relTypes.has('nav'),
      hasAggregation: relTypes.has('aggr'),
      hasComposition: relTypes.has('comp'),
      hasDependency: relTypes.has('dep'),
      hasManyToMany: relTypes.has('many-to-many'),
    };

    const isWellStructured =
      nodes.length >= 3 && edges.length >= 2 && !empty.length;

    return {
      hasClasses,
      classCount: nodes.length,
      hasRelations,
      relationCount: edges.length,
      hasEmptyClasses: empty.length > 0,
      hasUnconnectedClasses: unconnected.length > 0,
      needsMoreDetail,
      isWellStructured,
      classNames: nodes.map((n) => n.name || 'Unnamed').filter(Boolean),
      ...flags,
    };
  }

  // -------------------- RESPUESTAS PROACTIVAS --------------------
  private async generateProactiveGuidance(
    context: DiagramContext,
    analysis: ReturnType<AiAssistantService['analyzeDiagramState']>,
  ): Promise<AssistantResponse> {
    if (!analysis.hasClasses) {
      return {
        message: '¡Hola! 👋 Tu diagrama está vacío. Te ayudo a empezar.',
        contextualHelp: [
          {
            action: 'create_first_class',
            description: 'Crear tu primera clase',
            shortcut: "Activa la herramienta 'Clase' y haz clic en el lienzo",
            priority: 'high',
          },
          {
            action: 'describe_system',
            description: 'Describir tu sistema para generar clases',
            shortcut: "Ej: 'Quiero un sistema de biblioteca'",
            priority: 'high',
          },
        ],
        tips: [
          '💡 Comienza con 2–3 entidades principales',
          '🎯 Piensa en sustantivos relevantes (Usuario, Producto, Pedido)',
        ],
        nextSteps: [
          '1) Crea 2–3 clases base',
          '2) Agrega atributos',
          '3) Define relaciones',
        ],
      };
    }

    if (analysis.classCount < 3) {
      return {
        message: `Tienes ${analysis.classCount} clase(s). Suele ayudar agregar 1–2 más.`,
        contextualHelp: [
          {
            action: 'create_first_class',
            description: 'Agregar otra clase',
            shortcut: "Herramienta 'Clase' en el sidebar",
            priority: 'high',
          },
        ],
        tips: ['🏗️ Un diagrama típico tiene 4–8 clases principales.'],
      };
    }

    if (analysis.hasEmptyClasses || analysis.needsMoreDetail) {
      return {
        message:
          'Veo clases con poco detalle. Completemos atributos y métodos.',
        contextualHelp: [
          {
            action: 'edit_class',
            description: 'Editar clase para agregar contenido',
            shortcut: "Clic derecho → 'Editar clase'",
            priority: 'high',
          },
        ],
        tips: [
          '📋 Añade al menos 2 atributos por clase',
          '⚙️ Incluye 1–2 métodos clave por clase',
        ],
      };
    }

    if (!analysis.hasRelations && analysis.classCount >= 2) {
      return {
        message: 'Tienes clases pero sin relaciones. ¡Conectémoslas!',
        contextualHelp: [
          {
            action: 'create_association',
            description: 'Crear asociación (relación simple)',
            shortcut: "Herramienta 'Asociación' en el sidebar",
            priority: 'high',
          },
          {
            action: 'create_inheritance',
            description: 'Crear herencia',
            shortcut: 'Clase hija → clase padre',
            priority: 'medium',
          },
          {
            action: 'create_composition',
            description: 'Crear composición',
            shortcut: 'Contenedor → contenido',
            priority: 'medium',
          },
        ],
        tips: ['🔗 Las relaciones muestran la interacción entre tus clases.'],
      };
    }

    if (analysis.isWellStructured) {
      return {
        message: '¡Excelente! Tu diagrama se ve completo. 🎉',
        contextualHelp: [
          {
            action: 'generate_code',
            description: 'Generar proyecto Spring Boot',
            shortcut: "Botón 'Generar Código' en el sidebar",
            priority: 'high',
          },
        ],
        tips: [
          '✨ Considera agregar cardinalidades visibles (*, 1..*, etc.)',
          '🚀 Ya puedes generar el backend',
        ],
      };
    }

    return {
      message: '¿En qué te ayudo con tu diagrama?',
      contextualHelp: [
        {
          action: 'ask_question',
          description: 'Hacer una pregunta específica',
          shortcut: 'Escribe tu duda en el chat',
          priority: 'medium',
        },
      ],
    };
  }

  // -------------------- MENSAJES DEL USUARIO --------------------
  private normalize(text: string) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
  }

  private parseCreateClassCommand(msg: string) {
    // patrones básicos: "crea una clase Usuario", "crear clase Producto con atributos nombre:String, precio:Decimal"
    // muy flexible y tolerante
    const nameMatch =
      msg.match(/clase\s+([a-z0-9_][\w-]*)/i) ||
      msg.match(/crea[r]?\s+([a-z0-9_][\w-]*)/i);

    if (!nameMatch) return null;

    const className =
      nameMatch[1].replace(/[^A-Za-z0-9_]/g, '').replace(/^[^A-Za-z_]/, 'C') || // asegurar inicio válido
      'Clase';

    // atributos después de "con" o "atributos"
    const attrsMatch =
      msg.match(/atributos?\s*[:\-]\s*([^.;\n]+)/i) ||
      msg.match(/con\s+([^.;\n]+)/i);

    const rawAttrs = attrsMatch?.[1] ?? '';
    // separar por coma y mapear a "nombre: Tipo" (fallback String)
    const attributes = rawAttrs
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((p, i) => {
        // soportar "nombre: Tipo" | "Tipo nombre" | "nombre"
        const colon = p.indexOf(':');
        if (colon !== -1) {
          const n =
            p.slice(0, colon).trim().replace(/\s+/g, '_') || `campo_${i + 1}`;
          const t = p.slice(colon + 1).trim() || 'String';
          return `${this.safeId(n)}: ${t}`;
        }
        const parts = p.split(/\s+/);
        if (parts.length === 2) {
          const [a, b] = parts;
          if (/^[A-Z]/.test(a)) return `${this.safeId(b)}: ${a}`;
          if (/^[A-Z]/.test(b)) return `${this.safeId(a)}: ${b}`;
        }
        return `${this.safeId(p)}: String`;
      });

    return {
      className,
      attributes,
      methods: [] as string[],
    };
  }

  private safeId(s: string) {
    let x = (s || 'campo').replace(/[^\p{L}\p{N}_$]/gu, '_');
    if (/^\d/.test(x)) x = '_' + x;
    return x;
  }

  private parseEditClassCommand(msg: string, context: DiagramContext) {
    // Patrones: "agrega atributo id a clase Usuario", "añade nombre:String y edad:Integer a la tabla Persona"
    // "agrega método calcular() a clase Producto"

    console.log('[parseEditClassCommand] Mensaje original:', msg);

    const normalizedMsg = this.normalize(msg);

    // Detectar si es agregar atributo o método
    const isAttribute =
      normalizedMsg.includes('atributo') || normalizedMsg.includes('atributos');
    const isMethod =
      normalizedMsg.includes('metodo') || normalizedMsg.includes('metodos');

    console.log('[parseEditClassCommand] Detección:', {
      isAttribute,
      isMethod,
      normalizedMsg,
    });

    if (!isAttribute && !isMethod) return null;

    // Extraer nombre de la clase objetivo: "a clase X", "en clase X", "de la tabla X", etc.
    const classMatch = msg.match(
      /(?:(?:a|en|de|para)\s+(?:la\s+)?(?:clase|tabla)\s+)([a-z0-9_][\w-]*)/i,
    );

    if (!classMatch) return null;

    const targetClassName = classMatch[1].trim();

    // Buscar el nodo en el contexto
    const targetNode = context.nodes.find(
      (n) => this.normalize(n.name) === this.normalize(targetClassName),
    );

    if (!targetNode) {
      return {
        error: `No encontré la clase "${targetClassName}" en el diagrama. Clases disponibles: ${context.nodes.map((n) => n.name).join(', ')}`,
        targetClassName,
      };
    }

    // Extraer atributos/métodos a agregar
    let newAttributes: string[] = [];
    let newMethods: string[] = [];

    if (isAttribute) {
      // Extraer desde "agrega" hasta " a/en/de/para clase/tabla" (más flexible)
      // El regex ahora excluye mejor los artículos y la palabra "atributo(s)"
      const attrText = msg.match(
        /(?:agrega|añade|anade)\s+(?:(?:el|la|los|las|un|una)\s+)?(?:atributo?\s+)?(.+?)(?:\s+(?:a|en|de|para)\s+(?:la\s+)?(?:clase|tabla))/i,
      );

      console.log('[parseEditClassCommand] Regex match resultado:', attrText);

      if (attrText?.[1]) {
        const rawAttrs = attrText[1].trim();

        console.log('[parseEditClassCommand] Raw attributes:', rawAttrs);

        // Separar por comas o 'y'
        const attrParts = rawAttrs.split(/\s*(?:,|y)\s*/i).filter(Boolean);

        console.log('[parseEditClassCommand] Attribute parts:', attrParts);

        newAttributes = attrParts.map((p, i) => {
          p = p.trim();

          // 🧹 LIMPIAR palabras comunes que no son parte del atributo (segunda capa de limpieza)
          // Remover artículos y palabras de relleno que puedan haber quedado
          p = p.replace(
            /^(?:el|la|los|las|un|una|unos|unas|atributo|atributos)\s+/gi,
            '',
          );
          p = p.trim();

          console.log(`[parseEditClassCommand] Atributo limpio [${i}]:`, p);

          // Soportar "id:Integer", "nombre: String", "Integer id", "id"
          const colonMatch = p.match(/^(\w+)\s*:\s*(\w+)$/);
          if (colonMatch) {
            return `${this.safeId(colonMatch[1])}: ${colonMatch[2]}`;
          }

          const spaceMatch = p.match(/^([A-Z]\w+)\s+(\w+)$/);
          if (spaceMatch) {
            return `${this.safeId(spaceMatch[2])}: ${spaceMatch[1]}`;
          }

          // Solo nombre → String por defecto
          return `${this.safeId(p)}: String`;
        });
      }
    }

    if (isMethod) {
      // Extraer desde "agrega" hasta " a/en/de/para clase/tabla" (más flexible)
      // El regex ahora excluye mejor los artículos y la palabra "método(s)"
      const methodText = msg.match(
        /(?:agrega|añade|anade)\s+(?:(?:el|la|los|las|un|una)\s+)?(?:metodos?\s+)?(.+?)(?:\s+(?:a|en|de|para)\s+(?:la\s+)?(?:clase|tabla))/i,
      );

      if (methodText?.[1]) {
        const rawMethods = methodText[1].trim();
        const methodParts = rawMethods.split(/\s*(?:,|y)\s*/i).filter(Boolean);

        newMethods = methodParts.map((m) => {
          m = m.trim();

          // 🧹 LIMPIAR palabras comunes que no son parte del método
          m = m.replace(
            /^(?:el|la|los|las|un|una|unos|unas|metodo|metodos|método|métodos)\s+/gi,
            '',
          );
          m = m.trim();

          console.log('[parseEditClassCommand] Método limpio:', m);

          // Asegurar que tenga paréntesis
          if (!m.includes('(')) {
            m = `${m}()`;
          }
          return m;
        });
      }
    }

    console.log('[parseEditClassCommand] Resultado final:', {
      targetClassName: targetNode.name,
      newAttributes,
      newMethods,
      currentAttributes: targetNode.attributes || [],
      currentMethods: targetNode.methods || [],
    });

    return {
      targetNodeId: targetNode.id,
      targetClassName: targetNode.name,
      newAttributes,
      newMethods,
      currentAttributes: targetNode.attributes || [],
      currentMethods: targetNode.methods || [],
    };
  }

  private parseAddRelationCommand(msg: string, context: DiagramContext) {
    // Patrones: "crea una relación de agregación de alumno a docente"
    // "añade una asociación entre Usuario y Producto"
    // "agrega herencia de Estudiante hacia Persona"

    console.log('[parseAddRelationCommand] Mensaje original:', msg);

    const normalizedMsg = this.normalize(msg);

    // Detectar tipo de relación
    let relationType: string | null = null;
    const relationMap = {
      asociacion: 'assoc',
      herencia: 'inherit',
      generalizacion: 'inherit',
      composicion: 'comp',
      agregacion: 'aggr',
      dependencia: 'dep',
      'muchos a muchos': 'many-to-many',
      'muchos-a-muchos': 'many-to-many',
    };

    for (const [key, value] of Object.entries(relationMap)) {
      if (normalizedMsg.includes(key)) {
        relationType = value;
        break;
      }
    }

    if (!relationType) {
      // Si no especifica tipo, asumir asociación por defecto
      relationType = 'assoc';
    }

    console.log('[parseAddRelationCommand] Tipo de relación:', relationType);

    // Extraer clases origen y destino
    // Patrones: "de X a Y", "de X hacia Y", "entre X y Y", "desde X hasta Y"
    let sourceClassName: string | null = null;
    let targetClassName: string | null = null;

    // Patrón 1: "de X a/hacia Y"
    const pattern1 = msg.match(
      /(?:de|desde)\s+(?:la\s+)?(?:clase|tabla)?\s*([a-z0-9_][\w-]*)\s+(?:a|hacia|hasta)\s+(?:la\s+)?(?:clase|tabla)?\s*([a-z0-9_][\w-]*)/i,
    );

    if (pattern1) {
      sourceClassName = pattern1[1].trim();
      targetClassName = pattern1[2].trim();
    }

    // Patrón 2: "entre X y Y"
    if (!sourceClassName || !targetClassName) {
      const pattern2 = msg.match(
        /(?:entre)\s+(?:la\s+)?(?:clase|tabla)?\s*([a-z0-9_][\w-]*)\s+y\s+(?:la\s+)?(?:clase|tabla)?\s*([a-z0-9_][\w-]*)/i,
      );

      if (pattern2) {
        sourceClassName = pattern2[1].trim();
        targetClassName = pattern2[2].trim();
      }
    }

    console.log('[parseAddRelationCommand] Clases detectadas:', {
      sourceClassName,
      targetClassName,
    });

    // Normalizar variantes de multiplicidad que usuarios o OCR pueden escribir
    // Ejemplos: '1...m', '1...N', '1..n' -> '1..*' ; '0...n' -> '0..*'
    let msgNormalized = msg.replace(/…/g, '...');
    msgNormalized = msgNormalized.replace(/\b1\.{2,}\s*[mMnN]\b/g, '1..*');
    msgNormalized = msgNormalized.replace(/\b0\.{2,}\s*[mMnN]\b/g, '0..*');
    msgNormalized = msgNormalized.replace(/\.{3,}/g, '..');
    msgNormalized = msgNormalized.replace(/\b1\.{2,}\s*\*\b/g, '1..*');
    msgNormalized = msgNormalized.replace(/\b0\.{2,}\s*\*\b/g, '0..*');

    if (!sourceClassName || !targetClassName) {
      return {
        error:
          'No pude identificar las clases para la relación. Usa el formato: "crea una [tipo] de [ClaseOrigen] a [ClaseDestino]"',
      };
    }

    // --- Detectar multiplicidades explícitas cerca de los nombres de clase ---

    let sourceMultiplicity: string | undefined = undefined;
    let targetMultiplicity: string | undefined = undefined;

    try {
      const srcRegex = new RegExp(
        sourceClassName +
          '\\\\s*\\(?\\s*(' +
          '1\\.\\.\\*|1\\.\\.1|0\\.\\.1|0\\.\\.\\*|\\*' +
          ')\\s*\\)?',
        'i',
      );
      const tgtRegex = new RegExp(
        targetClassName +
          '\\\\s*\\(?\\s*(' +
          '1\\.\\.\\*|1\\.\\.1|0\\.\\.1|0\\.\\.\\*|\\*' +
          ')\\s*\\)?',
        'i',
      );
      const srcMatch = msgNormalized.match(srcRegex);
      const tgtMatch = msgNormalized.match(tgtRegex);
      if (srcMatch && srcMatch[1]) sourceMultiplicity = srcMatch[1];
      if (tgtMatch && tgtMatch[1]) targetMultiplicity = tgtMatch[1];
    } catch (e) {
      // ignore regex errors
    }

    // Soporte frases comunes en español: "uno a muchos", "uno a uno", "cero o uno", "cero a muchos"
    const normalized = this.normalize(msg);
    if (!sourceMultiplicity && !targetMultiplicity) {
      if (
        normalized.includes('uno a muchos') ||
        normalized.includes('uno a muchos')
      ) {
        sourceMultiplicity = '1..1';
        targetMultiplicity = '1..*';
      } else if (
        normalized.includes('uno a uno') ||
        normalized.includes('uno a uno')
      ) {
        sourceMultiplicity = '1..1';
        targetMultiplicity = '1..1';
      } else if (
        normalized.includes('cero o uno') ||
        normalized.includes('cero o uno')
      ) {
        sourceMultiplicity = '0..1';
        targetMultiplicity = '0..1';
      } else if (
        normalized.includes('cero a muchos') ||
        normalized.includes('cero a muchos')
      ) {
        sourceMultiplicity = '0..1';
        targetMultiplicity = '0..*';
      }
    }
    // Buscar las clases en el contexto
    const sourceNode = context.nodes.find(
      (n) => this.normalize(n.name) === this.normalize(sourceClassName),
    );

    const targetNode = context.nodes.find(
      (n) => this.normalize(n.name) === this.normalize(targetClassName),
    );

    if (!sourceNode) {
      return {
        error: `No encontré la clase origen "${sourceClassName}". Clases disponibles: ${context.nodes.map((n) => n.name).join(', ')}`,
      };
    }

    if (!targetNode) {
      return {
        error: `No encontré la clase destino "${targetClassName}". Clases disponibles: ${context.nodes.map((n) => n.name).join(', ')}`,
      };
    }

    console.log('[parseAddRelationCommand] Resultado final:', {
      from: sourceNode.name,
      to: targetNode.name,
      type: relationType,
    });

    return {
      from: sourceNode.name,
      to: targetNode.name,
      type: relationType,
      multiplicity:
        sourceMultiplicity || targetMultiplicity
          ? {
              source: sourceMultiplicity,
              target: targetMultiplicity,
            }
          : undefined,
      sourceNode,
      targetNode,
    };
  }

  private async handleUserMessage(
    message: string,
    context: DiagramContext,
    analysis: ReturnType<AiAssistantService['analyzeDiagramState']>,
  ): Promise<AssistantResponse> {
    const normalized = this.normalize(message);

    // 🔍 DEBUG: Log para verificar contexto
    console.log('[AI Assistant] Contexto recibido:', {
      classCount: context.nodes.length,
      edgeCount: context.edges.length,
      classes: context.nodes.map((n) => n.name),
    });

    const TUTORIAL_CONTEXT = {
      appName: 'Diagramador UML UAGRM',
      interface: {
        sidebar: 'Panel izquierdo con herramientas',
        canvas: 'Área principal de trabajo (lienzo blanco)',
        tools: [
          'Clase',
          'Asociación',
          'Herencia',
          'Composición',
          'Agregación',
          'Dependencia',
          'Muchos a Muchos',
        ],
        shortcuts: {
          crear_clase:
            "1. Clic en 'Clase' en el sidebar → 2. Clic en el canvas donde quieras crearla",
          drag_clase: "Arrastra el ícono 'Clase' desde el sidebar al canvas",
          editar_clase:
            "Doble clic en la clase OR clic derecho → 'Editar clase'",
          crear_relacion:
            '1. Clic en tipo de relación (sidebar) → 2. Clic en clase origen → 3. Clic en clase destino',
          generar_codigo: "Botón 'Generar Código Spring Boot' en el sidebar",
          exportar: 'Botones de exportar en la barra superior',
        },
      },
    };

    // ✅ PREGUNTAS SOBRE TU SOFTWARE ESPECÍFICO
    if (normalized.includes('como') || normalized.includes('cómo')) {
      // ✅ CREAR CLASES
      if (
        normalized.includes('clase') &&
        (normalized.includes('creo') || normalized.includes('crear'))
      ) {
        return {
          message: `🏗️ **Para crear una clase en ${TUTORIAL_CONTEXT.appName}:**\n\n**Método 1 - Clic directo:**\n1. 🎯 Ve al **sidebar izquierdo**\n2. 🖱️ Haz **clic en "Clase"** (se activará la herramienta)\n3. ✨ Haz **clic en el canvas** donde quieras crear la clase\n\n**Método 2 - Arrastrar:**\n1. 🚀 **Arrastra** el ícono "Clase" desde el sidebar\n2. 🎯 **Suelta** en el canvas donde la quieras\n\n**Después de crear:**\n• **Doble clic** en la clase para editarla\n• **Clic derecho** → "Editar clase" para agregar atributos y métodos`,
          contextualHelp: [
            {
              action: 'create_first_class',
              description: 'Activar herramienta Clase',
              shortcut: 'Clic en "Clase" en el sidebar izquierdo',
              priority: 'high',
            },
            {
              action: 'edit_class',
              description: 'Editar clase después de crearla',
              shortcut: 'Doble clic en la clase OR clic derecho → "Editar"',
              priority: 'high',
            },
          ],
          tips: [
            '🎯 El sidebar izquierdo tiene todas las herramientas',
            '✏️ Siempre puedes editar una clase después de crearla',
            '🔄 Usa Ctrl+Z para deshacer si te equivocas',
          ],
          nextSteps: [
            '1. Crea tu primera clase siguiendo los pasos',
            '2. Edítala para agregar atributos (nombre: String, id: Long)',
            '3. Agrega métodos (getter(), setter())',
            '4. Crea una segunda clase para conectarlas',
          ],
        };
      }

      // ✅ AGREGAR ATRIBUTOS
      if (
        normalized.includes('atributo') &&
        (normalized.includes('agregar') ||
          normalized.includes('añadir') ||
          normalized.includes('agrego'))
      ) {
        return {
          message: `📝 **Para agregar atributos a una clase:**\n\n**Paso a paso:**\n1. 🖱️ **Doble clic** en la clase que quieres editar\n2. 📋 Se abre el **editor de clase**\n3. ✍️ En la sección **"Atributos"**, escribe cada atributo en una línea:\n   • \`nombre: String\`\n   • \`edad: Integer\`\n   • \`email: String\`\n   • \`activo: Boolean\`\n4. ✅ Haz clic en **"Guardar"**\n\n**Formato correcto:**\n\`nombreAtributo: TipoDato\`\n\n**Ejemplos:**\n• \`id: Long\`\n• \`fechaNacimiento: Date\`\n• \`precio: Double\``,
          contextualHelp: [
            {
              action: 'edit_class',
              description: 'Abrir editor de clase',
              shortcut: 'Doble clic en cualquier clase del canvas',
              priority: 'high',
            },
          ],
          tips: [
            '📝 Un atributo por línea en el formato: nombre: Tipo',
            '🔄 Los tipos comunes: String, Integer, Long, Double, Boolean, Date',
            '✨ Los cambios se ven inmediatamente en el diagrama',
          ],
        };
      }

      // ✅ CREAR RELACIONES
      if (
        normalized.includes('relacion') &&
        (normalized.includes('creo') ||
          normalized.includes('crear') ||
          normalized.includes('conectar'))
      ) {
        return {
          message: `🔗 **Para crear relaciones entre clases:**\n\n**Paso a paso:**\n1. 🎯 Ve al **sidebar izquierdo** → sección "Relaciones"\n2. 🖱️ **Selecciona el tipo** de relación que necesitas:\n   • **Asociación**: Relación general\n   • **Herencia**: "es un tipo de" (clase hija → padre)\n   • **Composición**: "contiene a" (rombo negro)\n   • **Agregación**: "tiene un" (rombo blanco)\n   • **Dependencia**: "usa a" (línea punteada)\n3. 🎯 Haz **clic en la clase origen**\n4. 🎯 Haz **clic en la clase destino**\n5. ✨ ¡La relación se crea automáticamente!\n\n**Editar relación:**\n• **Clic derecho** en la línea → "Editar relación"`,
          contextualHelp: [
            {
              action: 'create_association',
              description: 'Crear asociación simple',
              shortcut: 'Sidebar → "Asociación" → clic origen → clic destino',
              priority: 'high',
            },
            {
              action: 'create_inheritance',
              description: 'Crear herencia',
              shortcut: 'Sidebar → "Generalización" → clase hija → clase padre',
              priority: 'medium',
            },
          ],
          tips: [
            '🔗 Primero selecciona el tipo de relación, después las clases',
            '⚡ Asociación es la relación más común',
            '🏗️ Herencia: la flecha apunta al padre',
          ],
        };
      }

      // ✅ GENERAR CÓDIGO
      if (
        normalized.includes('codigo') ||
        normalized.includes('spring') ||
        normalized.includes('generar')
      ) {
        return {
          message: `🚀 **Para generar código Spring Boot:**\n\n**Requisitos:**\n✅ Tener al menos 2-3 clases creadas\n✅ Clases con atributos definidos\n✅ Relaciones entre clases (opcional pero recomendado)\n\n**Paso a paso:**\n1. 🏗️ Completa tu diagrama con clases y relaciones\n2. 📍 Ve al **sidebar izquierdo** → sección "Code Generation"\n3. 🖱️ Haz clic en **"Generar Código Spring Boot"**\n4. ⏳ Espera unos segundos...\n5. 📦 Se descarga un **archivo ZIP** con todo el proyecto\n6. 📂 Extrae el ZIP y ábrelo en tu IDE favorito\n7. ▶️ Ejecuta: \`mvn spring-boot:run\`\n\n**¡Tu API REST estará corriendo en http://localhost:8080!**`,
          contextualHelp: [
            {
              action: 'generate_code',
              description: 'Generar proyecto Spring Boot completo',
              shortcut: 'Sidebar → "Generar Código Spring Boot"',
              priority: 'high',
            },
          ],
          tips: [
            '🎯 Mientras más completo tu diagrama, mejor el código generado',
            '📊 Incluye entidades JPA, DTOs, controladores y servicios',
            '🗄️ Usa H2 Database (perfecto para pruebas)',
          ],
        };
      }

      // ✅ EDITAR CLASES
      if (normalized.includes('editar') || normalized.includes('modificar')) {
        return {
          message: `✏️ **Para editar una clase existente:**\n\n**Método 1 - Doble clic:**\n1. 🖱️ **Doble clic** en cualquier clase del canvas\n2. 📋 Se abre el **Editor de Clase**\n3. ✍️ Modifica lo que necesites\n4. ✅ Clic en **"Guardar"**\n\n**Método 2 - Menú contextual:**\n1. 🖱️ **Clic derecho** en la clase\n2. 📋 Selecciona **"Editar clase"**\n3. ✍️ Haz tus cambios\n4. ✅ Guarda\n\n**Puedes editar:**\n• 📝 **Nombre** de la clase\n• 📊 **Atributos** (agregar, quitar, modificar)\n• ⚙️ **Métodos** (agregar, quitar, modificar)`,
          contextualHelp: [
            {
              action: 'edit_class',
              description: 'Abrir editor de clase',
              shortcut: 'Doble clic en la clase',
              priority: 'high',
            },
          ],
          tips: [
            '🔄 Los cambios se reflejan inmediatamente en el diagrama',
            '📏 La clase se redimensiona automáticamente',
            '💾 Los cambios se guardan automáticamente',
          ],
        };
      }
    }

    // ✅ ANÁLISIS CONTEXTUALIZADO
    if (normalized.includes('analiza') && normalized.includes('diagrama')) {
      const tutorialAnalysis = this.getTutorialAnalysis(analysis);
      return {
        message: `📊 **Análisis de tu diagrama en ${TUTORIAL_CONTEXT.appName}:**\n\n${tutorialAnalysis.message}`,
        contextualHelp: tutorialAnalysis.contextualHelp,
        tips: tutorialAnalysis.tips,
        nextSteps: tutorialAnalysis.nextSteps,
      };
    }

    // ✅ AYUDA GENERAL CONTEXTUALIZADA
    if (
      normalized.includes('ayuda') ||
      normalized.includes('help') ||
      normalized.includes('tutorial')
    ) {
      return {
        message: `🎓 **Tutorial de ${TUTORIAL_CONTEXT.appName}:**\n\n**Interfaz principal:**\n• 📋 **Sidebar izquierdo**: Todas las herramientas (Clase, Relaciones, Generar Código)\n• 🎨 **Canvas blanco**: Área de trabajo donde creates tu diagrama\n• 🔧 **Barra superior**: Controles de zoom, exportar, importar\n\n**Flujo básico:**\n1. **Crear clases** → Sidebar → "Clase" → Clic en canvas\n2. **Editar clases** → Doble clic → Agregar atributos/métodos\n3. **Conectar clases** → Sidebar → Tipo relación → Origen → Destino\n4. **Generar código** → Sidebar → "Generar Código Spring Boot"`,
        contextualHelp: [
          {
            action: 'create_first_class',
            description: 'Empezar con tu primera clase',
            shortcut: 'Sidebar → "Clase" → Clic en canvas',
            priority: 'high',
          },
          {
            action: 'tutorial_mode',
            description: 'Ver tutorial interactivo',
            shortcut: 'Pregúntame: "¿Cómo creo una clase?"',
            priority: 'medium',
          },
        ],
        tips: [
          '🎯 Empieza creando 2-3 clases básicas',
          '📝 Agrega atributos a cada clase',
          '🔗 Conecta las clases con relaciones',
          '🚀 Genera tu código Spring Boot',
        ],
      };
    }

    // 🔍 PREGUNTAS SOBRE CLASES EXISTENTES
    if (
      (normalized.includes('que') ||
        normalized.includes('cuales') ||
        normalized.includes('cuántas')) &&
      (normalized.includes('clase') || normalized.includes('tabla'))
    ) {
      if (context.nodes.length === 0) {
        return {
          message:
            '❌ **No hay clases en el diagrama actualmente.**\n\n¿Quieres que te ayude a crear una?',
          contextualHelp: [
            {
              action: 'create_first_class',
              description: 'Crear tu primera clase',
              shortcut: 'Dime: "Crea una clase Usuario"',
              priority: 'high',
            },
          ],
          tips: [
            '💡 Empieza con clases básicas como Usuario, Producto, Pedido',
          ],
        };
      }

      const classList = context.nodes
        .map((n, i) => {
          const attrs = n.attributes || [];
          const methods = n.methods || [];
          return `**${i + 1}. ${n.name}**\n   • Atributos: ${attrs.length > 0 ? attrs.join(', ') : '(ninguno)'}\n   • Métodos: ${methods.length > 0 ? methods.join(', ') : '(ninguno)'}`;
        })
        .join('\n\n');

      return {
        message: `📊 **Tienes ${context.nodes.length} clase(s) en el diagrama:**\n\n${classList}\n\n**Relaciones:** ${context.edges.length}\n\n¿Quieres agregar más atributos o crear nuevas clases?`,
        contextualHelp: [
          {
            action: 'edit_class',
            description: 'Editar una clase existente',
            shortcut: 'Doble clic en la clase',
            priority: 'high',
          },
          {
            action: 'add_attributes',
            description: 'Agregar atributos con IA',
            shortcut: 'Dime: "agrega email a la clase Usuario"',
            priority: 'high',
          },
        ],
        tips: [
          '✏️ Puedes editar cualquier clase con doble clic',
          '🤖 O pedirme que agregue atributos: "agrega id:Long a Usuario"',
        ],
      };
    }

    // 🔍 INFORMACIÓN SOBRE CLASE ESPECÍFICA
    const classNameMatch = message.match(
      /(?:clase|tabla)\s+([a-z0-9_][\w-]*)/i,
    );
    if (
      classNameMatch &&
      (normalized.includes('que tiene') ||
        normalized.includes('info') ||
        normalized.includes('muestra'))
    ) {
      const targetName = classNameMatch[1].trim();
      const targetNode = context.nodes.find(
        (n) => this.normalize(n.name) === this.normalize(targetName),
      );

      if (!targetNode) {
        return {
          message: `❌ No encontré la clase "${targetName}".\n\n**Clases disponibles:**\n${context.nodes.map((n) => `• ${n.name}`).join('\n') || '(ninguna)'}`,
          tips: ['Verifica el nombre exacto de la clase'],
        };
      }

      const attrs = targetNode.attributes || [];
      const methods = targetNode.methods || [];

      return {
        message: `📋 **Información de la clase "${targetNode.name}":**\n\n**Atributos (${attrs.length}):**\n${attrs.length > 0 ? attrs.map((a) => `  • ${a}`).join('\n') : '  (ninguno)'}\n\n**Métodos (${methods.length}):**\n${methods.length > 0 ? methods.map((m) => `  • ${m}`).join('\n') : '  (ninguno)'}\n\n¿Quieres agregar más atributos o métodos?`,
        contextualHelp: [
          {
            action: 'edit_class',
            description: `Editar ${targetNode.name}`,
            shortcut: 'Doble clic en la clase',
            priority: 'high',
          },
          {
            action: 'add_attributes',
            description: 'Agregar con IA',
            shortcut: `"agrega email:String a ${targetNode.name}"`,
            priority: 'high',
          },
        ],
      };
    }

    // ----- comandos de creación de clase -----
    if (normalized.includes('crear') || normalized.includes('crea')) {
      const parsed = this.parseCreateClassCommand(message);

      // ✅ NUEVO código contextualizado
      if (parsed) {
        return {
          message: `🎯 **¡Perfecto! Vamos a crear la clase ${parsed.className}:**\n\n**Opción 1 - Usar el botón de abajo:**\n✅ Haz clic en "Agregar" y la clase aparecerá automáticamente\n\n**Opción 2 - Hacerlo manualmente:**\n1. 📍 Ve al **sidebar izquierdo**\n2. 🖱️ Clic en **"Clase"**\n3. ✨ Clic en el **canvas** donde la quieras\n4. ✏️ **Doble clic** en la clase para editarla\n\n**Después de crear:**\n• Agrega atributos como: id: Long, nombre: String\n• Agrega métodos como: getNombre(), setNombre()`,
          suggestions: {
            classes: [
              {
                name: parsed.className,
                attributes: parsed.attributes.length
                  ? parsed.attributes
                  : ['id: Long', 'nombre: String', 'fechaCreacion: Date'],
                methods: parsed.methods.length
                  ? parsed.methods
                  : [
                      `get${parsed.className}()`,
                      `set${parsed.className}()`,
                      'save()',
                      'delete()',
                    ],
              },
            ],
          },
          contextualHelp: [
            {
              action: 'create_first_class',
              description: 'Crear clase manualmente',
              shortcut: 'Sidebar → "Clase" → Clic en canvas',
              priority: 'medium',
            },
          ],
          tips: [
            '🚀 El botón "Agregar" es la forma más rápida',
            '✏️ Siempre puedes editar la clase después',
            '📝 Formato de atributos: nombre: Tipo',
          ],
          nextSteps: [
            '1. Haz clic en "Agregar" abajo',
            '2. Doble clic en la clase para editarla',
            '3. Personaliza atributos y métodos',
            '4. Crea otra clase para relacionarlas',
          ],
        };
      }
    }

    // ----- comandos de edición de clase existente -----
    if (
      normalized.includes('agrega') ||
      normalized.includes('añade') ||
      normalized.includes('anade')
    ) {
      const editParsed = this.parseEditClassCommand(message, context);

      if (editParsed?.error) {
        return {
          message: `❌ ${editParsed.error}`,
          tips: [
            'Verifica que la clase exista en el diagrama',
            'Usa el nombre exacto de la clase',
          ],
        };
      }

      if (editParsed) {
        const {
          targetNodeId,
          targetClassName,
          newAttributes,
          newMethods,
          currentAttributes,
          currentMethods,
        } = editParsed;

        // Garantizar arrays
        const currAttrs = currentAttributes || [];
        const currMethods = currentMethods || [];
        const newAttrs = newAttributes || [];
        const newMeths = newMethods || [];

        // Combinar atributos/métodos existentes con nuevos (sin duplicar)
        const existingAttrNames = new Set(
          currAttrs.map((a) => a.split(':')[0].trim().toLowerCase()),
        );
        const filteredNewAttrs = newAttrs.filter(
          (a) => !existingAttrNames.has(a.split(':')[0].trim().toLowerCase()),
        );

        const existingMethodNames = new Set(
          currMethods.map((m) => m.split('(')[0].trim().toLowerCase()),
        );
        const filteredNewMethods = newMeths.filter(
          (m) => !existingMethodNames.has(m.split('(')[0].trim().toLowerCase()),
        );

        const allAttributes = [...currAttrs, ...filteredNewAttrs];
        const allMethods = [...currMethods, ...filteredNewMethods];

        if (filteredNewAttrs.length === 0 && filteredNewMethods.length === 0) {
          return {
            message: `⚠️ Los atributos/métodos que intentas agregar ya existen en la clase "${targetClassName}".\n\n**Atributos actuales:**\n${currAttrs.join('\n') || '(ninguno)'}\n\n**Métodos actuales:**\n${currMethods.join('\n') || '(ninguno)'}`,
            tips: [
              'Los elementos ya existen',
              'Intenta con nombres diferentes',
            ],
          };
        }

        const addedItems: string[] = [];
        if (filteredNewAttrs.length > 0) {
          addedItems.push(
            `✅ **${filteredNewAttrs.length} atributo(s):** ${filteredNewAttrs.join(', ')}`,
          );
        }
        if (filteredNewMethods.length > 0) {
          addedItems.push(
            `✅ **${filteredNewMethods.length} método(s):** ${filteredNewMethods.join(', ')}`,
          );
        }

        return {
          message: `✨ **¡Perfecto! Voy a actualizar la clase "${targetClassName}":**\n\n${addedItems.join('\n')}\n\n**Haz clic en "Aplicar cambios" abajo para actualizar el diagrama.**`,
          suggestions: {
            classes: [
              {
                name: targetClassName,
                attributes: allAttributes,
                methods: allMethods,
              },
            ],
          },
          // Añadir metadata custom para el frontend
          contextualHelp: [
            {
              action: 'apply_edit',
              description: 'Aplicar cambios a la clase',
              shortcut: 'Botón "Aplicar cambios" abajo',
              priority: 'high',
            },
          ],
          tips: [
            '🎯 Los cambios se aplicarán automáticamente al hacer clic',
            '📝 Se agregaron solo los elementos nuevos',
            '✏️ Siempre puedes editar manualmente con doble clic',
            `🔧 nodeId=${targetNodeId}`, // Metadata para el frontend
          ],
          nextSteps: [
            '1. Haz clic en "Aplicar cambios"',
            '2. Verifica la clase actualizada en el diagrama',
            '3. Agrega más elementos si lo necesitas',
          ],
        };
      }
    }

    // ----- comandos de agregar relación -----
    if (
      (normalized.includes('crea') ||
        normalized.includes('agrega') ||
        normalized.includes('añade')) &&
      (normalized.includes('relacion') ||
        normalized.includes('asociacion') ||
        normalized.includes('herencia') ||
        normalized.includes('composicion') ||
        normalized.includes('agregacion') ||
        normalized.includes('dependencia'))
    ) {
      const relationParsed = this.parseAddRelationCommand(message, context);

      if (relationParsed?.error) {
        return {
          message: `❌ ${relationParsed.error}`,
          tips: [
            'Usa el formato: "crea una [tipo] de [ClaseOrigen] a [ClaseDestino]"',
            'Tipos: asociación, herencia, composición, agregación, dependencia',
          ],
        };
      }

      if (
        relationParsed &&
        relationParsed.from &&
        relationParsed.to &&
        relationParsed.type
      ) {
        const { from, to, type } = relationParsed;

        // Mapear el tipo a nombre legible
        const relationNames: Record<string, string> = {
          assoc: 'Asociación',
          inherit: 'Herencia',
          comp: 'Composición',
          aggr: 'Agregación',
          dep: 'Dependencia',
          'many-to-many': 'Muchos a Muchos',
        };

        const relationName = relationNames[type] || 'Asociación';

        return {
          message: `✨ **¡Perfecto! Voy a crear una relación de ${relationName}:**\n\n📍 **Origen:** ${from}\n📍 **Destino:** ${to}\n🔗 **Tipo:** ${relationName}\n\n**La relación se aplicará automáticamente.**`,
          suggestions: {
            relations: [
              {
                from,
                to,
                type,
                multiplicity: relationParsed.multiplicity
                  ? {
                      source: relationParsed.multiplicity.source,
                      target: relationParsed.multiplicity.target,
                    }
                  : undefined,
              },
            ],
          },
          contextualHelp: [
            {
              action: 'view_relation',
              description: 'Ver la relación en el diagrama',
              shortcut: 'La relación aparecerá automáticamente',
              priority: 'high',
            },
          ],
          tips: [
            '✅ La relación se creó automáticamente',
            '📝 Puedes editarla haciendo clic derecho en la línea',
            '🔄 Tipos disponibles: asociación, herencia, composición, agregación, dependencia',
          ],
          nextSteps: [
            '1. Verifica la relación en el diagrama',
            '2. Agrega más relaciones si lo necesitas',
            '3. Ajusta las cardinalidades si es necesario',
          ],
        };
      }
    }

    // ----- preguntas guías -----
    if (normalized.includes('relacion') || normalized.includes('conectar')) {
      if (analysis.classCount < 2) {
        return {
          message:
            'Necesitas al menos 2 clases para crear relaciones. Crea otra clase primero.',
          tips: ['Crea una clase adicional y vuelve a conectar.'],
        };
      }
      const from = context.nodes[0]?.name ?? 'Clase1';
      const to = context.nodes[1]?.name ?? 'Clase2';
      return {
        message:
          'Para conectar dos clases: selecciona la herramienta de relación y haz clic en clase origen → clase destino.',
        suggestions: {
          relations: [{ from, to, type: 'assoc' }], // usar key del editor
        },
        tips: [
          'Asociación: relación general',
          'Herencia: “es un tipo de”',
          'Composición: “contiene a”',
        ],
      };
    }

    if (normalized.includes('analiza') && normalized.includes('diagrama')) {
      if (analysis.classCount === 0) {
        return {
          message:
            'Tu diagrama está vacío. Te sugiero crear 2–3 clases base y luego conectarlas.',
          nextSteps: [
            'Crea 2–3 clases (Usuario, Producto, Pedido)',
            'Agrega 2 atributos por clase',
            'Conéctalas con asociación',
          ],
        };
      }
      const names = analysis.classNames.join(', ');
      return {
        message: `Tienes ${analysis.classCount} clases (${names}) y ${analysis.relationCount} relación(es).`,
        tips: analysis.isWellStructured
          ? ['¡Se ve bien! Ya puedes generar código.']
          : ['Considera agregar más relaciones o atributos.'],
      };
    }

    // ----- fallback IA externa (opcional) -----
    try {
      const ai = await this.aiService.analyzeUmlRequest(message);
      return {
        message: ai.content,
        suggestions: ai.suggestions,
        tips: ai.tips,
        nextSteps: ai.nextSteps,
      };
    } catch {
      return {
        message:
          'No pude procesar tu pregunta ahora. Intenta ser más específico (por ejemplo: “Crea una clase Usuario con atributos nombre, email”).',
      };
    }
  }

  // ✅ CORREGIR el método getTutorialAnalysis (línea ~625 aproximadamente)
  private getTutorialAnalysis(analysis: any) {
    if (analysis.classCount === 0) {
      return {
        message:
          '🏗️ **Tu canvas está vacío. ¡Empecemos!**\n\n**Siguiente paso:** Crear tu primera clase',
        contextualHelp: [
          {
            action: 'create_first_class',
            description: 'Crear primera clase',
            shortcut: 'Sidebar → "Clase" → Clic en canvas',
            priority: 'high' as const, // ✅ AGREGAR "as const"
          },
        ],
        tips: [
          '🎯 Ve al sidebar izquierdo y busca el botón "Clase"',
          '🖱️ Después haz clic donde quieras crear la clase',
        ],
        nextSteps: [
          '1. Clic en "Clase" en el sidebar',
          '2. Clic en el canvas',
          '3. Doble clic en la clase para editarla',
        ],
      };
    }

    if (analysis.classCount >= 1 && analysis.hasEmptyClasses) {
      return {
        message: `📝 **Tienes ${analysis.classCount} clase(s) pero están vacías.**\n\n**Siguiente paso:** Agregar atributos y métodos`,
        contextualHelp: [
          {
            action: 'edit_class',
            description: 'Editar clase para agregar contenido',
            shortcut: 'Doble clic en cualquier clase',
            priority: 'high' as const, // ✅ AGREGAR "as const"
          },
        ],
        tips: [
          '📝 Doble clic en una clase para abrír el editor',
          '✍️ Agrega atributos como: id: Long, nombre: String',
          '⚙️ Agrega métodos como: getNombre(), setNombre()',
        ],
        nextSteps: [
          '1. Doble clic en una clase',
          '2. Agrega 2-3 atributos',
          '3. Agrega algunos métodos',
          '4. Clic "Guardar"',
        ],
      };
    }

    if (analysis.classCount >= 2 && !analysis.hasRelations) {
      return {
        message: `🔗 **Tienes ${analysis.classCount} clases pero no están conectadas.**\n\n**Siguiente paso:** Crear relaciones entre clases`,
        contextualHelp: [
          {
            action: 'create_association',
            description: 'Conectar clases con asociación',
            shortcut: 'Sidebar → "Asociación" → Clase origen → Clase destino',
            priority: 'high' as const,
          },
        ],
        tips: [
          '🔗 Ve al sidebar → sección "Relaciones"',
          '🎯 Empieza con "Asociación" (la más común)',
          '🖱️ Clic en clase origen, después en clase destino',
        ],
        nextSteps: [
          '1. Sidebar → "Asociación"',
          '2. Clic en primera clase',
          '3. Clic en segunda clase',
          '4. ¡Relación creada!',
        ],
      };
    }

    if (analysis.isWellStructured) {
      return {
        message: `🎉 **¡Excelente! Tu diagrama está completo.**\n\n**Siguiente paso:** Generar tu código Spring Boot`,
        contextualHelp: [
          {
            action: 'generate_code',
            description: 'Generar código Spring Boot',
            shortcut: 'Sidebar → "Generar Código Spring Boot"',
            priority: 'high' as const,
          },
        ],
        tips: [
          '🚀 Tu diagrama está listo para generar código',
          '📦 Se descargará un proyecto Maven completo',
          '▶️ Podrás ejecutarlo con: mvn spring-boot:run',
        ],
        nextSteps: [
          '1. Sidebar → "Generar Código Spring Boot"',
          '2. Descargar el ZIP',
          '3. Extraer y abrir en tu IDE',
          '4. Ejecutar el proyecto',
        ],
      };
    }

    return {
      message: `📊 **Estado actual:** ${analysis.classCount} clases, ${analysis.relationCount} relaciones`,
      contextualHelp: [
        {
          action: 'improve_diagram',
          description: 'Mejorar el diagrama',
          shortcut: 'Pregúntame qué hacer siguiente',
          priority: 'medium' as const, // ✅ AGREGAR "as const"
        },
      ],
      tips: [
        '🎯 Continúa agregando más detalles a tus clases',
        '🔗 Asegúrate de que las relaciones sean correctas',
      ],
      nextSteps: [
        'Completa atributos y métodos',
        'Revisa las relaciones',
        'Prepárate para generar código',
      ],
    };
  }
}
