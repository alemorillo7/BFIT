import { normalizePhoneNumber } from '../../shared/chat.js';

const env = globalThis.process?.env ?? {};
const metaApiVersion = env.META_WHATSAPP_API_VERSION || 'v23.0';
const metaBaseUrl = env.META_WHATSAPP_API_BASE_URL || `https://graph.facebook.com/${metaApiVersion}`;
const metaAccessToken = env.META_WHATSAPP_ACCESS_TOKEN;
const metaPhoneNumberId = env.META_WHATSAPP_PHONE_NUMBER_ID;

const ensureUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('La URL de la imagen debe usar http o https.');
    }

    return url.toString();
  } catch {
    throw new Error('image_url debe ser una URL publica valida.');
  }
};

const formatMetaRecipient = (phoneNumber) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new Error('El telefono es obligatorio.');
  }

  return normalizedPhone.replace(/^\+/, '');
};

export const requireMetaWhatsAppEnv = () => {
  if (!metaAccessToken || !metaPhoneNumberId) {
    throw new Error(
      'Configura META_WHATSAPP_ACCESS_TOKEN y META_WHATSAPP_PHONE_NUMBER_ID para enviar imagenes por Meta.',
    );
  }
};

export const sendMetaWhatsAppImage = async ({ phoneNumber, imageUrl, caption = '' }) => {
  requireMetaWhatsAppEnv();

  const recipient = formatMetaRecipient(phoneNumber);
  const safeImageUrl = ensureUrl(imageUrl);
  const safeCaption = String(caption || '').trim();
  const endpoint = `${metaBaseUrl}/${metaPhoneNumberId}/messages`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${metaAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'image',
      image: {
        link: safeImageUrl,
        ...(safeCaption ? { caption: safeCaption } : {}),
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = payload?.error?.message || 'Meta rechazo el envio de la imagen.';
    throw new Error(errorMessage);
  }

  return {
    provider: 'meta_whatsapp',
    to: recipient,
    image_url: safeImageUrl,
    message_id: payload?.messages?.[0]?.id || null,
    contact_wa_id: payload?.contacts?.[0]?.wa_id || null,
    response: payload,
  };
};
