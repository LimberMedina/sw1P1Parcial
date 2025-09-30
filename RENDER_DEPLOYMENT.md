# 🚀 Guía de Despliegue en Render

Esta guía te ayudará a desplegar tu aplicación UML Editor en Render de forma completa.

## 📋 Prerrequisitos

1. **Cuenta en Render**: [render.com](https://render.com)
2. **Repositorio en GitHub**: Tu código debe estar en GitHub
3. **API Key de Groq** (opcional): Para el asistente de IA

## 🗄️ Paso 1: Configurar Base de Datos PostgreSQL

### 1.1 Crear Base de Datos
1. Ve a tu dashboard de Render
2. Click en **"New +"** → **"PostgreSQL"**
3. Configuración:
   - **Name**: `uml-editor-db`
   - **Database**: `uml_editor`
   - **User**: `uml_editor_user`
   - **Plan**: Free (para desarrollo)
4. Click **"Create Database"**

### 1.2 Obtener Connection String
1. Ve a tu base de datos creada
2. Copia la **"External Database URL"**
3. Guárdala para el siguiente paso

## 🔴 Paso 2: Configurar Redis (Opcional)

### 2.1 Crear Redis
1. Click en **"New +"** → **"Redis"**
2. Configuración:
   - **Name**: `uml-editor-redis`
   - **Plan**: Free
3. Click **"Create Redis"**

### 2.2 Obtener Connection String
1. Ve a tu Redis creado
2. Copia la **"External Redis URL"**

## ⚙️ Paso 3: Desplegar Backend

### 3.1 Crear Web Service
1. Click en **"New +"** → **"Web Service"**
2. Conecta tu repositorio de GitHub
3. Configuración:
   - **Name**: `uml-editor-backend`
   - **Environment**: `Node`
   - **Build Command**: 
     ```bash
     cd backend && npm install && npx prisma generate && npx prisma migrate deploy && npm run build
     ```
   - **Start Command**: 
     ```bash
     cd backend && npm run start:prod
     ```

### 3.2 Variables de Entorno del Backend
Agrega estas variables en la sección **"Environment"**:

```env
NODE_ENV=production
DATABASE_URL=postgresql://usuario:password@host:puerto/database
JWT_SECRET=tu-clave-secreta-super-larga-y-aleatoria
GROQ_API_KEY=gsk_tu_api_key_de_groq
CORS_ORIGIN=https://uml-editor-frontend.onrender.com
REDIS_URL=redis://usuario:password@host:puerto
```

**Nota**: Reemplaza los valores con los reales de tu base de datos y Redis.

### 3.3 Desplegar
1. Click **"Create Web Service"**
2. Espera a que termine el build (5-10 minutos)
3. Anota la URL del backend (ej: `https://uml-editor-backend.onrender.com`)

## 🎨 Paso 4: Desplegar Frontend

### 4.1 Crear Static Site
1. Click en **"New +"** → **"Static Site"**
2. Conecta tu repositorio de GitHub
3. Configuración:
   - **Name**: `uml-editor-frontend`
   - **Build Command**: 
     ```bash
     cd frontend && npm install && npm run build
     ```
   - **Publish Directory**: `frontend/dist`

### 4.2 Variables de Entorno del Frontend
Agrega esta variable:

```env
VITE_API_URL=https://uml-editor-backend.onrender.com
```

**Nota**: Reemplaza con la URL real de tu backend.

### 4.3 Desplegar
1. Click **"Create Static Site"**
2. Espera a que termine el build (3-5 minutos)
3. Anota la URL del frontend (ej: `https://uml-editor-frontend.onrender.com`)

## 🔄 Paso 5: Actualizar URLs

### 5.1 Actualizar CORS en Backend
1. Ve a tu servicio backend en Render
2. Ve a **"Environment"**
3. Actualiza `CORS_ORIGIN` con la URL real de tu frontend:
   ```env
   CORS_ORIGIN=https://uml-editor-frontend.onrender.com
   ```
4. Click **"Save Changes"**
5. El servicio se reiniciará automáticamente

### 5.2 Actualizar API URL en Frontend
1. Ve a tu sitio estático en Render
2. Ve a **"Environment"**
3. Actualiza `VITE_API_URL` con la URL real de tu backend:
   ```env
   VITE_API_URL=https://uml-editor-backend.onrender.com
   ```
4. Click **"Save Changes"**
5. Se ejecutará un nuevo build automáticamente

## 🧪 Paso 6: Verificar Despliegue

### 6.1 Verificar Backend
1. Visita: `https://tu-backend.onrender.com/api`
2. Deberías ver una respuesta JSON
3. Verifica que no haya errores en los logs

### 6.2 Verificar Frontend
1. Visita: `https://tu-frontend.onrender.com`
2. Deberías ver la aplicación funcionando
3. Prueba crear una cuenta y un proyecto

### 6.3 Verificar Base de Datos
1. Ve a tu base de datos en Render
2. Click en **"Connect"** → **"External Connection"**
3. Usa las credenciales para conectarte con un cliente PostgreSQL

## 🚨 Solución de Problemas Comunes

### Error: "Cannot connect to database"
- Verifica que `DATABASE_URL` esté correcto
- Asegúrate de que la base de datos esté creada y activa
- Revisa los logs del backend para más detalles

### Error: "CORS policy"
- Verifica que `CORS_ORIGIN` tenga la URL exacta del frontend
- Asegúrate de incluir `https://` en la URL
- Reinicia el backend después de cambiar CORS

### Error: "Socket connection failed"
- Verifica que `REDIS_URL` esté configurado correctamente
- Asegúrate de que Redis esté activo
- Revisa que el frontend use la URL correcta del backend

### Error: "Build failed"
- Revisa los logs de build para ver el error específico
- Verifica que todas las dependencias estén en `package.json`
- Asegúrate de que los comandos de build sean correctos

## 📊 Monitoreo y Logs

### Ver Logs
1. Ve a tu servicio en Render
2. Click en **"Logs"** para ver logs en tiempo real
3. Usa **"Download Logs"** para obtener logs históricos

### Métricas
1. Ve a **"Metrics"** para ver uso de CPU, memoria, etc.
2. Configura alertas si es necesario

## 🔧 Configuración Avanzada

### Auto-Deploy
- Por defecto, Render hace auto-deploy en cada push a `main`
- Puedes configurar ramas específicas en **"Settings"** → **"Build & Deploy"**

### Custom Domains
1. Ve a **"Settings"** → **"Custom Domains"**
2. Agrega tu dominio personalizado
3. Configura DNS según las instrucciones

### Environment Variables Sensibles
- Usa **"Secret Files"** para archivos de configuración
- Nunca hardcodees secrets en el código

## 💰 Costos

### Plan Gratuito
- **Backend**: 750 horas/mes (suficiente para desarrollo)
- **Frontend**: Ilimitado (sitio estático)
- **PostgreSQL**: 1GB de almacenamiento
- **Redis**: 25MB de almacenamiento

### Plan Pago
- **Starter**: $7/mes por servicio
- **Standard**: $25/mes por servicio
- Incluye más recursos y soporte

## 🎯 Próximos Pasos

1. **Configurar CI/CD**: Automatizar tests antes del deploy
2. **Monitoreo**: Configurar alertas y métricas
3. **Backup**: Configurar backups automáticos de la base de datos
4. **SSL**: Configurar certificados SSL personalizados
5. **CDN**: Usar Cloudflare para mejor rendimiento

## 📞 Soporte

- **Render Docs**: [render.com/docs](https://render.com/docs)
- **Render Community**: [community.render.com](https://community.render.com)
- **GitHub Issues**: Para problemas específicos del código

---

¡Tu aplicación UML Editor debería estar funcionando en Render! 🎉
