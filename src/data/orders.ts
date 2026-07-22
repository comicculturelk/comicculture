import { supabase } from '../lib/supabase';
import type { CartItem } from '../context/CartContext';
import { notifyAdminOfNewOrder } from './notifications';

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
  /** Optional until Checkout.tsx collects it; included in the admin email when present. */
  paymentMethod?: string;
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
    payment_method: input.paymentMethod?.trim() || null,
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
