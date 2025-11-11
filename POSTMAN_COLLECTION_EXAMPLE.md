# 📦 Ejemplo de Colección Postman Generada

## 🎯 Para un Diagrama con 3 Clases: Usuario, Producto, Orden

```json
{
  "info": {
    "name": "Generated API - Full CRUD Tests",
    "description": "Colección generada automáticamente con pruebas completas"
  },
  "item": [
    {
      "name": "Usuario CRUD",
      "description": "Operaciones CRUD completas para Usuario con pruebas automáticas",
      "item": [
        {
          "name": "1. Get All Usuarios",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test('Status code es 200', ...);"
                  "pm.test('Response es un array', ...);"
                  "pm.test('Content-Type es application/json', ...);"
                  "pm.test('Response time menor a 2000ms', ...);"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "url": "{{base_url}}/api/usuarios"
          }
        },
        {
          "name": "2. Create Usuario",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test('Status code es 200 o 201', ...);"
                  "pm.test('Response contiene ID', ...);"
                  "pm.environment.set('usuarioId', jsonData.id);"
                  "pm.test('Response time menor a 2000ms', ...);"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "url": "{{base_url}}/api/usuarios",
            "body": {
              "mode": "raw",
              "raw": "{\n  \"nombre\": \"sample_nombre\",\n  \"email\": \"sample_email\"\n}"
            }
          }
        },
        {
          "name": "3. Get Usuario by ID",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test('Status code es 200', ...);"
                  "pm.test('Response contiene el ID solicitado', ...);"
                  "pm.test('ID coincide', ...);"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "url": "{{base_url}}/api/usuarios/{{usuarioId}}"
          }
        },
        {
          "name": "4. Update Usuario",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test('Status code es 200', ...);"
                  "pm.test('ID no cambió', ...);"
                ]
              }
            }
          ],
          "request": {
            "method": "PUT",
            "url": "{{base_url}}/api/usuarios/{{usuarioId}}",
            "body": {
              "mode": "raw",
              "raw": "{\n  \"nombre\": \"updated_nombre\",\n  \"email\": \"updated_email\"\n}"
            }
          }
        },
        {
          "name": "5. Delete Usuario",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test('Status code es 200 o 204', ...);"
                  "pm.environment.unset('usuarioId');"
                ]
              }
            }
          ],
          "request": {
            "method": "DELETE",
            "url": "{{base_url}}/api/usuarios/{{usuarioId}}"
          }
        },
        {
          "name": "6. Verify Delete - Get Usuario by ID (Should Fail)",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test('Status code es 404 (registro eliminado)', ...);"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "url": "{{base_url}}/api/usuarios/{{usuarioId}}"
          }
        }
      ]
    },
    {
      "name": "Producto CRUD",
      "description": "Operaciones CRUD completas para Producto con pruebas automáticas",
      "item": [
        {
          "name": "1. Get All Productos",
          "event": [ /* Tests automáticos */ ],
          "request": {
            "method": "GET",
            "url": "{{base_url}}/api/productos"
          }
        },
        {
          "name": "2. Create Producto",
          "event": [ /* Tests automáticos */ ],
          "request": {
            "method": "POST",
            "url": "{{base_url}}/api/productos",
            "body": {
              "mode": "raw",
              "raw": "{\n  \"nombre\": \"sample_nombre\",\n  \"precio\": 1.0\n}"
            }
          }
        },
        /* ... 4 endpoints más con tests ... */
      ]
    },
    {
      "name": "Orden CRUD",
      "description": "Operaciones CRUD completas para Orden con pruebas automáticas",
      "item": [
        /* ... 6 endpoints con tests ... */
      ]
    }
  ],
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:8080",
      "type": "string"
    }
  ]
}
```

---

## 📊 Vista en Postman

### Estructura de Carpetas

