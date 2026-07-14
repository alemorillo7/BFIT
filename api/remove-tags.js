import { removeTagsFromConversation } from './_lib/chat-service.js';
import { badRequest, json, methodNotAllowed, parseJsonBody, withErrorHandling } from './_lib/http.js';
import { requireServerEnv } from './_lib/supabase.js';

export const config = { runtime: 'edge' };

export default withErrorHandling(async (request) => {
  requireServerEnv();

  if (request.method !== 'POST') {
    return methodNotAllowed();
  }

  const body = await parseJsonBody(request);
  if (!body.phone_number || !Array.isArray(body.tags)) {
    return badRequest('phone_number y tags son obligatorios.');
  }

  const result = await removeTagsFromConversation(body.phone_number, body.tags);
  return json(result);
});
