// Store-wide static configuration. The current delivery fee is stored in Supabase.
export const STORE_CONFIG = {
  supportEmail: 'comicculturelk@gmail.com',
  currency: 'LKR',
  // Published estimates, shared by the product page, FAQ and checkout.
  deliveryTiming: 'Orders are usually dispatched within 1–2 business days. Standard delivery is estimated at 2–4 business days across Sri Lanka.',
} as const;
