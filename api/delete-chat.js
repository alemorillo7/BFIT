import { deleteConversationByPhone } from './_lib/chat-service.js';
import { badRequest, json, methodNotAllowed, parseJsonBody, withErrorHandling } from './_lib/http.js';
import { requireServerEnv } from './_lib/supabase.js';

export const config = { runtime: 'edge' };

export default withErrorHandling(async (request) => {
  requireServerEnv();

  if (request.method !== 'POST') {
    return methodNotAllowed();
  }

  const body = await parseJsonBody(request);
  if (!body.phone_number) {
    return badRequest('phone_number es obligatorio.');
  }

  const result = await deleteConversationByPhone(body.phone_number);
  return json(result);
});
