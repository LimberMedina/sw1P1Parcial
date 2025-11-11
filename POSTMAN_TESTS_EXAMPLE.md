# 📮 Ejemplo de Archivo POSTMAN_TESTS.md

Este es un ejemplo de cómo se verá el archivo `POSTMAN_TESTS.md` que se generará automáticamente dentro del código del backend Spring Boot.

## ✨ Características

1. **Todas las operaciones CRUD**: LISTAR, OBTENER, CREAR, ACTUALIZAR y ELIMINAR
2. **Formato copiar y pegar**: Cada petición está lista para copiar directamente a Postman
3. **Instrucciones paso a paso**: Para cada operación se explica exactamente cómo configurar Postman
4. **Ejemplos con datos**: Cada petición POST/PUT incluye un JSON de ejemplo con datos

## 📁 Ubicación

Cuando generes el código Spring Boot desde el sidebar, el archivo se creará en:

```
spring-boot-project.zip
└── POSTMAN_TESTS.md  ← Aquí estará el archivo
```

## 📋 Ejemplo de Contenido Generado

Supongamos que tienes una clase `Usuario` con los atributos:

- `nombre: String`
- `email: String`
- `edad: Integer`

El archivo generado contendrá algo como esto:

---

# 📮 Guía de Pruebas en Postman

Esta guía contiene todas las peticiones HTTP para probar tu API REST generada.
Simplemente **copia y pega** cada petición en Postman y presiona **SEND**.

## 🌐 Configuración Base

**URL Base:** `http://localhost:8080`

---

## 📦 Entidad: Usuario

### 1️⃣ LISTAR TODOS (GET)

```
Método: GET
URL: http://localhost:8080/api/usuarios
Headers: (ninguno requerido)
Body: (ninguno)
```

**Respuesta esperada:** Lista de objetos Usuario

---

### 2️⃣ OBTENER POR ID (GET)

```
Método: GET
URL: http://localhost:8080/api/usuarios/1
Headers: (ninguno requerido)
Body: (ninguno)
```

**Nota:** Cambia el `1` por el ID que desees consultar.

---

### 3️⃣ CREAR NUEVO (POST)

```
Método: POST
URL: http://localhost:8080/api/usuarios
Headers:
  Content-Type: application/json
Body (raw - JSON):
```

```json
{
  "nombre": "sample_nombre",
  "email": "sample_email",
  "edad": 1
}
```

**Instrucciones:**

1. En Postman, selecciona método **POST**
2. Pega la URL: `http://localhost:8080/api/usuarios`
3. Ve a la pestaña **Headers**
4. Agrega: `Content-Type` = `application/json`
5. Ve a la pestaña **Body** → selecciona **raw** → selecciona **JSON**
6. Pega el JSON de arriba
7. Presiona **SEND**

---

### 4️⃣ ACTUALIZAR (PUT)

```
Método: PUT
URL: http://localhost:8080/api/usuarios/1
Headers:
  Content-Type: application/json
Body (raw - JSON):
```

```json
{
  "nombre": "sample_nombre",
  "email": "sample_email",
  "edad": 1
}
```

**Nota:**

- Cambia el `1` en la URL por el ID del registro que quieres actualizar
- El body debe incluir los datos actualizados

**Instrucciones:**

1. En Postman, selecciona método **PUT**
2. Pega la URL: `http://localhost:8080/api/usuarios/1` (cambia el ID)
3. Ve a la pestaña **Headers**
4. Agrega: `Content-Type` = `application/json`
5. Ve a la pestaña **Body** → selecciona **raw** → selecciona **JSON**
6. Pega el JSON de arriba con los datos actualizados
7. Presiona **SEND**

---

### 5️⃣ ELIMINAR (DELETE)

```
Método: DELETE
URL: http://localhost:8080/api/usuarios/1
Headers: (ninguno requerido)
Body: (ninguno)
```

**Nota:** Cambia el `1` por el ID del registro que deseas eliminar.

**Instrucciones:**

1. En Postman, selecciona método **DELETE**
2. Pega la URL: `http://localhost:8080/api/usuarios/1` (cambia el ID)
3. Presiona **SEND**

**Respuesta esperada:**

- Código 204 (No Content) si se eliminó correctamente
- Código 404 (Not Found) si no existe el ID

---

## 🔧 Consejos para usar Postman

### Crear una Collection

1. En Postman, haz clic en **Collections** → **New Collection**
2. Nómbrala "Spring Boot API Tests"
3. Crea una carpeta para cada entidad
4. Dentro de cada carpeta, crea las 5 peticiones (GET, GET/:id, POST, PUT, DELETE)

### Usar Variables de Entorno

1. En Postman, crea un Environment llamado "Local"
2. Agrega variable: `base_url` = `http://localhost:8080`
3. Usa `{{base_url}}/api/usuarios` en tus URLs

### Importar Collection JSON

También puedes usar el archivo `postman-collection.json` incluido:

1. En Postman → **Import**
2. Selecciona el archivo `postman-collection.json`
3. Todas las peticiones se importarán automáticamente

---

## ✅ Verificación de Respuestas

### Códigos HTTP comunes:

- `200 OK` - Petición exitosa (GET, PUT)
- `201 Created` - Recurso creado exitosamente (POST)
- `204 No Content` - Eliminación exitosa (DELETE)
- `404 Not Found` - Recurso no encontrado
- `500 Internal Server Error` - Error en el servidor

### Verificar que funciona:

1. **Primero:** Ejecuta el proyecto Spring Boot (`mvn spring-boot:run`)
2. **Luego:** Prueba el endpoint de listar (GET) - debe retornar `[]` o datos existentes
3. **Después:** Crea un registro con POST
4. **Finalmente:** Prueba los demás endpoints

---

## 🐛 Solución de Problemas

### Error: "Connection refused"

- ✅ Verifica que Spring Boot esté corriendo en puerto 8080
- ✅ Revisa los logs de la consola

### Error: 404 Not Found en POST/PUT

- ✅ Verifica que la URL sea correcta: `/api/usuarios`
- ✅ Asegúrate de incluir `/api` en la ruta

### Error: 400 Bad Request

- ✅ Verifica que el header `Content-Type: application/json` esté presente
- ✅ Revisa que el JSON esté bien formado (sin comas finales, comillas correctas)

### Error: 500 Internal Server Error

- ✅ Revisa los logs de Spring Boot en la consola
- ✅ Verifica que PostgreSQL esté corriendo y conectado

---

## 📚 Ejemplos Completos

### Ejemplo: Crear y luego Actualizar

**Paso 1 - Crear (POST):**

```
POST http://localhost:8080/api/usuarios
Content-Type: application/json

{
  "nombre": "Juan Pérez",
  "email": "juan@example.com",
  "edad": 25
}
```

**Paso 2 - La respuesta te dará un ID, por ejemplo:** `{"id": 1, "nombre": "Juan Pérez", ...}`

**Paso 3 - Actualizar ese registro (PUT):**

```
PUT http://localhost:8080/api/usuarios/1
Content-Type: application/json

{
  "nombre": "Juan Pérez Actualizado",
  "email": "juan.nuevo@example.com",
  "edad": 26
}
```

---

🎉 **¡Listo! Ya puedes probar tu API REST completa en Postman**

---

## 🎯 Uso en tu Proyecto

Este archivo se generará automáticamente cuando:

1. Vayas al **Sidebar** del editor UML
2. Hagas clic en **"Generar Código Spring Boot"**
3. Se descargará un ZIP que incluirá este archivo `POSTMAN_TESTS.md`

El archivo contendrá las peticiones para **todas las entidades** que hayas creado en tu diagrama UML.
