-- Introduce a structured product type, replacing reliance on the free-text
-- `material` / `fit` columns to distinguish apparel styles (jersey, regular
-- t-shirt, oversized t-shirt, polo, hoodie, ...).
--
-- Existing data was inspected directly (live `products` table export) before
-- writing this migration, rather than guessed from code/seed history alone:
--   - All 6 current rows (classic-gwen, noir-spider, classic-red,
--     symbiotic-suit, volt-spider, upgraded-black) share identical
--     `material`/`fit` text ("Premium breathable polyester mesh with
--     moisture-wicking finish" / "True to size, athletic fit") and all sit
--     in the "Web-Slinger Saga" collection — the same jersey-specific copy
--     from the original seed migration (20260713100000), which described
--     every one of them as a football jersey.
--   - This is decisive: every existing product is a jersey, not a generic
--     t-shirt, so each is backfilled explicitly by id below rather than to a
--     generic default.
--
-- 'regular_tshirt' remains the column DEFAULT purely as a safety net for any
-- row that isn't one of the 6 explicitly classified below (e.g. one created
-- between this inspection and the migration actually running) — every
-- currently known row gets the correct, evidence-based 'jersey' value.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'regular_tshirt';

-- Explicit, id-based backfill for the 6 rows confirmed to be jerseys.
UPDATE products
SET product_type = 'jersey'
WHERE id IN (
  'classic-gwen',
  'noir-spider',
  'classic-red',
  'symbiotic-suit',
  'volt-spider',
  'upgraded-black'
);

-- Closed, validated set. New apparel types are added by extending this list
-- in a follow-up migration, not by accepting arbitrary text.
ALTER TABLE products
  ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN (
    'regular_tshirt',
    'oversized_tshirt',
    'jersey',
    'polo',
    'hoodie'
  ));

COMMENT ON COLUMN products.product_type IS
  'Structured apparel category (regular_tshirt, oversized_tshirt, jersey, polo, hoodie). Drives future filtering, type-specific size guides, analytics, and variant logic.';
