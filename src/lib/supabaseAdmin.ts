import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
  );
}

/**
 * Admin-only Supabase client.
 *
 * Same project URL and anon key as the public storefront client
 * (src/lib/supabase.ts) — the anon key by itself grants no special access,
 * so there's no privilege escalation here. The important difference is
 * `auth.storageKey`: giving this client its own localStorage namespace
 * means an admin's signed-in session is stored completely separately from
 * the public client's session storage.
 *
 * Why this matters: the Supabase JS client auto-attaches whatever session
 * it holds to every request it makes, including RPC calls. Before this
 * split, the storefront and admin panel shared one client/session, so a
 * customer checkout placed in a browser where an admin was also logged in
 * would run `create_order()` as `authenticated` instead of `anon` — and
 * `authenticated` intentionally has no EXECUTE grant on that function,
 * causing checkout to fail with "permission denied for function
 * create_order". Isolating the admin session here means the public
 * `supabase` client never sees an admin JWT, so storefront requests always
 * run as `anon` regardless of whether an admin is logged in elsewhere in
 * the same browser.
 *
 * Only import this in admin-only code (src/pages/Admin.tsx and admin data
 * operations in src/data/*.ts). Customer-facing code should keep using the
 * public `supabase` client from src/lib/supabase.ts.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'comicculture-admin-auth',
  },
});
