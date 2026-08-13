const parseResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || 'No se pudo completar la operación.');
  }

  return payload;
};

const jsonRequest = async (url, options = {}) =>
  parseResponse(
    await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    }),
  );

export const sendAgentMessage = (body) =>
  jsonRequest('/api/send-message', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const toggleConversationBot = (body) =>
  jsonRequest('/api/toggle-bot', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const toggleConversationBotsBulk = (body) =>
  jsonRequest('/api/toggle-bot-bulk', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const assignConversationTags = (body) =>
  jsonRequest('/api/assign-tags', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const removeConversationTags = (body) =>
  jsonRequest('/api/remove-tags', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const deleteConversation = (body) =>
  jsonRequest('/api/delete-chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const saveContact = (body) =>
  jsonRequest('/api/contacts', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const deleteContact = (phoneNumber) =>
  jsonRequest(`/api/contacts?phone_number=${encodeURIComponent(phoneNumber)}`, {
    method: 'DELETE',
  });

export const uploadConversationFile = async ({ endpoint, phoneNumber, file, sender = 'agent' }) => {
  const formData = new FormData();
  formData.append('phone_number', phoneNumber);
  formData.append('file', file);
  formData.append('sender', sender);

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  return parseResponse(response);
};
