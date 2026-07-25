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

export async function createOrder(input: CreateOrderInput): Promise<void> {
  // Validate + reserve stock atomically before creating the order.
  // Throws (and aborts) if any item is out of stock or oversold.
  const { error: stockError } = await supabase.rpc('decrement_stock_for_order', {
    items: input.items.map((item) => ({
      product_id: item.productId,
      size: item.size,
      quantity: item.quantity,
    })),
    order_reference: input.orderReference,
  });

  if (stockError) {
    throw new Error(stockError.message);
  }

  const orderId = crypto.randomUUID();

  // Order workflow status is untouched — it stays at the table default
  // ('pending') regardless of payment method. Payment status is tracked
  // separately and must never influence or be inferred from order status.
  const paymentStatus = paymentStatusFor(input.paymentMethod, !!input.receiptPath);

  const { error: orderError } = await supabase.from('orders').insert({
    id: orderId,
    order_reference: input.orderReference,
    full_name: input.fullName,
    phone: input.phone,
    email: input.email.trim() || null,
    address_line1: input.addressLine1,
    address_line2: input.addressLine2.trim() || null,
    city: input.city,
    district: input.district,
    postal_code: input.postalCode.trim() || null,
    subtotal: input.subtotal,
    delivery_fee: input.deliveryFee,
    total: input.total,
    payment_method: input.paymentMethod,
    payment_status: paymentStatus,
    receipt_url: input.receiptPath ?? null,
  });

  if (orderError) {
    throw new Error(orderError.message);
  }

  const orderItems = input.items.map((item) => ({
    order_id: orderId,
    product_id: item.productId,
    slug: item.slug,
    name: item.name,
    image: item.image,
    price: item.price,
    size: item.size,
    quantity: item.quantity,
  }));

  const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

  if (itemsError) {
    // Order row exists but items failed — surface this distinctly so it's
    // easy to find/fix from the Supabase dashboard if it ever happens.
    throw new Error(`Order ${input.orderReference} was created, but saving items failed: ${itemsError.message}`);
  }

  // Fire-and-forget: the order is fully saved at this point, so a failure
  // to email the admin should never surface as a checkout error.
  void notifyAdminOfNewOrder(orderId);
}
