import { createMessageRecord } from './_lib/chat-service.js';
import { badRequest, json, methodNotAllowed, parseJsonBody, withErrorHandling } from './_lib/http.js';
import { requireServerEnv } from './_lib/supabase.js';

export const config = { runtime: 'edge' };

export default withErrorHandling(async (request) => {
  requireServerEnv();

  if (request.method !== 'POST') {
    return methodNotAllowed();
  }

  const body = await parseJsonBody(request);
  if (!body.phone_number || !body.message || !body.sender) {
    return badRequest('phone_number, message y sender son obligatorios.');
  }

  const result = await createMessageRecord({
    phoneNumber: body.phone_number,
    userName: body.user_name,
    message: body.message,
    sender: body.sender,
  });

  return json(result, 201);
});
