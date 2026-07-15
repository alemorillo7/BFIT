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
- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_API_VERSION` opcional

## Puesta en marcha

1. Ejecuta `supabase/schema.sql` en tu proyecto.
2. Carga las variables de entorno.
3. Instala dependencias con `npm install`.
4. Para frontend local usa `npm run dev`.
5. Para probar tambien las funciones `/api/*`, abre otra terminal y ejecuta `npm run dev:api`.
6. Vite reenviara `/api/*` automaticamente a `http://localhost:3000`.

## Desarrollo local con API

`npm run dev` levanta solo el frontend en `http://localhost:5173`.

Las rutas `/api/*` no existen por si solas dentro de Vite. Para que funcionen acciones como:

- `POST /api/assign-tags`
- `POST /api/remove-tags`
- `DELETE /api/contacts`
- `POST /api/toggle-bot`

necesitas levantar tambien la API local:

```bash
npm run dev:api
```

Ese comando ejecuta `scripts/dev-api.mjs`, carga tus variables de `.env.local` y expone las funciones en `http://localhost:3000` sin depender de login en Vercel.

Si quieres apuntar el frontend a otra URL de API, puedes definir:

```env
VITE_API_PROXY_TARGET=http://localhost:3000
```

## Endpoints principales

- `POST /api/ingest-message`
- `POST /api/send-message`
- `POST /api/send-image`
- `GET /api/bot-status`
- `POST /api/toggle-bot`
- `POST /api/assign-tags`
- `POST /api/remove-tags`
- `POST /api/upload-image`
- `POST /api/upload-media`
- `POST /api/delete-chat`
- `GET|POST|DELETE /api/contacts`

## Envio de imagenes por Meta

El endpoint `POST /api/send-image` envia una imagen al cliente usando WhatsApp Cloud API y, si Meta responde OK, la registra en el chat como mensaje del agente.

Body JSON:

```json
{
  "phone_number": "+54911XXXXXXX",
  "image_url": "https://tu-cdn.com/imagenes/oferta.jpg",
  "caption": "Te comparto la promo"
}
```

Notas:

- `image_url` debe ser publica y accesible por Meta.
- Si el envio a Meta sale bien pero falla el guardado en Supabase, la API responde `202`.
