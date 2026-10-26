import { checkoutRequest } from '../lib/checkout';

export interface TrackedOrderItem {
  name: string;
  size: string;
  quantity: number;
  price: number;
  is_preorder: boolean;
  preorder_days: number | null;
}

export interface TrackedOrder {
  order_reference: string;
  status: string;
  created_at: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  courier_name: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  items: TrackedOrderItem[];
}

export interface TrackOrderInput {
  orderReference: string;
  email?: string;
  phone?: string;
}

/**
 * The rate-limited gateway delegates exact reference + contact matching to
 * get_order_tracking. Direct anonymous table/RPC access remains closed.
 */
export async function trackOrder(input: TrackOrderInput): Promise<TrackedOrder | null> {
  return checkoutRequest<TrackedOrder | null>('track', {
    orderReference: input.orderReference.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
  });
}
