# ✅ Nueva Funcionalidad: Pruebas Automáticas con Postman

## 🎯 Descripción

Se ha mejorado el generador de código Spring Boot para incluir **pruebas automáticas completas** en Postman. Ahora cuando generas el backend, obtendrás una colección de Postman profesional con tests automatizados listos para usar.

---

## 🆕 ¿Qué se agregó?

### 1. Colección de Postman Mejorada (`postman-collection.json`)

**Antes:**

- ❌ Solo 2 endpoints (GET all, CREATE)
- ❌ Sin tests automáticos
- ❌ Sin variables dinámicas

**Ahora:**

- ✅ **6 endpoints completos** por cada entidad:

  1. Get All
  2. Create
  3. Get by ID
  4. Update
  5. Delete
  6. Verify Delete (404)

- ✅ **Tests automáticos** en cada endpoint:

  - Validación de códigos HTTP (200, 201, 404, etc.)
  - Validación de estructura de respuesta
  - Validación de tipos de datos
  - Medición de tiempos de respuesta
  - Variables dinámicas (IDs)

- ✅ **Manejo automático de variables:**
  - Guarda IDs después de CREATE
  - Usa IDs guardados en GET/PUT/DELETE
  - Limpia variables después de DELETE

### 2. Environment de Postman (`postman-environment.json`)

- ✅ Variables de entorno pre-configuradas
- ✅ `base_url` configurable
- ✅ Soporte para múltiples entornos (dev, prod, etc.)

### 3. Guía Completa de Pruebas (`postman/TESTING_GUIDE.md`)

- ✅ Instrucciones paso a paso
- ✅ Escenarios de prueba completos
- ✅ Solución de problemas comunes
- ✅ Interpretación de resultados
- ✅ Mejores prácticas

### 4. README Mejorado

- ✅ Sección dedicada a Postman
- ✅ Instrucciones de importación
- ✅ Cómo ejecutar las pruebas
- ✅ Interpretación de resultados

---

## 📋 Ejemplo de Tests Generados

### Test de CREATE

```javascript
// Validar código de estado
pm.test("Status code es 200 o 201", function () {
  pm.expect(pm.response.code).to.be.oneOf([200, 201]);
});

// Validar que la respuesta tenga un ID
pm.test("Response contiene ID", function () {
  const jsonData = pm.response.json();
  pm.expect(jsonData).to.have.property("id");
  pm.expect(jsonData.id).to.be.a("number");

  // Guardar ID para siguientes pruebas
  pm.environment.set("usuarioId", jsonData.id);
  console.log("Usuario creado con ID: " + jsonData.id);
});

// Validar tiempo de respuesta
pm.test("Response time menor a 2000ms", function () {
  pm.expect(pm.response.responseTime).to.be.below(2000);
});
```

### Test de GET by ID

```javascript
// Validar código de estado
pm.test("Status code es 200", function () {
  pm.response.to.have.status(200);
});

// Validar que tenga el ID correcto
pm.test("Response contiene el ID solicitado", function () {
  const jsonData = pm.response.json();
  const requestedId = pm.environment.get("usuarioId");
  pm.expect(jsonData).to.have.property("id");
  pm.expect(jsonData.id).to.eql(parseInt(requestedId));
});
```

### Test de DELETE

```javascript
// Validar código de estado
pm.test("Status code es 200 o 204", function () {
  pm.expect(pm.response.code).to.be.oneOf([200, 204]);
});

// Limpiar variable de entorno
pm.environment.unset("usuarioId");
console.log("Usuario eliminado exitosamente");
```

---

## 🚀 Cómo Usar

### 1. Generar el Proyecto

Desde el editor UML:

1. Diseña tu diagrama de clases
2. Click en "Generar Spring Boot"
3. Descarga el archivo ZIP

### 2. Archivos Generados

```
spring-boot-project/
├── src/
├── pom.xml
├── application.properties
├── postman-collection.json          ← 🆕 Colección con tests
├── postman-environment.json         ← 🆕 Variables
└── postman/
    └── TESTING_GUIDE.md             ← 🆕 Guía completa
```

### 3. Importar en Postman

1. Abre Postman
2. Import → Selecciona `postman-collection.json`
3. Import → Selecciona `postman-environment.json`
4. Activa el environment (dropdown superior derecha)

### 4. Ejecutar Pruebas

**Opción A: Prueba Individual**

1. Click en una petición
2. Click en **Send**
3. Ve a **Test Results** para ver las validaciones

**Opción B: Prueba Completa (Recomendado)**

1. Click derecho en carpeta de entidad
2. **Run folder**
3. Click en **Run**
4. Observa resultados en tiempo real

