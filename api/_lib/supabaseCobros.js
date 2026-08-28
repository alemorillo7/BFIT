import { createClient } from '@supabase/supabase-js';

const env = globalThis.process?.env ?? {};
const url = env.SUPABASE_COBROS_URL || 'https://bwtqyyhsucqmijimuzlc.supabase.co';
const serviceRoleKey = env.SUPABASE_COBROS_SERVICE_ROLE_KEY;

export const supabaseCobrosAdmin = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
});
