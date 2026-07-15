/*
  # Add product detail fields

  1. Changes
    - `products`
      - `material` (text, nullable) - Fabric/material description shown on the
        product detail page (e.g. 'Premium breathable polyester mesh')
      - `fit` (text, nullable) - Fit description (e.g. 'True to size, athletic fit')
      - `care_instructions` (text[], nullable) - List of care/washing instructions
        shown in the product detail page's "Care Instructions" section

  2. Notes
    - All new columns are nullable so existing rows keep working without a
      migration failure; the app falls back to sensible generic copy when a
      value is missing (see `mapRowToProduct` in `src/data/products.ts`)
    - Existing seed rows are backfilled below with jersey-appropriate values
*/

ALTER TABLE products ADD COLUMN IF NOT EXISTS material text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS fit text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS care_instructions text[];

UPDATE products
SET
  material = 'Premium breathable polyester mesh with moisture-wicking finish',
  fit = 'True to size, athletic fit',
  care_instructions = ARRAY[
    'Machine wash cold with like colors',
    'Do not bleach',
    'Tumble dry low',
    'Do not iron directly on printed graphics'
  ]
WHERE material IS NULL;
