import { createClient } from '@supabase/supabase-js';

const env = globalThis.process?.env ?? {};
const url = env.SUPABASE_COBROS_URL || 'https://bwtqyyhsucqmijimuzlc.supabase.co';
const serviceRoleKey = env.SUPABASE_COBROS_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  throw new Error('La variable de entorno SUPABASE_COBROS_SERVICE_ROLE_KEY no está configurada.');
}

export const supabaseCobrosAdmin = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
});
