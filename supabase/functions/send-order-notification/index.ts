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
    const html = buildEmailHtml(typedOrder);

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: adminEmails,
        reply_to: typedOrder.email || undefined,
        subject: `New Order ${typedOrder.order_reference} — ${formatMoney(typedOrder.total)}`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend API error:', resendRes.status, errText);
      return jsonResponse({ error: 'Failed to send email' }, 502);
    }

    return jsonResponse({ success: true }, 200);
  } catch (err) {
    console.error('Unexpected error in send-order-notification:', err);
    return jsonResponse({ error: 'Unexpected error' }, 500);
  }
});
