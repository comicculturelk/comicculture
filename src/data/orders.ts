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
  orderReference: string;
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
 * Payment status is derived from payment method (and, for Bank Transfer,
 * whether a receipt was uploaded), never chosen directly by the customer.
 * - COD: nothing is owed up front, so it starts "pending".
 * - Bank Transfer with a receipt: an admin still has to check the transfer
 *   actually landed, so it starts "awaiting_verification" — NOT auto-paid.
 * - Bank Transfer without a receipt (shouldn't happen — Checkout disables
 *   submit until one is uploaded — but guarded here too): "awaiting_payment".
 */
function paymentStatusFor(method: PaymentMethod, hasReceipt: boolean): PaymentStatus {
  if (method !== 'BANK_TRANSFER') return 'pending';
  return hasReceipt ? 'awaiting_verification' : 'awaiting_payment';
}

interface CreateOrderRpcRow {
  order_id: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
}

export async function createOrder(input: CreateOrderInput): Promise<void> {
  // Order workflow status is untouched — it stays at the table default
  // ('pending') regardless of payment method. Payment status is tracked
  // separately and must never influence or be inferred from order status.
  const paymentStatus = paymentStatusFor(input.paymentMethod, !!input.receiptPath);

  // Single server-side RPC does everything that touches money or stock:
  // validates + decrements stock, looks up each item's real price from
  // `products`, computes subtotal/delivery_fee/total itself (ignoring any
  // client-supplied numbers — they're not even passed as parameters), and
  // inserts the order + order_items rows atomically. See
  // supabase/migrations/20260903010000_create_order_server_side_pricing.sql.
  const { data, error } = await supabase.rpc('create_order', {
    p_order_reference: input.orderReference,
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_email: input.email.trim() || null,
    p_address_line1: input.addressLine1,
    p_address_line2: input.addressLine2.trim() || null,
    p_city: input.city,
    p_district: input.district,
    p_postal_code: input.postalCode.trim() || null,
    p_payment_method: input.paymentMethod,
    p_payment_status: paymentStatus,
    p_receipt_url: input.receiptPath ?? null,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      slug: item.slug,
      name: item.name,
      image: item.image,
      size: item.size,
      quantity: item.quantity,
    })),
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = (data as CreateOrderRpcRow[] | null)?.[0];
  if (!result) {
    throw new Error(`Order ${input.orderReference} was not created — no result returned.`);
  }

  // Fire-and-forget: the order is fully saved at this point, so a failure
  // to email the admin should never surface as a checkout error.
  void notifyAdminOfNewOrder(result.order_id);
}
