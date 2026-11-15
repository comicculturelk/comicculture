export const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

interface ResendSendParams {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendViaResend(
  params: ResendSendParams,
  apiKey: string,
  from: string,
  idempotencyKey: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; providerId?: string } | { ok: false; error: string; retryable: boolean }> {
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ from, to: params.to, reply_to: params.replyTo || undefined, subject: params.subject, html: params.html, text: params.text }),
    });
    if (response.ok) {
      const data = await response.json().catch(() => null);
      return { ok: true, providerId: typeof data?.id === 'string' ? data.id : undefined };
    }
    return {
      ok: false, error: 'Resend HTTP ' + response.status,
      retryable: [408, 409, 429].includes(response.status) || response.status >= 500,
    };
  } catch {
    return { ok: false, error: 'Could not reach Resend', retryable: true };
  }
}
