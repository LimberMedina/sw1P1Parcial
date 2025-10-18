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
    relations?: Array<{ from: string; to: string; type: string }>;
  };
  tips?: string[];
  nextSteps?: string[];
  // Para que el front las muestre como "acciones rápidas"
  contextualHelp?: AssistantSuggestion[];
}

@Injectable()
export class AiAssistantService {
  constructor(private readonly aiService: AiService) {}

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

  private async handleUserMessage(
    message: string,
    context: DiagramContext,
    analysis: ReturnType<AiAssistantService['analyzeDiagramState']>,
  ): Promise<AssistantResponse> {
    const normalized = this.normalize(message);

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
