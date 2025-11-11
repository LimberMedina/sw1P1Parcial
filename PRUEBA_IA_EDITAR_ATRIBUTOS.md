# 🧪 Pruebas Rápidas - Agregar Atributos con IA

## Prerequisitos

1. Tener el backend corriendo en `http://localhost:3000`
2. Tener el frontend corriendo en `http://localhost:5173`
3. Tener al menos una clase creada en el diagrama (ejemplo: "Usuario")

## 🎯 Casos de Prueba

### ✅ Caso 1: Agregar un atributo simple

**Comando:**

```
agrega el atributo id a la clase Usuario
```

**Resultado esperado:**

- ✅ La IA responde: "¡Perfecto! Voy a actualizar la clase Usuario..."
- ✅ Se agrega `id: String` a la clase Usuario
- ✅ La clase se redimensiona automáticamente
- ✅ Toast notification muestra: "Clase Usuario actualizada"

---

### ✅ Caso 2: Agregar múltiples atributos con tipos

**Comando:**

```
agrega id:Integer y nombre:String a la clase Usuario
```

**Resultado esperado:**

- ✅ Se agregan ambos atributos con los tipos especificados
- ✅ Mensaje: "2 atributo(s): id: Integer, nombre: String"
- ✅ La clase muestra ambos atributos visualmente

---

### ✅ Caso 3: Diferentes formatos de tipos

**Comando:**

```
añade email:String, edad:Integer y activo:Boolean a la tabla Usuario
```

**Resultado esperado:**

- ✅ Se agregan los 3 atributos
- ✅ Cada uno con su tipo correcto

---

### ✅ Caso 4: Agregar métodos

**Comando:**

```
agrega el método calcular() a la clase Usuario
```

**Resultado esperado:**

- ✅ Se agrega `calcular()` a la sección de métodos
- ✅ La clase se redimensiona para mostrar el nuevo método

---

### ✅ Caso 5: Múltiples métodos

**Comando:**

```
añade guardar() y eliminar() a la clase Usuario
```

**Resultado esperado:**

- ✅ Se agregan ambos métodos
- ✅ Mensaje: "2 método(s): guardar(), eliminar()"

---

### ❌ Caso 6: Clase no existe

**Comando:**

```
agrega email a la clase ClienteX
```

**Resultado esperado:**

- ❌ Error: "No encontré la clase 'ClienteX' en el diagrama"
- ℹ️ Muestra lista de clases disponibles

---

### ⚠️ Caso 7: Atributo duplicado

**Setup previo:** La clase Usuario ya tiene `id: Integer`

**Comando:**

```
agrega id a la clase Usuario
```

**Resultado esperado:**

- ⚠️ Aviso: "Los atributos que intentas agregar ya existen"
- ℹ️ Muestra atributos actuales
- 🚫 NO agrega el atributo duplicado

---

### ✅ Caso 8: Tipos invertidos (Tipo primero)

**Comando:**

```
agrega Integer edad y String apellido a la clase Usuario
```

**Resultado esperado:**

- ✅ Se parsean correctamente: `edad: Integer`, `apellido: String`
- ✅ Ambos se agregan a la clase

---

### ✅ Caso 9: Sin tipo especificado

**Comando:**

```
agrega telefono a la clase Usuario
```

**Resultado esperado:**

- ✅ Se agrega como `telefono: String` (tipo por defecto)

---

### ✅ Caso 10: Métodos con parámetros

**Comando:**

```
agrega calcularTotal(Double precio) a la clase Usuario
```

**Resultado esperado:**

- ✅ Se agrega `calcularTotal(Double precio)` exactamente como se escribió

---

## 🔍 Validaciones en Cada Prueba

Después de cada comando, verificar:

1. **Visual:**

   - [ ] La clase muestra el nuevo atributo/método
   - [ ] La clase se redimensionó correctamente
   - [ ] El texto es legible y no se recorta

2. **Toast Notification:**

   - [ ] Aparece mensaje de confirmación
   - [ ] El mensaje indica cuántos elementos se agregaron

3. **Datos del Nodo:**

   - Abrir consola y ejecutar:

   ```javascript
   // En la consola del navegador
   const graph = window.__x6_graph__;
   const nodes = graph.getNodes();
   const usuario = nodes.find((n) => n.getData().name === "Usuario");
   console.log(usuario.getData());
   ```

   - [ ] Los atributos/métodos están en el array correspondiente

4. **Sincronización Y.Doc:**

   - [ ] Si hay múltiples usuarios conectados, todos ven los cambios
   - [ ] No hay conflictos de edición

5. **Sin Errores:**
   - [ ] No hay errores en la consola del navegador
   - [ ] No hay errores en los logs del backend

---

## 🚀 Script de Prueba Automatizado

Puedes ejecutar este script en la consola del navegador (después de crear una clase "Usuario"):

```javascript
// 1. Obtener referencia al asistente IA
const sendMessage = (msg) => {
  const input = document.querySelector('[placeholder*="Escribe"]');
  const button = document.querySelector('button[type="submit"]');
  if (input && button) {
    input.value = msg;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    setTimeout(() => button.click(), 100);
  }
};

// 2. Ejecutar pruebas secuenciales
const tests = [
  "agrega id:Integer a la clase Usuario",
  "añade nombre:String a la clase Usuario",
  "agrega email:String y telefono:String a la clase Usuario",
  "agrega guardar() a la clase Usuario",
];

tests.forEach((test, i) => {
  setTimeout(() => {
    console.log(`🧪 Test ${i + 1}: ${test}`);
    sendMessage(test);
  }, i * 3000); // 3 segundos entre cada prueba
});
```

---

## 📊 Checklist General

Antes de marcar como "funcional al 100%", verificar:

- [ ] ✅ Todos los casos de éxito funcionan
- [ ] ❌ Todos los casos de error muestran mensajes apropiados
- [ ] 🎨 La UI se actualiza correctamente
- [ ] 🔄 La sincronización en tiempo real funciona
- [ ] 📝 Los datos persisten al recargar la página
- [ ] 🚫 No hay memory leaks (listeners se limpian)
- [ ] ⚡ El rendimiento es aceptable (< 500ms por comando)
- [ ] 📱 Funciona en diferentes tamaños de pantalla
- [ ] 🌐 Funciona en Chrome, Firefox, Edge

---

## 🐛 Troubleshooting

### Problema: La clase no se actualiza

**Solución:**

1. Abrir DevTools → Console
2. Verificar que no hay errores
3. Verificar que el evento se dispara:
   ```javascript
   window.addEventListener("uml:class:updated", (e) =>
     console.log("Event fired:", e.detail)
   );
   ```

### Problema: Los cambios no se sincronizan

**Solución:**

1. Verificar que el socket está conectado
2. Abrir DevTools → Network → WS
3. Verificar mensajes Y.js

### Problema: La IA no responde

**Solución:**

1. Verificar que el backend está corriendo
2. Verificar la API key de Groq en `.env`
3. Ver logs del backend

---

**Estado**: Lista para probar ✅
**Última actualización**: 2025-11-10
