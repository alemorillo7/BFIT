export const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const badRequest = (message) => json({ error: message }, 400);

export const methodNotAllowed = () => json({ error: 'Método no permitido.' }, 405);

export const parseJsonBody = async (request) => {
  try {
    return await request.json();
  } catch {
    throw new Error('El body debe ser JSON válido.');
  }
};

export const withErrorHandling = (handler) => async (request) => {
  try {
    return await handler(request);
  } catch (error) {
    console.error(error);
    return json({ error: error.message || 'Ocurrió un error inesperado.' }, 500);
  }
};
