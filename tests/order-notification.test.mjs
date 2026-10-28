import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../supabase/functions/send-order-notification/index.ts', import.meta.url), 'utf8')
  .replace(/import \{ createClient \} from '[^']+';/, 'const createClient = testCreateClient;');
const emitted = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const orderId = '00000000-0000-0000-0000-000000000001';
const token = '00000000-0000-0000-0000-000000000002';
const order = {
  id: orderId, order_reference: 'CC-TEST', full_name: '<script>alert(1)</script>',
  phone: '0000000000', email: 'customer@example.invalid', address_line1: '<unsafe>',
  address_line2: null, city: 'Test city', district: 'Test district', postal_code: null,
  payment_method: 'COD', payment_status: 'pending', subtotal: 1000, delivery_fee: 350,
  total: 1350, promo_code: null, discount_amount: 0, created_at: '2026-10-28T00:00:00Z',
  order_items: [{ name: '<shirt>', size: 'M', quantity: 1, price: 1000, is_preorder: false, preorder_days: null }],
};

function setup({ row = order, failRecipient, claim = 'lock', replyTo = 'support@example.invalid' } = {}) {
  const sent = [], completions = [], claims = [];
  let handler;
  const env = {
    RESEND_API_KEY: 'synthetic-test-key', RESEND_FROM_EMAIL: 'Store <orders@example.invalid>',
    ADMIN_NOTIFICATION_EMAIL: 'owner@example.invalid', RESEND_REPLY_TO_EMAIL: replyTo,
    SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key',
  };
  const db = {
    rpc: async (name, params) => {
      if (name === 'claim_order_notification') { claims.push(params); return { data: claim }; }
      if (name === 'complete_order_notification') { completions.push(params); return {}; }
      throw Error('Unexpected database call');
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
  };
  const context = vm.createContext({
    Request, Response, AbortSignal, console: { error() {}, log() {} },
    testCreateClient: () => db,
    Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } },
    fetch: async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      const body = JSON.parse(options.body);
      sent.push({ body, idempotencyKey: options.headers['Idempotency-Key'] });
      assert.ok(options.signal instanceof AbortSignal);
      return body.to.includes(failRecipient) ? new Response('test failure', { status: 503 }) : Response.json({ id: 'synthetic-message' });
    },
  });
  vm.runInContext(emitted, context);
  const request = (body = { orderId, notificationToken: token }) => new Request('https://example.invalid/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { handler, request, sent, completions, claims };
}

test('order notifications use saved recipients, configured sender and support reply address', async () => {
  const s = setup();
  const response = await s.handler(s.request({ orderId, notificationToken: token, email: 'attacker@example.invalid' }));
  assert.equal(response.status, 200);
  assert.equal(s.sent.length, 2);
  assert.deepEqual(s.sent[1].body.to, ['customer@example.invalid']);
  assert.equal(s.sent[1].body.from, 'Store <orders@example.invalid>');
  assert.equal(s.sent[1].body.reply_to, 'support@example.invalid');
  assert.equal(s.sent[0].body.reply_to, 'customer@example.invalid');
  assert.equal(s.sent[1].idempotencyKey, `order-${orderId}-customer`);
  assert.equal(s.completions[0].p_success, true);
  assert.match(s.sent[1].body.html, /&lt;shirt&gt;/);
  assert.doesNotMatch(s.sent[1].body.html, /<script>|<unsafe>/);
  assert.match(s.sent[1].body.html, /Pay in cash when it arrives/);
});

test('bank-transfer confirmation requests verification without claiming dispatch or collected cash', async () => {
  const s = setup({ row: { ...order, payment_method: 'BANK_TRANSFER', payment_status: 'awaiting_verification' } });
  await s.handler(s.request());
  assert.match(s.sent[1].body.subject, /Order Received/);
  assert.match(s.sent[1].body.html, /Payment verification required/);
  assert.match(s.sent[1].body.html, /review your bank-transfer receipt/);
  assert.doesNotMatch(s.sent[1].body.html, /already moving|being prepared for dispatch|Pay in cash/);
});

test('already verified bank payment and preorder snapshots are described accurately', async () => {
  const s = setup({ row: { ...order, payment_method: 'BANK_TRANSFER', payment_status: 'paid',
    order_items: [{ ...order.order_items[0], is_preorder: true, preorder_days: 14 }] } });
  await s.handler(s.request());
  assert.match(s.sent[1].body.subject, /Order Confirmed/);
  assert.match(s.sent[1].body.html, /payment has been verified/);
  assert.match(s.sent[1].body.html, /Delivery within 14 days/);
  assert.doesNotMatch(s.sent[1].body.html, /Payment verification required/);
});

test('partial send failures remain retryable with the same per-recipient idempotency keys', async () => {
  const s = setup({ failRecipient: 'owner@example.invalid', replyTo: '' });
  assert.equal((await s.handler(s.request())).status, 502);
  assert.equal(s.sent.length, 2);
  assert.equal(s.completions[0].p_success, false);
  assert.equal(s.sent[1].body.reply_to, 'owner@example.invalid');
  await s.handler(s.request());
  assert.equal(s.sent[0].idempotencyKey, s.sent[2].idempotencyKey);
  assert.equal(s.sent[1].idempotencyKey, s.sent[3].idempotencyKey);
});

test('invalid or replayed notification tokens never send mail', async () => {
  const invalid = setup();
  assert.equal((await invalid.handler(invalid.request({ orderId }))).status, 400);
  assert.equal(invalid.claims.length, 0);
  assert.equal(invalid.sent.length, 0);
  const replay = setup({ claim: null });
  assert.equal((await replay.handler(replay.request())).status, 409);
  assert.equal(replay.sent.length, 0);
});
