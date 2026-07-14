import { setBotStatus } from './_lib/chat-service.js';
import { badRequest, json, methodNotAllowed, parseJsonBody, withErrorHandling } from './_lib/http.js';
import { requireServerEnv } from './_lib/supabase.js';

export const config = { runtime: 'edge' };

export default withErrorHandling(async (request) => {
  requireServerEnv();

  if (request.method !== 'POST') {
    return methodNotAllowed();
  }

  const body = await parseJsonBody(request);
  if (!body.phone_number || typeof body.agent_active !== 'boolean') {
    return badRequest('phone_number y agent_active son obligatorios.');
  }

  const result = await setBotStatus(body.phone_number, body.agent_active);
  return json(result);
});
