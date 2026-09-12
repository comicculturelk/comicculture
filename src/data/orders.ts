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

interface CreateOrderRpcRow {
  order_id: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
}

export async function createOrder(input: CreateOrderInput): Promise<void> {
  // Single server-side RPC does everything that touches money, stock, or
  // payment status: validates + decrements stock, looks up each item's
  // real product/size/price/SKU from `product_version_sizes` (keyed by
  // version_size_id — the client never sends price, size, or product_id
  // as authoritative values), computes subtotal/delivery_fee/total itself,
  // derives payment_status from payment_method + receipt presence (never
  // accepted as a client parameter), and inserts the order + order_items
  // rows atomically. See
  // supabase/migrations/20260910044914_introduce_product_versions_and_sizes.sql.
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
    p_receipt_url: input.receiptPath ?? null,
    p_items: input.items.map((item) => ({
      version_size_id: item.versionSizeId,
      slug: item.slug,
      name: item.name,
      image: item.image,
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
