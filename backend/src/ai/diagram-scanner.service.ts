import { Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';
import { createWorker } from 'tesseract.js';
import sharp from 'sharp';

export interface ScannedClass {
  name: string;
  attributes: string[];
  methods: string[];
  position?: { x: number; y: number };
}

export interface ScannedRelation {
  from: string;
  to: string;
  type: 'assoc' | 'inherit' | 'comp' | 'aggr' | 'dep' | 'many-to-many';
  label?: string;
  multiplicity?: {
    source?: string;
    target?: string;
  };
}

export interface DiagramScanResult {
  classes: ScannedClass[];
  relations: ScannedRelation[];
  description: string;
  confidence: 'high' | 'medium' | 'low';
}

@Injectable()
export class DiagramScannerService {
  private groq: Groq;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY no está configurada');
    }
    this.groq = new Groq({ apiKey });
  }

  /**
   * Escanea una imagen de diagrama UML usando OCR + IA de texto
   * con múltiples pasadas para máxima precisión
   */
  async scanDiagramImage(imageBuffer: Buffer): Promise<DiagramScanResult> {
    try {
      console.log(
        '[DiagramScanner] 🔍 Iniciando análisis avanzado de imagen...',
      );

      // PASO 1: Análisis de metadata
      const metadata = await sharp(imageBuffer).metadata();
      console.log('[DiagramScanner] 📊 Imagen original:', {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        hasAlpha: metadata.hasAlpha,
      });

      // PASO 2: Crear múltiples versiones procesadas para OCR robusto
      console.log('[DiagramScanner] 🔧 Generando versiones optimizadas...');
      const processedVersions = await this.createProcessedVersions(imageBuffer);

      // PASO 3: OCR en paralelo con múltiples configuraciones
      console.log('[DiagramScanner] 📝 Ejecutando OCR multinivel...');
      const ocrResults = await this.performMultiPassOCR(processedVersions);

      // PASO 4: Fusionar y limpiar resultados de OCR
      const mergedText = this.mergeOCRResults(ocrResults);
      console.log(
        '[DiagramScanner] ✅ Texto extraído combinado (primeros 1000 chars):\n',
        mergedText.substring(0, 1000),
      );

      if (!mergedText || mergedText.trim().length < 15) {
        throw new Error(
          'No se pudo extraer texto suficiente de la imagen. Verifica que el diagrama sea claro y legible.',
        );
      }

      // PASO 5: Análisis con IA usando prompts ultra-específicos
      console.log('[DiagramScanner] 🤖 Analizando con IA (Groq)...');
      const aiResult = await this.analyzeWithGroq(mergedText);

      // PASO 6: Post-procesamiento y validación exhaustiva
      console.log('[DiagramScanner] 🔍 Validando y refinando resultados...');
      const result = this.postProcessResults(aiResult, mergedText);

      console.log('[DiagramScanner] ✨ Análisis completado exitosamente:', {
        clases: result.classes.length,
        relaciones: result.relations.length,
        confianza: result.confidence,
      });

      return result;
    } catch (error) {
      console.error('[DiagramScanner] ❌ Error:', error);
      throw new Error(
        `Error al analizar el diagrama: ${error.message || 'Error desconocido'}`,
      );
    }
  }

  /**
   * Crea múltiples versiones procesadas de la imagen para OCR robusto
   */
  private async createProcessedVersions(
    imageBuffer: Buffer,
  ): Promise<Buffer[]> {
    const versions: Buffer[] = [];

    // VERSIÓN 1: Alta resolución con binarización adaptativa
    const version1 = await sharp(imageBuffer)
      .resize(4000, null, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalize()
      .threshold(127, { greyscale: false })
      .sharpen({ sigma: 2, m1: 1, m2: 0.5 })
      .png({ compressionLevel: 0 })
      .toBuffer();
    versions.push(version1);

    // VERSIÓN 2: Contraste extremo para texto débil
    const version2 = await sharp(imageBuffer)
      .resize(3500, null, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .normalize()
      .linear(2.0, -(128 * 1.0)) // Contraste muy alto
      .threshold(140, { greyscale: false })
      .median(2)
      .png({ compressionLevel: 0 })
      .toBuffer();
    versions.push(version2);

    // VERSIÓN 3: Suavizado para reducir ruido
    const version3 = await sharp(imageBuffer)
      .resize(3000, null, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
      .greyscale()
      .blur(0.5) // Ligero blur antes de threshold
      .normalize()
      .threshold(120, { greyscale: false })
      .sharpen({ sigma: 1.5, m1: 1, m2: 0.7 })
      .png({ compressionLevel: 0 })
      .toBuffer();
    versions.push(version3);

    console.log('[DiagramScanner] ✅ Generadas 3 versiones optimizadas');
    return versions;
  }

  /**
   * Ejecuta OCR con múltiples configuraciones y combina resultados
   */
  private async performMultiPassOCR(imageBuffers: Buffer[]): Promise<string[]> {
    const results: string[] = [];

    // Configuraciones de Tesseract para diferentes escenarios
    const configs = [
      {
        psm: 3, // Automatic page segmentation
        desc: 'Segmentación automática',
      },
      {
        psm: 6, // Uniform block of text
        desc: 'Bloques uniformes',
      },
      {
        psm: 11, // Sparse text
        desc: 'Texto disperso',
      },
    ];

    for (let i = 0; i < imageBuffers.length; i++) {
      const buffer = imageBuffers[i];
      const config = configs[i % configs.length];

      try {
        console.log(`[OCR] Pasada ${i + 1}: ${config.desc}...`);

        const worker = await createWorker('eng', 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              const progress = Math.round(m.progress * 100);
              if (progress % 25 === 0 || progress === 100) {
                console.log(`[OCR] Pasada ${i + 1} - Progreso: ${progress}%`);
              }
            }
          },
        });

        await worker.setParameters({
          tessedit_pageseg_mode: config.psm as any,
          tessedit_char_whitelist:
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
            'áéíóúÁÉÍÓÚñÑ' +
            '0123456789' +
            '(){}[]<>:;,.-+*_=!@#$%^&|\\/"\'`~? \n\t',
          preserve_interword_spaces: '1' as any,
          tessedit_do_invert: '0' as any,
        });

        const {
          data: { text },
        } = await worker.recognize(buffer);
        await worker.terminate();

        const cleaned = this.advancedCleanOCRText(text);
        if (cleaned && cleaned.length > 20) {
          results.push(cleaned);
          console.log(
            `[OCR] ✅ Pasada ${i + 1} completada: ${cleaned.length} caracteres`,
          );
        }
      } catch (error) {
        console.warn(`[OCR] ⚠️ Pasada ${i + 1} falló:`, error.message);
      }
    }

    if (results.length === 0) {
      throw new Error('Todas las pasadas de OCR fallaron');
    }

    console.log(`[OCR] ✅ Completadas ${results.length} pasadas exitosas`);
    return results;
  }

  /**
   * Fusiona resultados de múltiples pasadas de OCR
   * Prioriza la pasada con mejor calidad y complementa con otras
   */
  private mergeOCRResults(results: string[]): string {
    if (results.length === 0) return '';
    if (results.length === 1) return results[0];

    // Seleccionar el texto más largo y completo como base
    const sortedByLength = [...results].sort((a, b) => b.length - a.length);
    let mergedText = sortedByLength[0];

    // Detectar líneas únicas en otras pasadas y agregarlas
    const baseLines = new Set(
      mergedText.split('\n').map((l) => l.trim().toLowerCase()),
    );

    for (let i = 1; i < results.length; i++) {
      const lines = results[i].split('\n');
      for (const line of lines) {
        const normalized = line.trim().toLowerCase();
        // Si es una línea significativa que no está en la base, agregarla
        if (normalized.length > 3 && !baseLines.has(normalized)) {
          // Verificar si contiene información valiosa (atributos, métodos, clases)
          if (this.looksLikeUMLContent(line)) {
            mergedText += '\n' + line.trim();
            baseLines.add(normalized);
          }
        }
      }
    }

    return this.advancedCleanOCRText(mergedText);
  }

  /**
   * Determina si una línea parece contener información UML valiosa
   */
  private looksLikeUMLContent(line: string): boolean {
    const trimmed = line.trim();
    return (
      /^[+\-#~]/.test(trimmed) || // Modificadores de visibilidad
      /\w+\s*\(.*\)/.test(trimmed) || // Métodos
      /\w+\s*:\s*\w+/.test(trimmed) || // Atributos con tipo
      /^[A-Z][a-zA-Z0-9_]*$/.test(trimmed) || // Nombres de clase
      /\d+\.\.\*|\*\.\.1|1\.\.1|0\.\.1/.test(trimmed) || // Cardinalidades
      // Detecta variantes con más puntos o letras (ej. '1...m', '1...N')
      /1\.{2,}\s*[mMnN\*]?|0\.{2,}\s*[mMnN\*]?/.test(trimmed)
    );
  }

  /**
   * Limpieza avanzada de texto OCR con correcciones contextuales
   */
  private advancedCleanOCRText(text: string): string {
    return (
      text
        // Normalizar saltos de línea
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')

        // Corregir modificadores de visibilidad mal reconocidos
        .replace(/[|Il1!¡]+\s*([+\-#~])/g, '$1')
        .replace(/^[|Il1!¡]+([+\-#~])/gm, '$1')

        // Corregir confusiones comunes OCR
        .replace(/\b0\s*\.\s*\.\s*\*/g, '0..*') // "0 . . *" → "0..*"
        .replace(/\b1\s*\.\s*\.\s*\*/g, '1..*')
        .replace(/\b1\s*\.\s*\.\s*1/g, '1..1')
        .replace(/\*\s*\.\s*\.\s*1/g, '*..1')
        // Normalizar variantes comunes: '1...m', '1...N', '1..n' => '1..*'
        .replace(/\b1\.{2,}\s*[mMnN]\b/g, '1..*')
        .replace(/\b0\.{2,}\s*[mMnN]\b/g, '0..*')
        // variantes con espacios entre puntos o caracteres raros
        .replace(/\b1\s*\.\s*\.\s*\.?\s*[mMnN]\b/g, '1..*')
        .replace(/\b0\s*\.\s*\.\s*\.?\s*[mMnN]\b/g, '0..*')
        // convertir tres o más puntos a dos (para normalizar '...' → '..')
        .replace(/\.{3,}/g, '..')

        // Corregir paréntesis
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')
        .replace(/\[\s+/g, '[')
        .replace(/\s+\]/g, ']')

        // Corregir dos puntos (tipos)
        .replace(/\s*:\s*/g, ': ')
        .replace(/:\s+([,\)])/g, ':$1')

        // Corregir espacios en modificadores
        .replace(/([+\-#~])\s+([a-zA-Z])/g, '$1$2')

        // Limpiar caracteres raros al inicio de líneas
        .replace(/^[^\w+\-#~\n]+/gm, '')

        // Normalizar espacios múltiples
        .replace(/ {2,}/g, ' ')

        // Limpiar líneas
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join('\n')

        // Remover líneas vacías múltiples
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
  }

  /**
   * Analiza el texto con Groq usando prompts ultra-específicos
   */
  private async analyzeWithGroq(extractedText: string): Promise<any> {
    const systemPrompt = `Eres un experto analista de diagramas UML de clases. Tu misión es interpretar texto extraído por OCR y reconstruir el diagrama con MÁXIMA PRECISIÓN.

**ESTRUCTURA DE UN DIAGRAMA UML:**
Las clases tienen 3 secciones:
1. NOMBRE (primera línea): "Alumno", "Materia", "Docente"
2. ATRIBUTOS (con ":" pero SIN paréntesis): "+id: int", "+nombre: String"
3. MÉTODOS (con paréntesis): "+inscribir()", "+getNombre(): String"

**REGLAS PARA IDENTIFICAR CLASES:**
✓ Nombres con mayúscula inicial: "Alumno", "Producto", "Usuario"
✓ Aparecen al inicio de cada bloque de texto
✓ NO tienen símbolos +, -, #, ~ delante
✓ NO tienen paréntesis ni dos puntos

**REGLAS PARA IDENTIFICAR ATRIBUTOS:**
✓ Formato: "+nombreAtributo: tipo" o "+nombre"
✓ Tienen modificador: +, -, #, ~
✓ Tienen dos puntos ":" seguido del tipo
✓ NO tienen paréntesis "()"
✓ Ejemplos: "+id: int", "+nombre: String", "-edad: int"

**REGLAS PARA IDENTIFICAR MÉTODOS:**
✓ SIEMPRE tienen paréntesis "()"
✓ Formato: "+metodo(): tipo" o "+metodo()"
✓ Tienen modificador: +, -, #, ~
✓ Ejemplos: "+inscribir()", "+calcular(): int", "+toString(): String"

**TIPOS DE RELACIONES:**
1. **assoc** (Asociación): "tiene", "posee", "usa", líneas simples
2. **inherit** (Herencia): "es un", "hereda", flecha vacía
3. **comp** (Composición): "compone", "contiene", rombo lleno
4. **aggr** (Agregación): "agrega", rombo vacío
5. **dep** (Dependencia): "depende", línea punteada
6. **many-to-many**: relaciones N:M

**CARDINALIDADES:**
- "1" = exactamente uno
- "*" = muchos (cero o más)
- "0..1" = cero o uno
- "1..*" = uno o más
- "0..*" = cero o más

**IMPORTANTE:**
- Lee TODO el texto primero
- Agrupa atributos/métodos por clase
- Extrae TODAS las relaciones entre clases
- Captura TODAS las cardinalidades
- NO inventes información

Responde SOLO en JSON válido sin comentarios ni markdown.`;

    const userPrompt = `Analiza este texto de un diagrama UML. Identifica cada clase con sus atributos, métodos, y TODAS las relaciones con cardinalidades.

═══════════════════════════════════════════════════════════
TEXTO EXTRAÍDO DEL DIAGRAMA:
═══════════════════════════════════════════════════════════

${extractedText}

═══════════════════════════════════════════════════════════

**EJEMPLO DE SALIDA ESPERADA:**

Si el diagrama muestra:
- Clase "Alumno" con atributos "+id", "+nombre", "+ci"
- Clase "Materia" con "+id", "+sigla", "+nombre"
- Relación "Alumno" --inscribe--> "Materia" con "1..*" a "*"

Debes responder:

{
  "classes": [
    {
      "name": "Alumno",
      "attributes": ["+id", "+nombre", "+ci"],
      "methods": []
    },
    {
      "name": "Materia",
      "attributes": ["+id", "+sigla", "+nombre"],
      "methods": []
    }
  ],
  "relations": [
    {
      "from": "Alumno",
      "to": "Materia",
      "type": "assoc",
      "label": "inscribe",
      "multiplicity": {
        "source": "1..*",
        "target": "*"
      }
    }
  ],
  "description": "Diagrama de inscripción de alumnos a materias",
  "confidence": "high"
}

**TU RESPUESTA (JSON PURO):**`;

    const completion = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.05, // Muy bajo para máxima consistencia
      max_tokens: 6000,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('No se recibió respuesta de Groq');
    }

    console.log(
      '[Groq] Respuesta recibida (primeros 500 chars):',
      responseText.substring(0, 500),
    );

    return JSON.parse(responseText);
  }

  /**
   * Post-procesa y valida exhaustivamente los resultados
   */
  private postProcessResults(
    aiResult: any,
    originalText: string,
  ): DiagramScanResult {
    // Validar clases
    let classes = this.validateClasses(aiResult.classes || []);

    // Si no se detectaron clases, intentar extracción de emergencia
    if (classes.length === 0) {
      console.warn(
        '[PostProcess] ⚠️ No se detectaron clases, intentando extracción de emergencia...',
      );
      classes = this.emergencyClassExtraction(originalText);
    }

    if (classes.length === 0) {
      throw new Error(
        'No se pudieron detectar clases en el diagrama. Verifica que la imagen sea clara y contenga un diagrama UML válido.',
      );
    }

    // Validar relaciones
    const relations = this.validateRelations(aiResult.relations || [], classes);

    // Inferir relaciones faltantes del texto si es necesario
    const inferredRelations = this.inferRelationsFromText(
      originalText,
      classes,
    );
    const allRelations = this.mergeRelations(relations, inferredRelations);

    // Calcular confianza basado en múltiples factores
    const confidence = this.calculateConfidence(
      classes,
      allRelations,
      originalText,
    );

    return {
      classes,
      relations: allRelations,
      description: aiResult.description || 'Diagrama UML de clases',
      confidence,
    };
  }

  /**
   * Extracción de emergencia cuando la IA falla
   */
  private emergencyClassExtraction(text: string): ScannedClass[] {
    const classes: ScannedClass[] = [];
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);

    let currentClass: ScannedClass | null = null;

    for (const line of lines) {
      // Detectar nombre de clase (línea que empieza con mayúscula, sin modificadores)
      if (
        /^[A-Z][a-zA-Z0-9_]*$/.test(line) &&
        !line.includes(':') &&
        !line.includes('(')
      ) {
        if (currentClass) {
          classes.push(currentClass);
        }
        currentClass = {
          name: line,
          attributes: [],
          methods: [],
        };
      }
      // Detectar atributo
      else if (
        currentClass &&
        /^[+\-#~].*:/.test(line) &&
        !line.includes('(')
      ) {
        currentClass.attributes.push(line);
      }
      // Detectar método
      else if (currentClass && /^[+\-#~].*\(.*\)/.test(line)) {
        currentClass.methods.push(line);
      }
    }

    if (currentClass) {
      classes.push(currentClass);
    }

    console.log(`[Emergency] Extraídas ${classes.length} clases`);
    return classes;
  }

  /**
   * Infiere relaciones del texto cuando no son detectadas por la IA
   */
  private inferRelationsFromText(
    text: string,
    classes: ScannedClass[],
  ): ScannedRelation[] {
    const relations: ScannedRelation[] = [];
    const classNames = classes.map((c) => c.name.toLowerCase());
    const lines = text.toLowerCase().split('\n');

    // Palabras clave de relación
    const keywords: { [key: string]: ScannedRelation['type'] } = {
      inscribe: 'assoc',
      'se inscribe': 'assoc',
      imparte: 'assoc',
      tiene: 'assoc',
      posee: 'assoc',
      contiene: 'comp',
      agrega: 'aggr',
      hereda: 'inherit',
      'es un': 'inherit',
      depende: 'dep',
    };

    for (const line of lines) {
      for (const [keyword, type] of Object.entries(keywords)) {
        if (line.includes(keyword)) {
          // Buscar clases mencionadas en la línea
          const mentionedClasses = classNames.filter((cn) => line.includes(cn));
          if (mentionedClasses.length >= 2) {
            relations.push({
              from: classes.find(
                (c) => c.name.toLowerCase() === mentionedClasses[0],
              )!.name,
              to: classes.find(
                (c) => c.name.toLowerCase() === mentionedClasses[1],
              )!.name,
              type,
              label: keyword,
            });
          }
        }
      }
    }

    return relations;
  }

  /**
   * Fusiona relaciones eliminando duplicados
   */
  private mergeRelations(
    primary: ScannedRelation[],
    secondary: ScannedRelation[],
  ): ScannedRelation[] {
    const merged = [...primary];
    const existing = new Set(primary.map((r) => `${r.from}-${r.to}-${r.type}`));

    for (const rel of secondary) {
      const key = `${rel.from}-${rel.to}-${rel.type}`;
      if (!existing.has(key)) {
        merged.push(rel);
        existing.add(key);
      }
    }

    return merged;
  }

  /**
   * Calcula la confianza del análisis
   */
  private calculateConfidence(
    classes: ScannedClass[],
    relations: ScannedRelation[],
    text: string,
  ): 'high' | 'medium' | 'low' {
    let score = 0;

    // Factor 1: Cantidad de clases (20 puntos)
    if (classes.length >= 3) score += 20;
    else if (classes.length >= 2) score += 15;
    else score += 10;

    // Factor 2: Atributos/métodos detectados (30 puntos)
    const totalMembers = classes.reduce(
      (sum, c) => sum + c.attributes.length + c.methods.length,
      0,
    );
    if (totalMembers >= 10) score += 30;
    else if (totalMembers >= 5) score += 20;
    else score += 10;

    // Factor 3: Relaciones detectadas (25 puntos)
    if (relations.length >= 2) score += 25;
    else if (relations.length >= 1) score += 15;
    else score += 5;

    // Factor 4: Cardinalidades presentes (15 puntos)
    const withMultiplicity = relations.filter((r) => r.multiplicity).length;
    if (withMultiplicity >= relations.length * 0.8) score += 15;
    else if (withMultiplicity >= relations.length * 0.5) score += 10;
    else score += 5;

    // Factor 5: Calidad del texto OCR (10 puntos)
    const textQuality = text.length / (text.match(/[^\w\s]/g)?.length || 1);
    if (textQuality > 5) score += 10;
    else if (textQuality > 3) score += 7;
    else score += 3;

    // Clasificar
    if (score >= 75) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  /**
   * Valida y normaliza clases
   */
  private validateClasses(classes: any[]): ScannedClass[] {
    return classes
      .filter((cls) => cls && typeof cls.name === 'string' && cls.name.trim())
      .map((cls) => ({
        name: this.cleanClassName(cls.name),
        attributes: this.cleanStringArray(cls.attributes || []),
        methods: this.cleanStringArray(cls.methods || []),
        position: cls.position,
      }))
      .filter((cls) => cls.name.length > 0);
  }

  /**
   * Valida relaciones asegurando que las clases existen
   */
  private validateRelations(
    relations: any[],
    classes: ScannedClass[],
  ): ScannedRelation[] {
    const validTypes = new Set([
      'assoc',
      'inherit',
      'comp',
      'aggr',
      'dep',
      'many-to-many',
    ]);

    const classNames = new Set(classes.map((c) => c.name));

    return relations
      .filter(
        (rel) =>
          rel &&
          typeof rel.from === 'string' &&
          typeof rel.to === 'string' &&
          rel.from.trim() &&
          rel.to.trim(),
      )
      .map((rel) => {
        let type = (rel.type || 'assoc').toLowerCase();

        const typeMap: { [key: string]: string } = {
          association: 'assoc',
          generalization: 'inherit',
          inheritance: 'inherit',
          composition: 'comp',
          aggregation: 'aggr',
          dependency: 'dep',
          'many-to-many': 'many-to-many',
        };

        type = typeMap[type] || type;
        if (!validTypes.has(type)) type = 'assoc';

        return {
          from: this.cleanClassName(rel.from),
          to: this.cleanClassName(rel.to),
          type: type as ScannedRelation['type'],
          label: rel.label ? String(rel.label).trim() : undefined,
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
        };
      })
      .filter((rel) => classNames.has(rel.from) && classNames.has(rel.to));
  }

  /**
   * Limpia nombre de clase
   */
  private cleanClassName(name: string): string {
    return String(name)
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Limpia array de strings
   */
  private cleanStringArray(arr: any[]): string[] {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item) => item && typeof item === 'string')
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }
}
