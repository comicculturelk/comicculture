/** Apparel categories: keep these values in sync with the database constraint. */
export type ProductType = 'regular_tshirt' | 'oversized_tshirt' | 'jersey' | 'polo' | 'hoodie';

export const PRODUCT_TYPES: ProductType[] = [
  'regular_tshirt',
  'oversized_tshirt',
  'jersey',
  'polo',
  'hoodie',
];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  regular_tshirt: 'Regular T-Shirt',
  oversized_tshirt: 'Oversized T-Shirt',
  jersey: 'Jersey',
  polo: 'Polo',
  hoodie: 'Hoodie',
};
