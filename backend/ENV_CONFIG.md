# Configuración de Variables de Entorno

## Instrucciones de Configuración

1. **Copiar el archivo de ejemplo:**
   ```bash
   cp env.example .env
   ```

2. **Editar el archivo .env con tus valores reales:**
   - Reemplazar `DATABASE_URL` con tu conexión de base de datos
   - Reemplazar `JWT_SECRET` con una clave secreta segura
   - Reemplazar `GROQ_API_KEY` con tu API key de Groq
   - Ajustar `PORT` y `CORS_ORIGIN` según sea necesario

## Variables de Entorno Requeridas

### DATABASE_URL
- Formato: `postgresql://usuario:contraseña@host:puerto/nombre_db`
- Ejemplo: `postgresql://postgres:password@localhost:5432/uml_editor`

### JWT_SECRET
- Clave secreta para firmar tokens JWT
- Debe ser una cadena larga y aleatoria
- Ejemplo: `mi-clave-super-secreta-para-jwt-2024`

### GROQ_API_KEY
- API key de Groq para el asistente de IA
- Obtener en: https://console.groq.com/keys
- Formato: `gsk_...`

### PORT
- Puerto donde correrá el servidor backend
- Por defecto: `3000`

### CORS_ORIGIN
- URL del frontend para permitir CORS
- Por defecto: `http://localhost:5173` (Vite dev server)
