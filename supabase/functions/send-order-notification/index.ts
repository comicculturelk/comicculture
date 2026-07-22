// Supabase Edge Function: send-order-notification
//
// Called by the storefront immediately after an order + its items are
// saved. Only an `orderId` is passed in — the function looks the order up
// itself using the service-role key (auto-provided to every Edge Function
// by Supabase, never exposed to the browser) and builds the email from
// that authoritative row. This means:
//   1. The client never has to duplicate order details into a second
//      payload — the database row is the single source of truth.
//   2. A customer can't spoof or tamper with what the admin sees, since
//      arbitrary client-supplied order data is never trusted or rendered.
//   3. If the order isn't in the database yet (or doesn't exist), we
//      simply decline — nothing is sent.
//
// Required secrets (set via `supabase secrets set`, NOT the Vite .env
// files — these must never reach the browser bundle):
//   RESEND_API_KEY          - Resend API key
//   RESEND_FROM_EMAIL       - verified sender, e.g. "ComicCulture <orders@yourdomain.com>"
//   ADMIN_NOTIFICATION_EMAIL - comma-separated recipient list

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrderItemRow {
  name: string;
  size: string;
  quantity: number;
  price: number;
}

interface OrderRow {
  id: string;
  order_reference: string;
  full_name: string;
  phone: string;
  email: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  district: string;
  postal_code: string | null;
  payment_method: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  created_at: string;
  order_items: OrderItemRow[];
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-LK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Colombo',
  });
}

function formatMoney(amount: number): string {
  return `Rs. ${Number(amount).toLocaleString('en-LK')}`;
}

