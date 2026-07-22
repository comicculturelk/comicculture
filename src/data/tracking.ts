import { supabase } from '../lib/supabase';

export interface TrackedOrderItem {
  name: string;
  size: string;
  quantity: number;
  price: number;
}

export interface TrackedOrder {
  order_reference: string;
  status: string;
  created_at: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  items: TrackedOrderItem[];
}

export interface TrackOrderInput {
  orderReference: string;
  email?: string;
  phone?: string;
}

/**
 * Looks up a guest order by reference + email/phone via the
 * get_order_tracking RPC (SECURITY DEFINER). Returns null when there's no
 * exact match — orders/order_items stay locked down for anon; this is the
 * only read path, and only for the caller's own order.
 */
export async function trackOrder(input: TrackOrderInput): Promise<TrackedOrder | null> {
  const { data, error } = await supabase.rpc('get_order_tracking', {
    p_order_reference: input.orderReference.trim(),
    p_email: input.email?.trim() || null,
    p_phone: input.phone?.trim() || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data as TrackedOrder | null) ?? null;
}
