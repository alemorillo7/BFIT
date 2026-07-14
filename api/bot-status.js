import { getBotStatusByPhone } from './_lib/chat-service.js';
import { badRequest, json, methodNotAllowed, withErrorHandling } from './_lib/http.js';
import { requireServerEnv } from './_lib/supabase.js';

export const config = { runtime: 'edge' };

export default withErrorHandling(async (request) => {
  requireServerEnv();

  if (request.method !== 'GET') {
    return methodNotAllowed();
  }

  const phoneNumber = new URL(request.url).searchParams.get('phone_number');
  if (!phoneNumber) {
    return badRequest('phone_number es obligatorio.');
  }

  const result = await getBotStatusByPhone(phoneNumber);
  return json(result);
});
