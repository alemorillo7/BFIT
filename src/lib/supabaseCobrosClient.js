import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_COBROS_URL || 'https://bwtqyyhsucqmijimuzlc.supabase.co';
const anonKey = import.meta.env.VITE_SUPABASE_COBROS_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3dHF5eWhzdWNxbWlqaW11emxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDA0MTMsImV4cCI6MjEwMzUxNjQxM30.hbrm6boUabXaj6bj0Plm7QKR00AijncaYr7NYBE77tc';

export const supabaseCobros = createClient(url, anonKey, {
  auth: {
    persistSession: false,
  },
});
