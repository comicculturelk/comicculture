import { supabase } from '../lib/supabase';
import type { CartItem } from '../context/CartContext';
import { notifyAdminOfNewOrder } from './notifications';

export type PaymentMethod = 'COD' | 'BANK_TRANSFER';
export type PaymentStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'awaiting_verification'
  | 'paid'
  | 'failed';

export interface CreateOrderInput {
  fullName: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  district: string;
  postalCode: string;
  /**
   * subtotal/deliveryFee/total are intentionally NOT sent to the server —
   * see createOrder() below. They're kept here only so existing callers
   * (Checkout.tsx) don't need to change; the values actually charged and
   * stored are always computed authoritatively by the create_order RPC
   * from real product prices + the server-side delivery fee.
   */
  subtotal: number;
  deliveryFee: number;
  total: number;
  items: CartItem[];
  paymentMethod: PaymentMethod;
  /**
   * Storage path (in the `payment-receipts` bucket) of the customer's
   * uploaded transfer receipt. Required by Checkout.tsx before submit is
   * enabled when paymentMethod is BANK_TRANSFER; absent for COD.
   */
  receiptPath?: string;
}

/**
 * The only error text createOrder() ever throws. Raw Supabase/PostgreSQL
 * messages are logged for debugging but never propagated to the UI.
 */
export const CHECKOUT_ERROR_MESSAGE =
  'Unable to place your order. Please try again. If the problem continues, contact us.';

export interface CreateOrderResult {
  orderId: string;
  orderReference: string;
}

interface CreateOrderRpcRow {
  order_id: string;
  order_reference: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  // Single server-side RPC does everything that touches money, stock,
  // payment status, or the order reference: validates + decrements stock,
  // looks up each item's real price from `products`, computes
  // subtotal/delivery_fee/total itself, derives payment_status from
  // payment_method + receipt presence, and generates order_reference from
  // a database sequence — none of these are accepted as client
  // parameters — then inserts the order + order_items rows atomically.
  // See supabase/migrations/20260927010000_generate_order_reference_server_side.sql.
  const { data, error } = await supabase.rpc('create_order', {
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_email: input.email.trim() || null,
    p_address_line1: input.addressLine1,
    p_address_line2: input.addressLine2.trim() || null,
    p_city: input.city,
    p_district: input.district,
    p_postal_code: input.postalCode.trim() || null,
    p_payment_method: input.paymentMethod,
    p_receipt_url: input.receiptPath ?? null,
    p_items: input.items.map((item) => ({
      version_size_id: item.versionSizeId,
      product_id: item.productId,
      slug: item.slug,
      name: item.name,
      image: item.image,
      size: item.size,
      quantity: item.quantity,
    })),
  });

  if (error) {
    console.error('Order creation failed:', error);
    throw new Error(CHECKOUT_ERROR_MESSAGE);
  }

  const result = (data as CreateOrderRpcRow[] | null)?.[0];
  if (!result) {
    console.error('Order creation returned no result.');
    throw new Error(CHECKOUT_ERROR_MESSAGE);
  }

  // Fire-and-forget: the order is fully saved at this point, so a failure
  // to email the admin should never surface as a checkout error.
  void notifyAdminOfNewOrder(result.order_id);

  return { orderId: result.order_id, orderReference: result.order_reference };
}
