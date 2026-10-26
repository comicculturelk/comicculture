import { createCheckoutHandler } from './handler.ts';

Deno.serve(createCheckoutHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  turnstileSecret: Deno.env.get('TURNSTILE_SECRET') ?? '',
  allowedOrigins: (Deno.env.get('CHECKOUT_ORIGINS') ?? '').split(',').map(value=>value.trim()).filter(Boolean),
}));
