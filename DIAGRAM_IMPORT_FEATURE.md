# 📸 Importación de Diagramas UML desde Imágenes

## 🎯 Descripción

Sistema de escaneo inteligente de diagramas UML que utiliza IA con visión para analizar imágenes de diagramas y recrearlos automáticamente en el editor.

## ✨ Características

- **Escaneo con Visión de IA**: Usa el modelo `llama-3.2-90b-vision-preview` de Groq para análisis visual
- **Detección de Clases**: Identifica clases, atributos y métodos automáticamente
- **Detección de Relaciones**: Reconoce tipos de relaciones UML:
  - Asociación (línea simple)
  - Herencia (flecha triangular hueca)
  - Composición (rombo negro)
  - Agregación (rombo blanco)
  - Dependencia (línea punteada)
  - Muchos a Muchos
- **Detección de Multiplicidades**: Reconoce cardinalidades (1, _, 0..1, 1.._, etc.)
- **Layout Automático**: Distribuye las clases en cuadrícula evitando solapamientos
- **Aplicación de Estilos**: Aplica automáticamente los estilos UML correctos a las relaciones

## 🔧 Componentes

### Backend

#### `DiagramScannerService`

**Ubicación**: `backend/src/ai/diagram-scanner.service.ts`

**Método Principal**:

```typescript
async scanDiagramImage(imageBuffer: Buffer): Promise<DiagramScanResult>
```

**Respuesta**:

```typescript
interface DiagramScanResult {
  classes: ScannedClass[];
  relations: ScannedRelation[];
  description: string;
  confidence: "high" | "medium" | "low";
}

interface ScannedClass {
  name: string;
  attributes: string[];
  methods: string[];
  position?: { x: number; y: number };
}

interface ScannedRelation {
  from: string;
  to: string;
  type: "assoc" | "inherit" | "comp" | "aggr" | "dep" | "many-to-many";
  label?: string;
  multiplicity?: {
    source?: string;
    target?: string;
  };
}
```

**Características del Servicio**:

- Detección automática de tipo MIME de imágenes
- Validación y normalización de clases y relaciones
- Limpieza de nombres y datos extraídos
- Mapeo de variaciones de tipos de relación
- Logs detallados para debugging

#### Endpoint API

**Ruta**: `POST /api/ai/scan-diagram`

**Request**:

```typescript
Content-Type: multipart/form-data
Body: { image: File }
```

**Response**:

```json
{
  "classes": [
    {
      "name": "Usuario",
      "attributes": ["id: Long", "nombre: String", "email: String"],
      "methods": ["login()", "logout()", "cambiarPassword()"]
    }
  ],
  "relations": [
    {
      "from": "Usuario",
      "to": "Rol",
      "type": "assoc",
      "multiplicity": {
        "source": "1",
        "target": "*"
      }
    }
  ],
  "description": "Sistema de gestión de usuarios con roles",
  "confidence": "high"
}
```

**Límites**:

- Tamaño máximo: 10MB
- Formatos soportados: JPG, JPEG, PNG, GIF, BMP, WEBP

### Frontend

#### Función de Importación

**Ubicación**: `frontend/src/pages/Editor.tsx`

**Función**: `handleImportFromImage(file: File)`

**Flujo**:

1. Valida permisos de edición
2. Envía imagen al endpoint `/api/ai/scan-diagram`
3. Muestra diálogo de confirmación con resumen
4. Crea clases en layout de cuadrícula
5. Crea relaciones con estilos correctos
6. Aplica auto-resize a los nodos
7. Centra y ajusta zoom
8. Sincroniza con Y.js (colaboración en tiempo real)

#### UI

**Botón de Importación**: En `DiagramControls.tsx`

- Icono: 🖼️ FileImage
- Abre selector de archivos
- Muestra loading con spinner durante el análisis
- Feedback de progreso y errores

## 📝 Uso

### Para Usuarios

1. Click en el botón **"Importar"** en la barra de herramientas
2. Selecciona una imagen del diagrama UML
3. Espera el análisis (puede tomar 5-10 segundos)
4. Revisa el resumen de lo detectado en el diálogo
5. Confirma la importación
6. ¡El diagrama se dibuja automáticamente!

