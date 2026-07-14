import { deleteContactByPhone, listContacts, upsertContact } from './_lib/chat-service.js';
import { badRequest, json, methodNotAllowed, parseJsonBody, withErrorHandling } from './_lib/http.js';
import { requireServerEnv } from './_lib/supabase.js';

export const config = { runtime: 'edge' };

export default withErrorHandling(async (request) => {
  requireServerEnv();

  if (request.method === 'GET') {
    const contacts = await listContacts();
    return json({ data: contacts });
  }

  if (request.method === 'POST') {
    const body = await parseJsonBody(request);
    if (!body.phone_number) {
      return badRequest('phone_number es obligatorio.');
    }

    const contact = await upsertContact(body);
    return json(contact, 201);
  }

  if (request.method === 'DELETE') {
    const phoneNumber = new URL(request.url).searchParams.get('phone_number');
    if (!phoneNumber) {
      return badRequest('phone_number es obligatorio.');
    }

    const result = await deleteContactByPhone(phoneNumber);
    return json(result);
  }

  return methodNotAllowed();
});
