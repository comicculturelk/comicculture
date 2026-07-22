import { supabase } from '../lib/supabase';

/**
 * Notifies ComicCulture admins by email that a new order has been placed.
 *
 * Only the order id is sent — the Edge Function looks the order up itself
 * (server-side, service-role) so order details are never duplicated or
 * re-typed on the client. This call is fire-and-forget by design: the
 * order has already been saved successfully by the time this runs, so an
 * email failure here must never fail or delay the checkout flow. Errors
 * are logged, not thrown.
 */
export async function notifyAdminOfNewOrder(orderId: string): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-order-notification', {
      body: { orderId },
    });
    if (error) {
      console.error('Order notification email failed:', error.message);
    }
  } catch (err) {
    console.error('Order notification email failed:', err);
  }
}
