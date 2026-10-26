import { checkoutRequest } from '../lib/checkout';
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
  mobilePhone: string;
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
  promoCode?: string;
  requestId: string;
  token: string;
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
  subtotal: number;
  deliveryFee: number;
  total: number;
  discountAmount: number;
  notificationToken: string;
}

interface CreateOrderRpcRow {
  order_id: string;
  order_reference: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  discount_amount: number;
  notification_token: string;
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  // The verified/rate-limited gateway calls the existing database transaction
  // through an idempotent wrapper. The transaction owns money, stock,
  // payment status, or the order reference: validates + decrements stock,
  // looks up each item's real price from `products`, computes
  // subtotal/delivery_fee/total itself, derives payment_status from
  // payment_method + receipt presence, and generates order_reference from
  // a database sequence — none of these are accepted as client
  // parameters — then inserts the order + order_items rows atomically.
  // See supabase/migrations/20260927010000_generate_order_reference_server_side.sql.
  const result = await checkoutRequest<CreateOrderRpcRow>('order', {
    fullName: input.fullName, phone: input.phone, mobilePhone: input.mobilePhone.trim() || null,
    email: input.email.trim(), addressLine1: input.addressLine1, addressLine2: input.addressLine2.trim() || null,
    city: input.city, district: input.district, postalCode: input.postalCode.trim() || null,
    paymentMethod: input.paymentMethod, receiptPath: input.receiptPath ?? null,
    items: input.items.map((item) => ({
      version_size_id: item.versionSizeId,
      quantity: item.quantity,
    })),
    promoCode: input.promoCode?.trim() || null,
  }, { requestId: input.requestId, token: input.token });
  if (!result) {
    console.error('Order creation returned no result.');
    throw new Error(CHECKOUT_ERROR_MESSAGE);
  }

  // Fire-and-forget: the order is fully saved at this point, so a failure
  // to email the admin should never surface as a checkout error.
  void notifyAdminOfNewOrder(result.order_id, result.notification_token);

  return {
    orderId: result.order_id,
    orderReference: result.order_reference,
    subtotal: result.subtotal,
    deliveryFee: result.delivery_fee,
    total: result.total,
    discountAmount: result.discount_amount,
    notificationToken: result.notification_token,
  };
}
