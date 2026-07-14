import { uploadMediaAsset } from './_lib/chat-service.js';
import { badRequest, json, methodNotAllowed, withErrorHandling } from './_lib/http.js';
import { requireServerEnv } from './_lib/supabase.js';

export const config = { runtime: 'edge' };

export default withErrorHandling(async (request) => {
  requireServerEnv();

  if (request.method !== 'POST') {
    return methodNotAllowed();
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const phoneNumber = formData.get('phone_number');
  const sender = formData.get('sender') || 'agent';

  if (!(file instanceof File) || !phoneNumber) {
    return badRequest('file y phone_number son obligatorios.');
  }

  const result = await uploadMediaAsset({
    file,
    phoneNumber,
    sender,
    bucket: 'chat-images',
    contentType: file.type || 'image/jpeg',
  });

  return json(result, 201);
});
