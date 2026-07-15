import { createMessageRecord } from './_lib/chat-service.js';
import { badRequest, json, methodNotAllowed, parseJsonBody, withErrorHandling } from './_lib/http.js';
import { requireMetaWhatsAppEnv, sendMetaWhatsAppImage } from './_lib/meta-whatsapp.js';
import { requireServerEnv } from './_lib/supabase.js';

export const config = { runtime: 'edge' };

export default withErrorHandling(async (request) => {
  requireServerEnv();
  requireMetaWhatsAppEnv();

  if (request.method !== 'POST') {
    return methodNotAllowed();
  }

  const body = await parseJsonBody(request);
  if (!body.phone_number || !body.image_url) {
    return badRequest('phone_number e image_url son obligatorios.');
  }

  const caption = body.caption || body.message || '';
  const providerResult = await sendMetaWhatsAppImage({
    phoneNumber: body.phone_number,
    imageUrl: body.image_url,
    caption,
  });

  try {
    const record = await createMessageRecord({
      phoneNumber: body.phone_number,
      userName: body.user_name,
      message: caption,
      sender: 'agent',
      mediaUrl: providerResult.image_url,
      mimeType: 'image/external',
      metadata: {
        source: 'meta_whatsapp',
        provider_message_id: providerResult.message_id,
        provider_contact_wa_id: providerResult.contact_wa_id,
      },
    });

    return json(
      {
        sent: true,
        persisted: true,
        provider: providerResult,
        ...record,
      },
      201,
    );
  } catch (error) {
    return json(
      {
        sent: true,
        persisted: false,
        warning: 'La imagen se envio por Meta, pero no se pudo registrar en el panel.',
        provider: providerResult,
        error: error.message || 'No se pudo persistir el mensaje.',
      },
      202,
    );
  }
});