```
📦 Generated API - Full CRUD Tests
 │
 ├─📁 Usuario CRUD
 │  ├─ 1️⃣ Get All Usuarios
 │  │   └─ ✅ 4 tests automáticos
 │  ├─ 2️⃣ Create Usuario
 │  │   └─ ✅ 5 tests automáticos + guarda ID
 │  ├─ 3️⃣ Get Usuario by ID
 │  │   └─ ✅ 4 tests automáticos + usa ID guardado
 │  ├─ 4️⃣ Update Usuario
 │  │   └─ ✅ 4 tests automáticos + usa ID guardado
 │  ├─ 5️⃣ Delete Usuario
 │  │   └─ ✅ 3 tests automáticos + limpia ID
 │  └─ 6️⃣ Verify Delete (404)
 │      └─ ✅ 2 tests automáticos
 │
 ├─📁 Producto CRUD
 │  ├─ 1️⃣ Get All Productos
 │  ├─ 2️⃣ Create Producto
 │  ├─ 3️⃣ Get Producto by ID
 │  ├─ 4️⃣ Update Producto
 │  ├─ 5️⃣ Delete Producto
 │  └─ 6️⃣ Verify Delete (404)
 │
 └─📁 Orden CRUD
    ├─ 1️⃣ Get All Ordenes
    ├─ 2️⃣ Create Orden
    ├─ 3️⃣ Get Orden by ID
    ├─ 4️⃣ Update Orden
    ├─ 5️⃣ Delete Orden
    └─ 6️⃣ Verify Delete (404)
```

---

## 🎬 Flujo de Ejecución Visual

### 1. Get All (Estado Inicial)

```
Petición:  GET /api/usuarios
Respuesta: []  (array vacío - sin usuarios)
Tests:     ✅ Status 200
           ✅ Es array
           ✅ Content-Type correcto
           ✅ Tiempo < 2s
```

### 2. Create (Crear Usuario)

```
Petición:  POST /api/usuarios
Body:      { "nombre": "Juan", "email": "juan@test.com" }
Respuesta: { "id": 1, "nombre": "Juan", "email": "juan@test.com" }
Tests:     ✅ Status 200/201
           ✅ Tiene ID
           ✅ ID es número
           ✅ Estructura correcta
           ✅ Tiempo < 2s
Variable:  usuarioId = 1 (guardado)
```

### 3. Get by ID (Verificar Creación)

```
Petición:  GET /api/usuarios/{{usuarioId}}  → GET /api/usuarios/1
Respuesta: { "id": 1, "nombre": "Juan", "email": "juan@test.com" }
Tests:     ✅ Status 200
           ✅ ID coincide (1 = 1)
           ✅ Es objeto
           ✅ Tiempo < 1s
```

### 4. Update (Modificar Usuario)

```
Petición:  PUT /api/usuarios/{{usuarioId}}  → PUT /api/usuarios/1
Body:      { "nombre": "Juan Modificado", "email": "juan2@test.com" }
Respuesta: { "id": 1, "nombre": "Juan Modificado", "email": "juan2@test.com" }
Tests:     ✅ Status 200
           ✅ ID no cambió (1 = 1)
           ✅ Es objeto
           ✅ Tiempo < 2s
```

### 5. Delete (Eliminar Usuario)

```
Petición:  DELETE /api/usuarios/{{usuarioId}}  → DELETE /api/usuarios/1
Respuesta: (vacío o confirmación)
Tests:     ✅ Status 200/204
           ✅ Tiempo < 1s
Variable:  usuarioId = eliminado
```

### 6. Verify Delete (Confirmar Eliminación)

```
Petición:  GET /api/usuarios/{{usuarioId}}  → GET /api/usuarios/1
Respuesta: 404 Not Found
Tests:     ✅ Status 404 (esperado!)
           ✅ Tiempo < 1s
```

---

## 📈 Resultados en Collection Runner

### Vista de Resumen

