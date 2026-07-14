# Panel de agentes conversacionales

Interfaz estilo WhatsApp/CRM conectada a Supabase para operadores que gestionan conversaciones, etiquetas y contactos en tiempo real.

## Qué incluye

- Bandeja de conversaciones con búsqueda, orden por última actividad y filtros por etiquetas
- Ventana de chat con soporte para texto, links, imagen, audio y archivos
- Toggle del bot por conversación
- Gestión de etiquetas con asignación y remoción
- Módulo de contactos con alta, edición y baja
- Endpoints `/api/*` para operaciones obligatorias y CRUD de contactos
- Esquema SQL listo para Supabase en `supabase/schema.sql`

## Variables de entorno

Usa `.env.example` como referencia:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Puesta en marcha

1. Ejecuta `supabase/schema.sql` en tu proyecto.
2. Carga las variables de entorno.
3. Instala dependencias con `npm install`.
4. Para frontend local usa `npm run dev`.
5. Para probar también las funciones `/api/*`, ejecuta el proyecto con entorno compatible con Vercel Functions.

## Endpoints principales

- `POST /api/ingest-message`
- `POST /api/send-message`
- `GET /api/bot-status`
- `POST /api/toggle-bot`
- `POST /api/assign-tags`
- `POST /api/remove-tags`
- `POST /api/upload-image`
- `POST /api/upload-media`
- `POST /api/delete-chat`
- `GET|POST|DELETE /api/contacts`
