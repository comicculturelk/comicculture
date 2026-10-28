import { createInviteHandler } from "./handler.ts";
Deno.serve(
  createInviteHandler({
    url: Deno.env.get("SUPABASE_URL") ?? "",
    anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    origin: Deno.env.get("ADMIN_ORIGIN") ?? "",
  }),
);
