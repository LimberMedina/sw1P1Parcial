# 🔍 DEBUG: Importar Imagen de Diagrama

## Estado Actual

✅ **Backend funcionando correctamente:**

- OCR extrae texto de la imagen
- IA analiza y retorna clases/relaciones
- Formato de respuesta correcto

❌ **Frontend no dibuja en el editor:**

- El código de renderizado existe
- Pero las clases no aparecen visualmente

## Instrucciones de Testing

### 1. Abrir la Consola del Navegador

1. Abre el editor en tu navegador
2. Presiona **F12** para abrir DevTools
3. Ve a la pestaña **Console**
4. Limpia la consola (clic en el ícono 🚫)

### 2. Probar Importación de Imagen

1. En el editor, busca el botón de **"Importar desde imagen"** o similar
2. Selecciona una imagen de diagrama UML
3. **IMPORTANTE:** Acepta el diálogo de confirmación cuando aparezca

### 3. Revisar los Logs

Deberías ver una secuencia de logs como esta:

```
🎬 [IMPORT DEBUG] handleImportFromImage iniciado
🎬 [IMPORT DEBUG] file: mi-diagrama.png 234567 bytes
🎬 [IMPORT DEBUG] graphRef.current: true
🎬 [IMPORT DEBUG] canEdit: true
🔍 Enviando imagen para escaneo de diagrama...
✅ [IMPORT DEBUG] Response JSON recibido: {...}
✅ [IMPORT DEBUG] result.classes: [{...}]
✅ [IMPORT DEBUG] result.relations: [{...}]
🎯 [IMPORT DEBUG] graph obtenido correctamente: {...}
🎯 [IMPORT DEBUG] Entrando a requestAnimationFrame...
🎬 [IMPORT DEBUG] requestAnimationFrame callback ejecutado
💬 [IMPORT DEBUG] Mostrando diálogo de confirmación...
💬 [IMPORT DEBUG] Usuario respondió: ACEPTAR
🚀 [IMPORT DEBUG] Iniciando batch update...
🎯 [IMPORT DEBUG] Dentro de batchUpdate - START
🏗️ [IMPORT DEBUG] Creando 4 clases...
📦 [IMPORT DEBUG] Procesando clase 1/4: Materia
✅ [IMPORT DEBUG] Nodo creado exitosamente: {...}
... (más clases)
🔧 [IMPORT DEBUG] Aplicando resize a todos los nodos...
✅ [IMPORT DEBUG] 4 nodos creados y resized
🔗 [IMPORT DEBUG] Creando 2 relaciones...
🎉 [IMPORT DEBUG] Batch update completado!
🎉 [IMPORT DEBUG] Total nodos en el graph: 4
🎯 [IMPORT DEBUG] setTimeout ejecutado - componentMountedRef: true
📐 [IMPORT DEBUG] Centrando contenido...
✅ [IMPORT DEBUG] Vista ajustada correctamente
💾 [IMPORT DEBUG] Guardando snapshot en YDoc...
🏁 [IMPORT DEBUG] handleImportFromImage completado exitosamente!
```

### 4. Casos de Error

Si ves alguno de estos logs, **copia TODO el contenido de la consola**:

- ⚠️ `componentMountedRef es false` - El componente se desmontó
- ❌ `graph es null después de recibir resultado` - Perdimos la referencia al graph
- ❌ `Error en handleImportFromImage` - Error general

### 5. Verificar Nodos en el Graph

Después de la importación, ejecuta esto en la **consola del navegador**:

```javascript
// Ver cuántos nodos hay en el graph
window.graph?.getNodes().length;

// Ver todos los nodos
window.graph?.getNodes().map((n) => ({
  id: n.id,
  name: n.getData()?.name,
  visible: n.isVisible(),
  position: n.getPosition(),
}));
```

## Qué Enviarme

Por favor copia y pégame:

1. **Todos los logs de la consola** desde `🎬 handleImportFromImage iniciado` hasta `🏁 completado`
2. **El resultado de `window.graph?.getNodes().length`**
3. **El resultado del segundo comando** (lista de nodos)
4. **¿Aparece algo en el editor?** (Sí/No)

## Posibles Causas

Si los logs muestran que todo se ejecutó correctamente pero no ves nada:

1. **Nodos creados fuera de vista:** Los nodos existen pero están fuera del área visible
2. **Problema de rendering:** X6 no está actualizando la vista
3. **Problema de z-index:** Los nodos están detrás de algo
4. **Problema de batch update:** El batch no se está aplicando correctamente

---

**NOTA:** Los logs están temporales solo para debugging. Una vez que identifiquemos el problema, los eliminaremos.
