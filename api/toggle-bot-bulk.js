import { setBotStatusBulk } from './_lib/chat-service.js';
import { badRequest, json, methodNotAllowed, parseJsonBody, withErrorHandling } from './_lib/http.js';
import { requireServerEnv } from './_lib/supabase.js';

export const config = { runtime: 'edge' };

export default withErrorHandling(async (request) => {
  requireServerEnv();

  if (request.method !== 'POST') {
    return methodNotAllowed();
  }

  const body = await parseJsonBody(request);

  if (!Array.isArray(body.phone_numbers) || body.phone_numbers.length === 0 || typeof body.agent_active !== 'boolean') {
    return badRequest('phone_numbers y agent_active son obligatorios.');
  }

  const result = await setBotStatusBulk(body.phone_numbers, body.agent_active);
  return json(result);
});