### Recomendaciones para Mejores Resultados

✅ **Buenas Prácticas**:

- Usa imágenes claras y de alta resolución
- Asegúrate de que el texto sea legible
- Los rectángulos de clases deben estar bien definidos
- Las líneas de relación deben ser visibles
- Evita fondos muy oscuros o con mucho ruido

❌ **Evitar**:

- Imágenes borrosas o de baja calidad
- Texto muy pequeño o ilegible
- Diagramas escritos a mano (mejor digitales)
- Fondos con muchos colores o patrones
- Imágenes mayores a 10MB

## 🔍 Prompt de IA

El servicio usa un prompt especializado que instruye a la IA para:

1. Identificar clases buscando rectángulos con 3 secciones
2. Extraer atributos (formato: `nombre: tipo`)
3. Extraer métodos (con paréntesis y tipos de retorno)
4. Identificar tipos de relación por símbolos visuales:
   - △ = Herencia
   - ◆ (negro) = Composición
   - ◇ (blanco) = Agregación
   - - - → = Dependencia
   - → = Asociación
5. Detectar multiplicidades cerca de las líneas

## 🧪 Testing

### Test Manual

1. Crea un diagrama UML simple en cualquier herramienta
2. Exporta como imagen PNG
3. Importa en el editor
4. Verifica que se detecten todas las clases
5. Verifica que las relaciones tengan los estilos correctos

### Casos de Prueba

**Caso 1: Diagrama Simple**

- 2-3 clases
- Atributos básicos
- 1-2 relaciones de asociación
- Resultado esperado: 100% de detección

**Caso 2: Herencia**

- Clase padre e hija
- Relación de herencia (flecha triangular)
- Resultado esperado: Flecha triangular hueca en el editor

**Caso 3: Composición/Agregación**

- Clases con relaciones de composición
- Rombos negros (comp) y blancos (aggr)
- Resultado esperado: Rombos correctamente aplicados

## 🐛 Troubleshooting

### Error: "No se pudieron detectar clases"

**Causa**: La imagen no tiene suficiente claridad o no contiene un diagrama UML reconocible

**Solución**:

- Mejora la calidad de la imagen
- Asegúrate de que sea un diagrama UML de clases
- Aumenta el contraste y resolución

### Error: "La imagen es demasiado grande"

**Causa**: Archivo mayor a 10MB

**Solución**:

- Reduce el tamaño del archivo
- Comprime la imagen manteniendo calidad
- Usa formato PNG o JPEG con compresión

### Relaciones no se crean correctamente

**Causa**: Los nombres de las clases origen/destino no coinciden exactamente

**Solución**:

- Verifica que los nombres en la imagen sean consistentes
- La IA normaliza espacios y caracteres especiales
- Revisa los logs en consola para ver los nombres detectados

## 📊 Métricas de Confianza

El sistema retorna un nivel de confianza:

- **High**: Diagrama claro, todas las clases y relaciones detectadas
- **Medium**: Algunas incertidumbres, la mayoría detectada
- **Low**: Imagen de baja calidad o diagrama complejo

## 🔐 Seguridad

- Validación de tipos MIME
- Límite de tamaño de archivo (10MB)
- Validación de permisos de edición
- Sanitización de nombres de clases
- Límite de 15 atributos/métodos por clase

## 🚀 Mejoras Futuras

- [ ] Soporte para diagramas de secuencia
- [ ] Detección de notas y comentarios
- [ ] Reconocimiento de estereotipos
- [ ] Detección de paquetes y namespaces
- [ ] Exportación con posiciones originales
- [ ] Batch processing de múltiples imágenes
- [ ] OCR fallback para imágenes muy complejas

## 📚 Referencias

- [Groq Vision API](https://console.groq.com/docs/vision)
- [UML Class Diagram Notation](https://www.uml-diagrams.org/class-diagrams-overview.html)
- [AntV X6 Graph Library](https://x6.antv.vision/)
