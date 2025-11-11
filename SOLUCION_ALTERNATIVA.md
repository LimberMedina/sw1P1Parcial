# 🚀 Solución Rápida Alternativa (Sin Logs)

Si quieres **probar inmediatamente** una versión simplificada sin esperar a debuggear, puedes usar este enfoque que **copia exactamente** cómo funciona AIAssistant.

## Opción 1: Crear clases una por una (sin batch)

Reemplaza el bloque `graph.batchUpdate(() => { ... })` por este código:

```typescript
// En lugar de batch update, crear cada clase individualmente
const createdNodes: Record<string, any> = {};

// Calcular posiciones
const classCount = result.classes.length;
const cols = Math.max(2, Math.ceil(Math.sqrt(classCount)));
const spacing = 320;
let startX = 150;
let startY = 150;

const existingNodes = graph.getNodes();
if (existingNodes.length > 0) {
  const positions = existingNodes.map((n: any) => n.getBBox());
  const maxX = Math.max(...positions.map((p: any) => p.x + p.width));
  startX = Math.max(150, maxX + 100);
}

// Crear cada clase SIN batchUpdate (como AIAssistant)
result.classes.forEach((classData: any, index: number) => {
  const row = Math.floor(index / cols);
  const col = index % cols;
  const x = startX + col * spacing;
  const y = startY + row * spacing;

  const cleanAttributes = (classData.attributes || [])
    .filter((attr: string) => attr && attr.trim().length > 0)
    .map((attr: string) => attr.trim())
    .slice(0, 15);

  const cleanMethods = (classData.methods || [])
    .filter((method: string) => method && method.trim().length > 0)
    .map((method: string) => method.trim())
    .slice(0, 15);

  const node = graph.addNode({
    shape: "uml-class",
    x,
    y,
    width: (CLASS_SIZES as any).WIDTH,
    height: (CLASS_SIZES as any).HEIGHT,
    attrs: {
      name: { text: classData.name },
      attrs: { text: cleanAttributes.join("\n") },
      methods: { text: cleanMethods.join("\n") },
    },
    zIndex: 2,
    data: {
      name: classData.name,
      attributes: cleanAttributes,
      methods: cleanMethods,
    },
  }) as any;

  createdNodes[classData.name] = node;

  // Resize inmediatamente después de crear (como AIAssistant)
  resizeUmlClass(node);

  console.log(`✓ Clase creada: ${classData.name}`);
});

// Guardar snapshot ANTES de crear relaciones
pushSnapshotToYDoc();

// Crear relaciones después (si existen)
if (result.relations && result.relations.length > 0) {
  result.relations.forEach((relation: any) => {
    const sourceNode = createdNodes[relation.from];
    const targetNode = createdNodes[relation.to];

    if (sourceNode && targetNode) {
      try {
        const edgeKind: EdgeKind = relation.type || "assoc";
        const style = EDGE_STYLE[edgeKind] || EDGE_STYLE.assoc;

        const sc = sourceNode.getBBox().center;
        const tc = targetNode.getBBox().center;
        const sourceSide = pickSide(sc, tc);
        const targetSide = opposite(sourceSide);
        const sourcePort = allocPortPreferMiddle(sourceNode.id, sourceSide);
        const targetPort = allocPortPreferMiddle(targetNode.id, targetSide);

        const edge = graph.addEdge({
          attrs: {
            line: {
              stroke: style.stroke ?? "#374151",
              strokeWidth: style.strokeWidth ?? 1.5,
              strokeDasharray: style.dashed ? 4 : undefined,
              sourceMarker: style.sourceMarker ?? null,
              targetMarker: style.targetMarker ?? null,
            },
          },
          zIndex: 1000,
          router: ROUTER_CONFIG.orth,
          connector: CONNECTOR_CONFIG.rounded,
          source: { cell: sourceNode.id, port: sourcePort },
          target: { cell: targetNode.id, port: targetPort },
          data: {
            name: relation.label || "",
            multSource: relation.multiplicity?.source || "",
            multTarget: relation.multiplicity?.target || "",
            type: edgeKind,
            routerType: "orth",
            connectorType: "rounded",
          },
        });

        applyEdgeLabels(edge);
        console.log(`✓ Relación creada: ${relation.from} → ${relation.to}`);
      } catch (edgeError) {
        console.warn("⚠️ Error creando relación:", edgeError);
      }
    }
  });

  // Guardar snapshot después de relaciones
  pushSnapshotToYDoc();
}

// Centrar vista
setTimeout(() => {
  if (!componentMountedRef.current) return;
  graph.centerContent();
  graph.zoomToFit({ padding: 50, maxScale: 1 });
}, 100);
```

## Diferencias Clave

### Enfoque Anterior (con batch)

```typescript
graph.batchUpdate(() => {
  // Crear todos los nodos
  // Resize todos los nodos
  // Crear todas las relaciones
});
pushSnapshotToYDoc(); // Al final
```

### Nuevo Enfoque (sin batch)

```typescript
// Crear cada nodo
// Resize inmediato
// Loop

pushSnapshotToYDoc(); // Después de clases

// Crear cada relación
// Loop

pushSnapshotToYDoc(); // Después de relaciones
```

## Por qué Esto Podría Funcionar

1. **✅ Copia exacta de AIAssistant:** Usa el mismo patrón que sabemos que funciona
2. **✅ Sin batchUpdate:** Evita posibles problemas de timing
3. **✅ Snapshot inmediato:** Persiste cambios después de cada grupo
4. **✅ Resize sincrónico:** No espera a que terminen todas las operaciones

## Cómo Implementar

1. Abre `frontend/src/pages/Editor.tsx`
2. Busca la línea que dice `graph.batchUpdate(() => {`
3. Reemplaza todo el bloque desde ahí hasta el `});` correspondiente
4. Pega el código de arriba
5. Guarda y prueba

## Limitaciones

- Puede ser más lento para diagramas grandes (no usa batch)
- Llamará a `pushSnapshotToYDoc()` dos veces
- Menos eficiente pero más confiable

## Si Esto Funciona

Si esta solución funciona, entonces el problema está en:

- El timing del `batchUpdate()`
- O la coordinación entre batch y snapshot
- O el orden de las operaciones

## Si Esto NO Funciona

Si aún así no funciona, entonces el problema es:

- Más profundo en la configuración del graph
- En el `requestAnimationFrame`
- En el `componentMountedRef`
- O en los permisos de edición

---

**NOTA:** Esto es una solución temporal para pruebas. Si funciona, luego optimizaremos el código para usar batch update correctamente.
