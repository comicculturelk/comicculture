// Centralized store-wide configuration.
// Change deliveryFee here — do not hardcode it elsewhere. Existing orders
// are unaffected since delivery_fee is snapshotted per-order at checkout
// time (see src/data/orders.ts / orders.delivery_fee column).
export const STORE_CONFIG = {
  deliveryFee: 350,
  currency: 'LKR',
  // Published estimates, shared by the product page, FAQ and checkout.
  deliveryTiming: 'Orders are usually dispatched within 1–2 business days. Standard delivery is estimated at 2–4 business days across Sri Lanka.',
} as const;
