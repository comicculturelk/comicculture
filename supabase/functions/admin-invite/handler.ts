interface InviteConfig {
  url: string;
  anonKey: string;
  serviceKey: string;
  origin: string;
}
// Pure request handler: tests inject fetch and never send real invitation email.
export function createInviteHandler(
  config: InviteConfig,
  fetcher: typeof fetch = fetch,
) {
  return async (request: Request): Promise<Response> => {
    const headers = {
      "Access-Control-Allow-Origin": config.origin,
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    };
    const reply = (status: number, error?: string) =>
      new Response(JSON.stringify(error ? { error } : { sent: true }), {
        status,
        headers,
      });
    if (request.headers.get("Origin") !== config.origin)
      return reply(403, "Access denied");
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply(405, "Method not allowed");
    if (!config.url || !config.anonKey || !config.serviceKey || !config.origin)
      return reply(503, "Invitation service unavailable");
    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer "))
      return reply(401, "Sign in again");
    const userHeaders = {
      Authorization: authorization,
      apikey: config.anonKey,
      "Content-Type": "application/json",
    };
    try {
      // Validate the actual token with Auth; never trust a client-decoded role/aal.
      const user = await fetcher(config.url + "/auth/v1/user", {
        headers: userHeaders,
      });
      if (!user.ok) return reply(401, "Sign in again");
      const owner = await fetcher(config.url + "/rest/v1/rpc/is_store_owner", {
        method: "POST",
        headers: userHeaders,
        body: "{}",
      });
      if (!owner.ok || (await owner.json()) !== true)
        return reply(403, "Verified owner access required");
      // Bounded streamed input, regardless of Content-Length.
      const reader = request.body?.getReader();
      let text = "";
      let bytes = 0;
      const decoder = new TextDecoder();
      if (!reader) return reply(400, "Invalid invitation");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2048) {
          await reader.cancel();
          return reply(413, "Invalid invitation");
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      const input = JSON.parse(text);
      const email =
        typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 254 ||
        !["admin", "staff"].includes(input.role)
      )
        return reply(400, "Invalid invitation");
      // This RPC rechecks live owner membership + aal2 and rate limits atomically.
      const prepared = await fetcher(
        config.url + "/rest/v1/rpc/admin_prepare_invitation",
        {
          method: "POST",
          headers: userHeaders,
          body: JSON.stringify({ p_email: email, p_role: input.role }),
        },
      );
      if (!prepared.ok)
        return reply(
          400,
          "Could not prepare invitation. Check existing members or wait before retrying.",
        );
      const invited = await fetcher(
        config.url +
          "/auth/v1/invite?redirect_to=" +
          encodeURIComponent(config.origin + "/admin?auth=invite"),
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + config.serviceKey,
            apikey: config.serviceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email }),
        },
      );
      if (!invited.ok)
        return reply(
          400,
          "Invitation was not sent. Check email delivery or grant access to an existing verified account. Cancel the pending invitation if no longer needed.",
        );
      return reply(200);
    } catch {
      return reply(503, "Could not send invitation. Please retry.");
    }
  };
}
