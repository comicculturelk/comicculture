import { escapeHtml, sendViaResend } from '../_shared/resend.ts';

interface Job {
  id: string;
  lease: string;
  payload: {
    email: string;
    reference: string;
    status: 'confirmed' | 'packed' | 'shipped' | 'delivered' | 'cancelled';
    paymentMethod: string;
    paymentStatus: string;
    courier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
  };
}

interface Config {
  supabaseUrl: string;
  serviceKey: string;
  workerSecret: string;
  resendApiKey: string;
  fromEmail: string;
  replyTo: string;
  verificationRecipient?: string;
}

const titles: Record<Job['payload']['status'], string> = {
  confirmed: 'Order confirmed', packed: 'Order packed', shipped: 'Order shipped',
  delivered: 'Order delivered', cancelled: 'Order cancelled',
};

function trackingLink(value: string | null) {
  if (!value || !/^https:\/\//i.test(value) || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    const publicHost = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname);
    return url.protocol === 'https:' && publicHost && !url.port && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function optionalTrackingText(value: string | null) {
  const text = value?.trim();
  return text && !/^(?:[-–—]+|n\/?a|none|null|unknown|pending|tbd|not (?:available|provided|applicable))$/i.test(text)
    ? text
    : null;
}

export function buildStatusEmail(order: Job['payload'], replyTo: string) {
  const title = titles[order.status];
  const body = {
    confirmed: order.paymentMethod === 'BANK_TRANSFER' && order.paymentStatus === 'paid'
      ? 'We verified your bank transfer and confirmed your order.' : 'We confirmed your order.',
    packed: 'Your order is packed and ready for the courier.',
    shipped: 'Your order is on its way.',
    delivered: 'Your order was marked delivered. Reply to this email if you need help.',
    cancelled: order.paymentStatus === 'refunded'
      ? 'Your order was cancelled and the store recorded a completed refund.'
      : order.paymentMethod === 'COD' && order.paymentStatus === 'pending'
        ? 'Your order was cancelled. No cash-on-delivery payment was collected.'
        : 'Your order was cancelled. If you already transferred money, reply so we can check your payment.',
  }[order.status];
  const courier = optionalTrackingText(order.courier);
  const trackingNumber = optionalTrackingText(order.trackingNumber);
  const details = order.status === 'shipped' ? [
    courier ? ['Courier', courier] : null,
    trackingNumber ? ['Tracking number', trackingNumber] : null,
  ].filter((entry) => entry !== null) : [];
  const url = order.status === 'shipped' ? trackingLink(order.trackingUrl) : null;
  const storeTracking = 'https://comicculture.lk/track-order';
  const reference = order.reference.replace(/[\r\n]/g, '');
  return {
    to: [order.email], replyTo,
    subject: title + ' · ' + reference,
    text: ['ComicCulture', title, 'Order ' + reference, body, ...details.map(([key, value]) => key + ': ' + value),
      ...(url ? ['Courier tracking: ' + url] : []), 'Check your order: ' + storeTracking].join('\n\n'),
    html: '<!doctype html><html lang="en"><body style="margin:0;background:#f8f8f6;color:#222;font:16px Arial,sans-serif">' +
      '<table role="presentation" width="100%"><tr><td align="center" style="padding:24px"><table role="presentation" width="100%" style="max-width:560px;background:white">' +
      '<tr><td style="padding:24px;background:#8c1f2e;color:white"><strong>ComicCulture</strong><h1>' + title +
      '</h1>Order ' + escapeHtml(reference) + '</td></tr><tr><td style="padding:24px"><p>' + body + '</p>' +
      details.map(([key, value]) => '<p><strong>' + key + '</strong> ' + escapeHtml(value) + '</p>').join('') +
      (url ? '<p><a href="' + escapeHtml(url) + '">Open courier tracking</a></p>' : '') +
      '<p><a href="' + storeTracking + '">Check your order on ComicCulture</a></p></td></tr></table></td></tr></table></body></html>',
  };
}

async function sameSecret(expected: string, received: string): Promise<boolean> {
  if (!received || received.length > 256) return false;
  const hash = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([hash(expected), hash(received)]);
  return a.reduce((difference, byte, index) => difference | (byte ^ b[index]), 0) === 0;
}

export function createOrderStatusWorker(config: Config, fetcher: typeof fetch = fetch) {
  const rpc = async (name: string, input: object = {}) => {
    const response = await fetcher(config.supabaseUrl + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: { apikey: config.serviceKey, Authorization: 'Bearer ' + config.serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(input), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Worker database operation failed');
    return response.status === 204 ? null : response.json();
  };
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    if (config.workerSecret.length < 32 || !config.serviceKey || !config.supabaseUrl || !config.resendApiKey || !config.fromEmail || !config.replyTo) {
      return new Response(null, { status: 503 });
    }
    if (!await sameSecret(config.workerSecret, request.headers.get('x-worker-secret') ?? '')) return new Response(null, { status: 403 });
    let processed = 0;
    const deadline = Date.now() + 25000;
    try {
      const operation = request.headers.get('x-worker-operation') ?? 'dispatch';
      if (operation === 'check' || operation === 'verify-resend') {
        // The zero lease cannot match a worker claim. Verification must not
        // claim an outbox row or use an address supplied in the request.
        const missing = '00000000-0000-0000-0000-000000000000';
        if (await rpc('check_order_status_email_claim', { p_id: missing, p_lease: missing }) !== false) {
          return Response.json({ operational: false }, { status: 503 });
        }
        if (operation === 'check') return Response.json({ operational: true });
        const recipient = config.verificationRecipient?.trim();
        if (!recipient || recipient.length > 254 || !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(recipient)) return new Response(null, { status: 403 });
        const subject = 'ComicCulture order-status worker verification';
        const text = 'This is a controlled verification message. It is not an order or a customer notification.';
        const outcome = await sendViaResend({ to: [recipient], replyTo: config.replyTo, subject, text, html: '<p>' + text + '</p>' },
          config.resendApiKey, config.fromEmail, 'order-status-worker-verification-v1', fetcher);
        return outcome.ok ? Response.json({ accepted: true, providerId: outcome.providerId })
          : Response.json({ accepted: false, error: outcome.error }, { status: 502 });
      }
      if (operation !== 'dispatch') return new Response(null, { status: 400 });
      for (let i = 0; i < 10 && Date.now() < deadline; i++) {
        const job: Job | { skipped: true } | null = await rpc('claim_order_status_email');
        if (!job) break;
        if ('skipped' in job) continue;
        const claim = { p_id: job.id, p_lease: job.lease };
        if (await rpc('check_order_status_email_claim', claim) !== true) continue;
        const outcome = await sendViaResend(buildStatusEmail(job.payload, config.replyTo),
          config.resendApiKey, config.fromEmail, 'order-status-' + job.id, fetcher);
        await rpc('finish_order_status_email', { ...claim, p_outcome: outcome.ok ? 'sent' : outcome.retryable ? 'temporary' : 'permanent' });
        processed++;
      }
      return Response.json({ processed });
    } catch {
      // The lease allows recovery even if the provider accepted the last request.
      return Response.json({ processed, error: 'Worker operation failed' }, { status: 503 });
    }
  };
}
