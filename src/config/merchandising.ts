// Update this small editorial slot for each launch; product price, stock and
// photography always come from the existing catalog. No sale/stock claims.
export const FEATURED_LAUNCH: {
  productSlug: string;
  summary: string;
  detailImageIndex?: number;
  detailLabel?: string;
  detailCaption?: string;
} = {
  productSlug: 'iron-man-arc-reactor',
  summary: 'Cotton with glow-in-the-dark ink. Made for after dark.',
  detailImageIndex: 1,
  detailLabel: 'Glow-in-the-dark detail',
  detailCaption: 'After dark',
};

// NEW expires automatically. An older product can still be a featured launch
// without being described as new.
export const NEW_PRODUCT_DAYS = 30;
