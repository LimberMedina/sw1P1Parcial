# 🚀 Inicio Rápido: Pruebas con Postman

## ⚡ 3 Pasos Simples

### 1️⃣ Genera tu proyecto

```
Editor UML → Diseña clases → "Generar Spring Boot" → Descargar ZIP
```

### 2️⃣ Importa en Postman

```
Postman → Import → postman-collection.json + postman-environment.json
```

### 3️⃣ Ejecuta las pruebas

```
Click derecho en carpeta de entidad → Run folder → Ver resultados
```

---

## 📦 Archivos Incluidos

| Archivo                    | Descripción                                   | Acción              |
| -------------------------- | --------------------------------------------- | ------------------- |
| `postman-collection.json`  | Colección con 6 endpoints + tests por entidad | Importar en Postman |
| `postman-environment.json` | Variables de entorno (base_url, IDs)          | Importar y activar  |
| `postman/TESTING_GUIDE.md` | Guía completa de pruebas                      | Leer para detalles  |

---

## 🎯 Lo que obtienes por CADA entidad

✅ **6 endpoints completos:**

- Get All
- Create (guarda ID automáticamente)
- Get by ID (usa ID guardado)
- Update (usa ID guardado)
- Delete (limpia ID)
- Verify Delete (confirma 404)

✅ **22+ tests automáticos** que validan:

- Códigos HTTP correctos
- Estructura de datos
- Tipos de datos
- Tiempos de respuesta
- Manejo de variables

---

## 💻 Ejemplo de Ejecución

### Antes de ejecutar:

```bash
# 1. Inicia PostgreSQL
# 2. Crea la base de datos
psql -U postgres -c "CREATE DATABASE uml_crud_db;"

# 3. Inicia Spring Boot
mvn spring-boot:run
```

### En Postman:

```
1. Activa el environment "Generated Environment"
2. Click derecho en "Usuario CRUD"
3. Run folder
4. Observa: ✅ 22/22 tests passed
```

---

## 📊 Resultado Típico

```
✅ Get All Usuarios      200  425ms  ✅ 4/4 tests
✅ Create Usuario        201  523ms  ✅ 5/5 tests
✅ Get Usuario by ID     200  312ms  ✅ 4/4 tests
✅ Update Usuario        200  487ms  ✅ 4/4 tests
✅ Delete Usuario        204  256ms  ✅ 3/3 tests
✅ Verify Delete         404  189ms  ✅ 2/2 tests

Total: 22/22 tests passed (100%) en 2.5s
```

---

## 🔥 Pro Tips

💡 **Ejecuta en orden:** Las pruebas 2→6 dependen de variables guardadas

💡 **Usa Collection Runner:** Para reportes profesionales

💡 **Limpia la BD:** Entre ejecuciones completas para evitar conflictos

💡 **Revisa la consola:** View → Show Postman Console para logs detallados

---

## 🐛 Troubleshooting Rápido

| Problema                       | Solución                                  |
| ------------------------------ | ----------------------------------------- |
| 🔴 "base_url is not defined"   | Activa el environment (dropdown superior) |
| 🔴 404 en todas las peticiones | Inicia el servidor: `mvn spring-boot:run` |
| 🔴 Variables no se guardan     | Ejecuta CREATE primero (petición #2)      |
| 🔴 Tests de tiempo fallan      | Normal en primera ejecución, re-ejecuta   |

---

## 📚 Más Información

📖 **Guía completa:** Lee `postman/TESTING_GUIDE.md` (en el ZIP generado)

🎓 **Postman Learning:** https://learning.postman.com/

🌐 **Documentación Spring Boot:** https://spring.io/guides

---

## ✅ Checklist Pre-Ejecución

- [ ] PostgreSQL corriendo
- [ ] Base de datos `uml_crud_db` creada
- [ ] Spring Boot corriendo en puerto 8080
- [ ] Colección importada en Postman
- [ ] Environment activado
- [ ] Servidor responde en http://localhost:8080

---

**¡Listo! Ahora tienes pruebas automáticas profesionales.** 🎉

**Próximo paso:** Ejecuta tu primera prueba y observa los resultados en tiempo real.