```
┌─────────────────────────────────────────────────┐
│  Collection: Generated API - Full CRUD Tests    │
├─────────────────────────────────────────────────┤
│  Folder: Usuario CRUD                           │
│  ✅ Passed: 22/22 (100%)                        │
│  ⏱️  Duration: 2.5s                              │
│  📊 Avg Response: 417ms                          │
├─────────────────────────────────────────────────┤
│  Iterations: 1                                   │
│  Requests:   6 / 6                               │
│  Tests:      22 / 22                             │
│  Scripts:    12 / 12                             │
└─────────────────────────────────────────────────┘

Detailed Results:
┌─────────────────────────────────────────────────┐
│ 1. Get All Usuarios               200  425ms    │
│    ✅ Status code es 200                        │
│    ✅ Response es un array                      │
│    ✅ Content-Type es application/json          │
│    ✅ Response time menor a 2000ms              │
│                                                  │
│ 2. Create Usuario                 201  523ms    │
│    ✅ Status code es 200 o 201                  │
│    ✅ Response contiene ID                      │
│    ✅ ID es un número                           │
│    ✅ ID guardado en variable                   │
│    ✅ Estructura correcta                       │
│    ✅ Response time menor a 2000ms              │
│                                                  │
│ 3. Get Usuario by ID              200  312ms    │
│    ✅ Status code es 200                        │
│    ✅ Response contiene el ID solicitado        │
│    ✅ ID coincide                               │
│    ✅ Es objeto                                 │
│    ✅ Response time menor a 1000ms              │
│                                                  │
│ 4. Update Usuario                 200  487ms    │
│    ✅ Status code es 200                        │
│    ✅ ID no cambió                              │
│    ✅ Es objeto                                 │
│    ✅ Response time menor a 2000ms              │
│                                                  │
│ 5. Delete Usuario                 204  256ms    │
│    ✅ Status code es 200 o 204                  │
│    ✅ Variable limpiada                         │
│    ✅ Response time menor a 1000ms              │
│                                                  │
│ 6. Verify Delete                  404  189ms    │
│    ✅ Status code es 404 (registro eliminado)   │
│    ✅ Response time menor a 1000ms              │
└─────────────────────────────────────────────────┘

Export Results:
📄 HTML Report: collection-report.html
📊 JSON Report: collection-report.json
```

---

## 💡 Variables de Entorno Dinámicas

### Estado durante la ejecución:

**Antes de CREATE:**

```json
{
  "base_url": "http://localhost:8080"
}
```

**Después de CREATE Usuario:**

```json
{
  "base_url": "http://localhost:8080",
  "usuarioId": 1
}
```

**Después de CREATE Producto:**

```json
{
  "base_url": "http://localhost:8080",
  "usuarioId": 1,
  "productoId": 5
}
```

**Después de DELETE Usuario:**

```json
{
  "base_url": "http://localhost:8080",
  "productoId": 5
}
```

---

## 🎨 Vista en Postman (UI)

### Pestaña Tests (Ejemplo)

```javascript
// Tab: Tests
┌──────────────────────────────────────────┐
│  Test Scripts                            │
├──────────────────────────────────────────┤
│                                          │
│  // Validar código de estado            │
│  pm.test('Status code es 200', function()│
│      pm.response.to.have.status(200);   │
│  });                                     │
│                                          │
│  // Validar que sea un array             │
│  pm.test('Response es un array', function│
│      const jsonData = pm.response.json();│
│      pm.expect(jsonData).to.be.an('array│
│  });                                     │
│                                          │
│  // ... más tests ...                    │
│                                          │
└──────────────────────────────────────────┘
```

### Pestaña Test Results (Después de enviar)

```
┌──────────────────────────────────────────┐
│  Test Results                            │
├──────────────────────────────────────────┤
│                                          │
│  ✅ Status code es 200                   │
│  ✅ Response es un array                 │
│  ✅ Content-Type es application/json     │
│  ✅ Response time menor a 2000ms         │
│                                          │
├──────────────────────────────────────────┤
│  Tests Passed: 4/4                       │
│  Duration: 425ms                         │
└──────────────────────────────────────────┘
```

---

**¡Esto es lo que se genera automáticamente! 🎉**
