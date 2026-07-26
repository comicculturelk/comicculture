// Centralized store-wide configuration.
// Change deliveryFee here — do not hardcode it elsewhere. Existing orders
// are unaffected since delivery_fee is snapshotted per-order at checkout
// time (see src/data/orders.ts / orders.delivery_fee column).
export const STORE_CONFIG = {
  deliveryFee: 350,
  currency: 'LKR',
} as const;