interface ResendSendParams {
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * Sends one email via Resend. Never throws — callers get back a result
 * object so a failure on one email (e.g. the customer confirmation) can
 * never block or affect the other (e.g. the admin notification).
 */
async function sendViaResend(
  params: ResendSendParams,
  resendApiKey: string,
  fromEmail: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: params.to,
        reply_to: params.replyTo || undefined,
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Resend API error ${res.status}: ${errText}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Table-based layout with inline styles throughout — required for
// consistent rendering across email clients (especially Outlook), which
// don't reliably support flexbox/grid or external/`<style>` CSS. Colors
// are hardcoded to match the ComicCulture theme tokens (--color-primary
// #8C1F2E, --color-foreground #111111, etc.) since email HTML can't read
// CSS variables from the site.
function buildEmailHtml(order: OrderRow): string {
  const primary = '#8C1F2E';
  const foreground = '#111111';
  const muted = '#666666';
  const border = '#E5E5E5';
  const surface = '#F8F8F6';

  const itemsRows = order.order_items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${border};color:${foreground};font-size:14px;">
            ${escapeHtml(item.name)}<br/>
            <span style="color:${muted};font-size:12px;">Size ${escapeHtml(item.size)} &middot; Qty ${item.quantity}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid ${border};color:${foreground};font-size:14px;text-align:right;white-space:nowrap;">
            ${formatMoney(item.price * item.quantity)}
          </td>
        </tr>`
    )
    .join('');

  const addressLine2 = order.address_line2 ? `${escapeHtml(order.address_line2)}<br/>` : '';
  const postalCode = order.postal_code ? ` ${escapeHtml(order.postal_code)}` : '';
  const paymentRow = order.payment_method
    ? `<tr>
         <td style="padding:4px 0;color:${muted};font-size:13px;">Payment Method</td>
         <td style="padding:4px 0;color:${foreground};font-size:13px;text-align:right;">${escapeHtml(order.payment_method)}</td>
       </tr>`
    : '';

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:${surface};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${surface};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:92%;background-color:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid ${border};">
            <tr>
              <td style="background-color:${primary};padding:24px 32px;">
                <p style="margin:0;color:#FFFFFF;font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;">ComicCulture</p>
                <h1 style="margin:6px 0 0;color:#FFFFFF;font-size:20px;letter-spacing:0.5px;">New Order Received</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:${muted};font-size:12px;text-transform:uppercase;letter-spacing:1px;">Order Number</td>
                    <td style="color:${muted};font-size:12px;text-transform:uppercase;letter-spacing:1px;text-align:right;">Date &amp; Time</td>
                  </tr>
                  <tr>
                    <td style="color:${foreground};font-size:16px;font-weight:600;padding-top:2px;">${escapeHtml(order.order_reference)}</td>
                    <td style="color:${foreground};font-size:14px;padding-top:2px;text-align:right;">${formatDate(order.created_at)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${surface};border-radius:12px;padding:16px;">
                  <tr>
                    <td style="padding:4px 0;color:${muted};font-size:13px;">Customer</td>
                    <td style="padding:4px 0;color:${foreground};font-size:13px;text-align:right;font-weight:600;">${escapeHtml(order.full_name)}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;color:${muted};font-size:13px;">Phone</td>
                    <td style="padding:4px 0;color:${foreground};font-size:13px;text-align:right;">${escapeHtml(order.phone)}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;color:${muted};font-size:13px;vertical-align:top;">Delivery Address</td>
                    <td style="padding:4px 0;color:${foreground};font-size:13px;text-align:right;">
                      ${escapeHtml(order.address_line1)}<br/>
                      ${addressLine2}
                      ${escapeHtml(order.city)}, ${escapeHtml(order.district)}${postalCode}
                    </td>
                  </tr>
                  ${paymentRow}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0;">
                <p style="margin:0 0 8px;color:${muted};font-size:12px;text-transform:uppercase;letter-spacing:1px;">Items</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${itemsRows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
                  <tr>
                    <td style="padding:3px 0;color:${muted};font-size:13px;">Subtotal</td>
                    <td style="padding:3px 0;color:${foreground};font-size:13px;text-align:right;">${formatMoney(order.subtotal)}</td>
                  </tr>
                  <tr>
                    <td style="padding:3px 0;color:${muted};font-size:13px;">Delivery Fee</td>
                    <td style="padding:3px 0;color:${foreground};font-size:13px;text-align:right;">${formatMoney(order.delivery_fee)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0 0;color:${foreground};font-size:15px;font-weight:700;border-top:1px solid ${border};">Total</td>
                    <td style="padding:10px 0 0;color:${primary};font-size:18px;font-weight:700;text-align:right;border-top:1px solid ${border};">${formatMoney(order.total)}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;color:${muted};font-size:11px;">This is an automated notification from your ComicCulture storefront.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Customer-facing order confirmation. Deliberately styled differently from
// the internal admin notification above: this one is the brand's voice —
// a premium streetwear / comic-collector "first issue" feel — rather than
// a plain internal alert. Colors are the same ComicCulture theme tokens for
// consistency, but the layout, copy, and hierarchy are built for the
// customer reading it, not for an admin scanning it.
function buildCustomerConfirmationHtml(order: OrderRow): string {
  const primary = '#8C1F2E';
  const foreground = '#111111';
  const muted = '#666666';
  const mutedForeground = '#8C8C8C';
  const border = '#E5E5E5';
  const surface = '#F8F8F6';

  // Falls back to the production domain if SITE_URL isn't set as a secret
  // yet, so this never breaks a deploy that hasn't added it.
  const siteUrl = (Deno.env.get('SITE_URL') || 'https://comicculture.lk').replace(/\/$/, '');
  const trackOrderUrl = `${siteUrl}/track-order`;

  const itemsRows = order.order_items
    .map(
      (item) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid ${border};color:${foreground};font-size:14px;font-weight:600;">
            ${escapeHtml(item.name)}
            <div style="margin-top:2px;color:${muted};font-size:12px;font-weight:400;text-transform:uppercase;letter-spacing:0.5px;">
              Size ${escapeHtml(item.size)} &middot; Qty ${item.quantity}
            </div>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid ${border};color:${foreground};font-size:14px;text-align:right;white-space:nowrap;vertical-align:top;">
            ${formatMoney(item.price * item.quantity)}
          </td>
        </tr>`
    )
    .join('');

  const addressLine2 = order.address_line2 ? `${escapeHtml(order.address_line2)}<br/>` : '';
  const postalCode = order.postal_code ? ` ${escapeHtml(order.postal_code)}` : '';
  const firstName = escapeHtml(order.full_name.trim().split(/\s+/)[0] || order.full_name);

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:${surface};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${surface};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:92%;background-color:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid ${border};">
            <tr>
              <td style="background-color:${primary};padding:36px 32px;text-align:center;">
                <p style="margin:0;color:#FFFFFF;font-size:12px;letter-spacing:4px;text-transform:uppercase;opacity:0.85;">ComicCulture</p>
                <h1 style="margin:10px 0 0;color:#FFFFFF;font-size:24px;letter-spacing:0.5px;">Order Confirmed</h1>
                <p style="margin:6px 0 0;color:#FFFFFF;font-size:13px;opacity:0.85;">Issue No. ${escapeHtml(order.order_reference)} is officially yours.</p>
              </td>
            </tr>

            <tr>
              <td style="padding:32px 32px 0;">
                <p style="margin:0;color:${foreground};font-size:15px;line-height:1.6;">Hi ${firstName},</p>
                <p style="margin:10px 0 0;color:${muted};font-size:14px;line-height:1.6;">
                  Thanks for adding to the collection. Your order is confirmed and already moving through
                  our hands for prep — every piece is checked before it ships, so give us a little time to
                  get it right.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed ${border};border-radius:12px;">
                  <tr>
                    <td style="padding:18px 20px;text-align:center;">
                      <p style="margin:0;color:${mutedForeground};font-size:10px;letter-spacing:3px;text-transform:uppercase;">Issue No.</p>
                      <p style="margin:4px 0 0;color:${foreground};font-size:20px;font-weight:700;letter-spacing:1px;font-family:'Courier New',Courier,monospace;">${escapeHtml(order.order_reference)}</p>
                      <p style="margin:6px 0 0;color:${mutedForeground};font-size:12px;">Confirmed ${formatDate(order.created_at)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 32px 0;">
                <p style="margin:0 0 8px;color:${muted};font-size:12px;text-transform:uppercase;letter-spacing:1px;">Your Pieces</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${itemsRows}
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:3px 0;color:${muted};font-size:13px;">Subtotal</td>
                    <td style="padding:3px 0;color:${foreground};font-size:13px;text-align:right;">${formatMoney(order.subtotal)}</td>
                  </tr>
                  <tr>
                    <td style="padding:3px 0;color:${muted};font-size:13px;">Delivery Fee</td>
                    <td style="padding:3px 0;color:${foreground};font-size:13px;text-align:right;">${formatMoney(order.delivery_fee)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0 0;color:${foreground};font-size:15px;font-weight:700;border-top:1px solid ${border};">Total</td>
                    <td style="padding:10px 0 0;color:${primary};font-size:18px;font-weight:700;text-align:right;border-top:1px solid ${border};">${formatMoney(order.total)}</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:12px;">
                  <tr>
                    <td style="padding:20px;text-align:center;">
                      <p style="margin:0 0 4px;color:${foreground};font-size:14px;font-weight:700;">Track Your Order</p>
                      <p style="margin:0 0 14px;color:${muted};font-size:13px;line-height:1.6;">
                        Your order has been received. You can check your order status anytime using
                        your Order Reference.
                      </p>
                      <a href="${trackOrderUrl}" style="display:inline-block;background-color:${primary};color:#FFFFFF;font-size:13px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;">
                        Track Order
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${surface};border-radius:12px;">
                  <tr>
                    <td style="padding:16px 20px;">
                      <p style="margin:0 0 4px;color:${foreground};font-size:13px;font-weight:600;">Shipping To</p>
                      <p style="margin:0;color:${muted};font-size:13px;line-height:1.6;">
                        ${escapeHtml(order.full_name)}<br/>
                        ${escapeHtml(order.address_line1)}<br/>
                        ${addressLine2}
                        ${escapeHtml(order.city)}, ${escapeHtml(order.district)}${postalCode}<br/>
                        ${escapeHtml(order.phone)}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:12px;">
                  <tr>
                    <td style="padding:16px 20px;">
                      <p style="margin:0 0 4px;color:${foreground};font-size:13px;font-weight:600;">Shipping &amp; Fulfillment</p>
                      <p style="margin:0;color:${muted};font-size:13px;line-height:1.6;">
                        Your order is being prepared for dispatch. We'll follow up with tracking details
                        as soon as it's on its way to you.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:28px 32px 36px;text-align:center;">
                <p style="margin:0;color:${foreground};font-size:14px;font-weight:600;">Welcome to the collection.</p>
                <p style="margin:6px 0 0;color:${muted};font-size:12px;line-height:1.6;">
                  Questions about your order? Reach out on Instagram
                  <a href="https://instagram.com/comicculture.lk" style="color:${primary};text-decoration:none;font-weight:600;">@comicculture.lk</a>
                  and we'll help you out.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;color:${muted};font-size:11px;">You're receiving this because you placed an order with ComicCulture.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { orderId } = await req.json().catch(() => ({}));

    if (!orderId || typeof orderId !== 'string') {
      return jsonResponse({ error: 'orderId is required' }, 400);
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');
    const adminEmailsRaw = Deno.env.get('ADMIN_NOTIFICATION_EMAIL');

    if (!resendApiKey || !fromEmail || !adminEmailsRaw) {
      console.error('Missing RESEND_API_KEY, RESEND_FROM_EMAIL, or ADMIN_NOTIFICATION_EMAIL secret');
      return jsonResponse({ error: 'Email service not configured' }, 500);
    }

    const adminEmails = adminEmailsRaw
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);

    if (adminEmails.length === 0) {
      console.error('ADMIN_NOTIFICATION_EMAIL is set but contains no valid addresses');
      return jsonResponse({ error: 'Email service not configured' }, 500);
    }

    // Service-role client: bypasses RLS so we can read the order the
    // storefront just wrote (anon only has write/insert access to orders).
    // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-provided to every
    // Edge Function by the platform — no manual secret needed for these two.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: order, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      console.error('Failed to load order:', error.message);
      return jsonResponse({ error: 'Failed to load order' }, 500);
    }

    if (!order) {
      return jsonResponse({ error: 'Order not found' }, 404);
    }

    const typedOrder = order as OrderRow;

    // 1. Admin notification — unchanged from the existing working version:
    // same recipients, same subject, same reply-to, same status contract
    // (a failed admin send returns 502, as before).
    const adminResult = await sendViaResend(
      {
        to: adminEmails,
        subject: `New Order ${typedOrder.order_reference} — ${formatMoney(typedOrder.total)}`,
        html: buildEmailHtml(typedOrder),
        replyTo: typedOrder.email || undefined,
      },
      resendApiKey,
      fromEmail
    );

    if (!adminResult.ok) {
      console.error('Failed to send admin notification email:', adminResult.error);
    }

    // 2. Customer confirmation — only if they gave us an email. This is
    // fully independent of the admin send above: neither one's outcome
    // affects whether the other is attempted or how it's reported.
    let customerAttempted = false;
    let customerSent = false;

    if (typedOrder.email) {
      customerAttempted = true;
      const customerResult = await sendViaResend(
        {
          to: [typedOrder.email],
          subject: `ComicCulture Order Confirmed — ${typedOrder.order_reference}`,
          html: buildCustomerConfirmationHtml(typedOrder),
          replyTo: adminEmails[0],
        },
        resendApiKey,
        fromEmail
      );
      customerSent = customerResult.ok;
      if (!customerResult.ok) {
        console.error('Failed to send customer confirmation email:', customerResult.error);
      }
    } else {
      console.log(
        `Order ${typedOrder.order_reference} has no customer email on file — skipping confirmation email.`
      );
    }

    return jsonResponse(
      {
        success: adminResult.ok,
        admin: { sent: adminResult.ok },
        customer: { attempted: customerAttempted, sent: customerSent },
      },
      adminResult.ok ? 200 : 502
    );
  } catch (err) {
    console.error('Unexpected error in send-order-notification:', err);
    return jsonResponse({ error: 'Unexpected error' }, 500);
  }
});