**Opción C: Todas las Entidades**

1. Click en la colección
2. Click en **Run**
3. Selecciona todas las carpetas
4. Click en **Run**

---

## 📊 Ejemplo de Resultados

### Ejecución Exitosa

```
✓ Status code es 200                    PASS
✓ Response es un array                  PASS
✓ Content-Type es application/json      PASS
✓ Response time menor a 2000ms          PASS

Summary:
- Requests: 6/6
- Tests: 24/24 passed
- Duration: 3.2s
```

### Con Errores

```
✓ Status code es 200                    PASS
✗ Response contiene ID                  FAIL
  Expected response to have property 'id'
✓ Response time menor a 2000ms          PASS

Summary:
- Requests: 6/6
- Tests: 22/24 passed (2 failed)
- Duration: 3.5s
```

---

## 🎯 Ventajas

### Para Desarrollo

- ✅ **Pruebas inmediatas** sin escribir código
- ✅ **Validación automática** de endpoints
- ✅ **Detección temprana** de errores
- ✅ **Feedback visual** de lo que funciona

### Para Testing

- ✅ **Regresión automática** al hacer cambios
- ✅ **Documentación viva** de la API
- ✅ **Casos de prueba reutilizables**
- ✅ **Reportes profesionales**

### Para Integración

- ✅ **Newman CLI** para CI/CD
- ✅ **Integración con Jenkins**
- ✅ **Reportes HTML**
- ✅ **Monitoreo continuo**

---

## 🔧 Personalización

### Modificar Tiempos de Respuesta

Edita el test en Postman:

```javascript
// Cambiar de 2000ms a 5000ms
pm.test("Response time menor a 5000ms", function () {
  pm.expect(pm.response.responseTime).to.be.below(5000);
});
```

### Agregar Validaciones Custom

```javascript
// Validar formato de email
pm.test("Email tiene formato válido", function () {
  const jsonData = pm.response.json();
  pm.expect(jsonData.email).to.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
});

// Validar longitud de string
pm.test("Nombre tiene mínimo 3 caracteres", function () {
  const jsonData = pm.response.json();
  pm.expect(jsonData.nombre.length).to.be.at.least(3);
});
```

### Cambiar URL Base

En el environment, modifica `base_url`:

- Local: `http://localhost:8080`
- Servidor remoto: `http://tu-servidor.com:8080`
- Android Emulator: `http://10.0.2.2:8080`

---

## 📚 Archivos Modificados

### `JavaSpringGenerator.ts`

**Cambios principales:**

1. **Método `generatePostmanCollection()` mejorado:**

   - Genera 6 endpoints por entidad (antes: 2)
   - Incluye tests automáticos en cada uno
   - Maneja variables dinámicas
   - Mejor estructura y documentación

2. **Método `generateSampleRequestBody()` mejorado:**

   - Acepta parámetro `isUpdate`
   - Genera datos diferentes para CREATE vs UPDATE
   - Valores más realistas

3. **Nuevo método `generatePostmanTestingGuide()`:**

   - Genera guía completa de pruebas
   - Incluye escenarios, troubleshooting, tips

4. **README mejorado:**
   - Sección dedicada a Postman
   - Instrucciones detalladas
   - Ejemplos visuales

---

## 🎓 Próximos Pasos

### Para el Usuario

1. ✅ Genera tu proyecto Spring Boot
2. ✅ Importa los archivos en Postman
3. ✅ Ejecuta las pruebas
4. ✅ Lee la guía en `postman/TESTING_GUIDE.md`

### Mejoras Futuras Posibles

- [ ] Tests de validación de datos (ej: email válido)
- [ ] Tests de relaciones entre entidades
- [ ] Tests de paginación
- [ ] Tests de búsqueda/filtrado
- [ ] Generación de Newman scripts para CI/CD
- [ ] Tests de performance/carga
- [ ] Tests de seguridad (autenticación)

---

## 🐛 Solución de Problemas Comunes

### Variables no se guardan

**Causa:** Environment no activado  
**Solución:** Activa el environment en el dropdown superior

### 404 en todas las peticiones

**Causa:** Servidor no corriendo  
**Solución:** Ejecuta `mvn spring-boot:run`

### Tests de tiempo fallan

**Causa:** Tiempos muy estrictos  
**Solución:** Aumenta los límites en los tests

---

## 📞 Soporte

Para más información:

- 📖 Lee `postman/TESTING_GUIDE.md` (generado en el proyecto)
- 🌐 Documentación oficial de Postman: https://learning.postman.com/
- 🎥 Tutoriales: https://www.postman.com/api-testing/

---

**¡Ahora tienes pruebas automáticas profesionales para tu API! 🚀**
