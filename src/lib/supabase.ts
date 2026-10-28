import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
  );
}

// Shopping is anonymous. Only the separate admin client may consume auth links
// or retain a signed-in session; otherwise it can steal an invite's URL fragment.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { detectSessionInUrl: false, persistSession: false, autoRefreshToken: false },
});
