# Configuración del Asistente de IA

## Configuración de Groq API

Para usar el asistente de IA, necesitas configurar la API key de Groq:

### 1. Obtener API Key de Groq

1. Ve a [https://console.groq.com/keys](https://console.groq.com/keys)
2. Crea una cuenta gratuita
3. Genera una nueva API key
4. Copia la API key (formato: `gsk_...`)

### 2. Configurar Variables de Entorno

Crea un archivo `.env` en la carpeta `backend/` con el siguiente contenido:

```env
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/database_name"

# JWT Configuration
JWT_SECRET="your-super-secret-jwt-key-here-change-this-in-production"

# Groq AI API Configuration
GROQ_API_KEY="gsk_your_groq_api_key_here"  # ← CAMBIADO: placeholder en lugar de API key real


# Server Configuration
PORT=3000
NODE_ENV=development

# CORS Configuration (optional)
CORS_ORIGIN="http://localhost:5173"
```

### 3. Reemplazar la API Key

Reemplaza `gsk_your_groq_api_key_here` con tu API key real de Groq.

### 4. Reiniciar el Backend

Después de configurar las variables de entorno, reinicia el servidor backend:

```bash
cd backend
npm run start:dev
```

## Funcionalidades del Asistente de IA

- ✅ **Análisis de requerimientos**: Describe tu sistema y obtén sugerencias de clases
- ✅ **Generación de relaciones**: Sugerencias automáticas de relaciones UML
- ✅ **Integración directa**: Agrega clases y relaciones directamente al diagrama
- ✅ **Fallback inteligente**: Si Groq no está disponible, usa respuestas predefinidas

## Modelo de IA Utilizado

- **Modelo**: `llama3-8b-8192` (gratuito y rápido)
- **Proveedor**: Groq
- **Límites**: 14,400 requests/minuto (gratuito)

## Ejemplos de Uso

### Sistema de Biblioteca

```
"Sistema de biblioteca con usuarios, libros y préstamos"
```

### E-commerce

```
"Tienda online con clientes, productos y pedidos"
```

### Gestión de Empleados

```
"Sistema de recursos humanos con empleados, departamentos y nóminas"
```
