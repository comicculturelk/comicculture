import { imageSize } from 'image-size';

export interface CheckoutConfig {
  supabaseUrl: string;
  serviceKey: string;
  turnstileSecret: string;
  allowedOrigins: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECEIPT_LIMIT = 5 * 1024 * 1024;
const LIMITS = { receipt: 6, order: 10, track: 60, promo: 60 } as const;
type Action = keyof typeof LIMITS;

class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

// Bound the actual stream; Content-Length is optional and cannot be trusted.
async function readBody(request: Request, limit: number): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'Request body is missing.');
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new RequestError(413, 'The upload or request is too large.');
      parts.push(value);
    }
  } finally { await reader.cancel(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

export function receiptExtension(bytes: Uint8Array, contentType: string): string {
  const starts = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  const text = (start: number, end: number) => new TextDecoder().decode(bytes.slice(start, end));
  let extension: string | undefined;
  if (bytes.length < 12) throw new RequestError(400, 'Upload a valid JPG, PNG, or WebP receipt.');
  if (contentType === 'image/jpeg' && starts([255,216,255]) && bytes.at(-2) === 255 && bytes.at(-1) === 217) extension = 'jpg';
  if (contentType === 'image/png' && starts([137,80,78,71,13,10,26,10]) && text(12,16) === 'IHDR' && text(bytes.length-8,bytes.length-4) === 'IEND') extension = 'png';
  if (contentType === 'image/webp' && text(0,4) === 'RIFF' && text(8,12) === 'WEBP'
      && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4,true)+8 === bytes.length) extension = 'webp';
  if (!extension) throw new RequestError(400, 'Upload a valid JPG, PNG, or WebP receipt.');
  let dimensions;
  try { dimensions = imageSize(bytes); } catch { throw new RequestError(400,'The receipt image is invalid.'); }
  if (!dimensions.width || !dimensions.height || dimensions.width > 10000 || dimensions.height > 10000
      || dimensions.width * dimensions.height > 20000000) throw new RequestError(400,'The receipt image dimensions are too large.');
  return extension;
}

export function createCheckoutHandler(config: CheckoutConfig, fetcher: typeof fetch = fetch) {
  const restHeaders = { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json' };
  const rpc = async (name: string, body: unknown) => {
    const response = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: restHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new RequestError(response.status >= 500 ? 503 : 400, 'Unable to process this request. Check your details and try again.');
    return response.json();
  };
  // Only receipts created by this gateway, unclaimed for 14 days, are eligible.
  // Existing/historical customer receipts are deliberately outside this registry.
  const cleanAbandonedReceipts = async () => {
    const query = new URLSearchParams({ select:'path', order_id:'is.null', created_at:`lt.${new Date(Date.now()-14*86400000).toISOString()}`, limit:'10' });
    const response = await fetcher(`${config.supabaseUrl}/rest/v1/checkout_receipts?${query}`,{headers:restHeaders,signal:AbortSignal.timeout(10000)});
    if (!response.ok) return;
    const rows: {path:string}[] = await response.json();
    if (!rows.length) return;
    const removed = await fetcher(`${config.supabaseUrl}/storage/v1/object/payment-receipts`,{
      method:'DELETE',headers:restHeaders,body:JSON.stringify({prefixes:rows.map(row=>row.path)}),signal:AbortSignal.timeout(10000),
    });
    if (!removed.ok) return;
    for (const row of rows) {
      const filter = new URLSearchParams({path:`eq.${row.path}`,order_id:'is.null'});
      await fetcher(`${config.supabaseUrl}/rest/v1/checkout_receipts?${filter}`,{method:'DELETE',headers:restHeaders,signal:AbortSignal.timeout(10000)});
    }
  };
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin') ?? '';
    const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'no-store',
      'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, x-checkout-id, x-turnstile-token',
      'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
    if (!config.serviceKey || !config.turnstileSecret || !config.allowedOrigins.length) return reply({ error: 'Checkout is temporarily unavailable.' },503);
    if (!config.allowedOrigins.includes(origin)) return new Response('Forbidden', { status:403 });
    if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors });
    if (request.method !== 'POST') return reply({ error:'Method not allowed.' },405);
    try {
      const isReceipt = request.headers.has('x-checkout-id');
      const bytes = await readBody(request, isReceipt ? RECEIPT_LIMIT : 64 * 1024);
      let body;
      try { body = isReceipt ? null : JSON.parse(new TextDecoder().decode(bytes)); }
      catch { throw new RequestError(400,'Invalid request.'); }
      const action: Action = isReceipt ? 'receipt' : body?.action;
      if (!Object.hasOwn(LIMITS,action)) throw new RequestError(400,'Invalid request.');
      // The Supabase gateway supplies the forwarded client address. HMAC avoids storing raw IPs.
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
      const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(config.serviceKey),{name:'HMAC',hash:'SHA-256'},false,['sign']);
      const digest = new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(ip)));
      const hash = Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
      const permitted = await rpc('consume_checkout_attempt',{p_key:`${action}:${hash}`,p_limit:LIMITS[action]});
      if (!permitted) throw new RequestError(429,'Too many attempts. Please try again later.');

      if (action === 'track' || action === 'promo') {
        const input = body?.input;
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RequestError(400,'Invalid request.');
        if (action === 'track') {
          if (typeof input.orderReference !== 'string' || input.orderReference.length > 80
              || (input.email != null && (typeof input.email !== 'string' || input.email.length>254))
              || (input.phone != null && (typeof input.phone !== 'string' || input.phone.length>30))) throw new RequestError(400,'Invalid tracking details.');
          return reply(await rpc('get_order_tracking',{p_order_reference:input.orderReference,p_email:input.email||null,p_phone:input.phone||null}));
        }
        if (typeof input.code !== 'string' || input.code.length>80 || !Number.isFinite(input.subtotal)) throw new RequestError(400,'Invalid promotion.');
        return reply(await rpc('preview_promo_code',{p_code:input.code,p_subtotal:input.subtotal}));
      }

      const requestId = isReceipt ? request.headers.get('x-checkout-id') : body?.requestId;
      const token = isReceipt ? request.headers.get('x-turnstile-token') : body?.token;
      if (typeof requestId !== 'string' || !UUID.test(requestId)) throw new RequestError(400,'Invalid checkout session.');
      if (!config.turnstileSecret) throw new RequestError(503,'Checkout is temporarily unavailable.');
      if (typeof token !== 'string' || !token.length || token.length>2048) throw new RequestError(403,'Please complete the security check.');
      const verification = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
        method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, signal:AbortSignal.timeout(10000),
        body:new URLSearchParams({secret:config.turnstileSecret,response:token,...(ip === 'unknown' ? {} : {remoteip:ip})}),
      });
      if (!verification.ok) throw new RequestError(403,'Security check failed. Please try again.');
      const result = await verification.json();
      if (result.success !== true || result.action !== 'checkout' || result.hostname !== new URL(origin).hostname) throw new RequestError(403,'Security check failed. Please try again.');
      const globalPermitted = await rpc('consume_checkout_attempt',{p_key:`${action}:global`,p_limit:500});
      if (!globalPermitted) throw new RequestError(429,'Too many attempts. Please try again later.');

      if (action === 'order') return reply(await rpc('submit_checkout',{p_request_id:requestId,p_payload:body.input}));
      const extension = receiptExtension(bytes,request.headers.get('content-type')??'');
      const path = `${requestId}/${crypto.randomUUID()}.${extension}`;
      const upload = await fetcher(`${config.supabaseUrl}/storage/v1/object/payment-receipts/${path}`,{
        method:'POST',headers:{...restHeaders,'Content-Type':`image/${extension==='jpg'?'jpeg':extension}`,'Cache-Control':'private, max-age=0'},
        body:new Uint8Array(bytes).buffer,signal:AbortSignal.timeout(15000),
      });
      if (!upload.ok) throw new RequestError(503,'Could not upload the receipt. Please try again.');
      const register = await fetcher(`${config.supabaseUrl}/rest/v1/checkout_receipts`,{
        method:'POST',headers:restHeaders,body:JSON.stringify({path,request_id:requestId}),signal:AbortSignal.timeout(10000),
      });
      if (!register.ok) {
        await fetcher(`${config.supabaseUrl}/storage/v1/object/payment-receipts`,{method:'DELETE',headers:restHeaders,body:JSON.stringify({prefixes:[path]}),signal:AbortSignal.timeout(10000)});
        throw new RequestError(503,'Could not register the receipt. Please try again.');
      }
      // Retention maintenance must never turn a successful upload into an error.
      await cleanAbandonedReceipts().catch(() => undefined);
      return reply({path});
    } catch (error) {
      return error instanceof RequestError ? reply({error:error.message},error.status) : reply({error:'Unable to process the request. Please try again.'},503);
    }
  };
}
