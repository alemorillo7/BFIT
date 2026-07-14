import { createClient } from '@supabase/supabase-js';

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para las funciones API.');
}

export const supabaseAdmin = createClient(supabaseUrl || 'https://invalid.local', serviceRoleKey || 'invalid-service-role-key', {
  auth: {
    persistSession: false,
  },
});

export const requireServerEnv = () => {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para usar la API.');
  }
};
