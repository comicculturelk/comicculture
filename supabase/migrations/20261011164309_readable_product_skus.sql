BEGIN;

-- Product codes are immutable, compact identifiers for picking and labeling.
-- Backfill the new field only: keep every existing SKU and order snapshot intact.
CREATE SEQUENCE public.product_code_seq START WITH 1;

CREATE OR REPLACE FUNCTION public.next_product_code()
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT 'CC-P' || lpad(nextval('public.product_code_seq')::text, 6, '0');
$$;
REVOKE ALL ON FUNCTION public.next_product_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_product_code() TO authenticated, service_role;

ALTER TABLE public.products ADD COLUMN product_code text;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS seq
  FROM public.products
)
UPDATE public.products AS p
SET product_code = 'CC-P' || lpad(numbered.seq::text, 6, '0')
FROM numbered
WHERE numbered.id = p.id;

SELECT setval('public.product_code_seq', greatest(count(*), 1), count(*) > 0)
FROM public.products;

ALTER TABLE public.products ALTER COLUMN product_code SET DEFAULT public.next_product_code();
ALTER TABLE public.products ALTER COLUMN product_code SET NOT NULL;
ALTER TABLE public.products ADD CONSTRAINT products_product_code_key UNIQUE (product_code);

CREATE OR REPLACE FUNCTION public.reserve_product_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_store_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  RETURN public.next_product_code();
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_product_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_product_code() TO authenticated, service_role;

-- The atomic product save remains the single writer. Insert the reserved code
-- for new products and leave it unchanged on edits.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.save_admin_product(boolean,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure)
  INTO definition;
  definition := replace(definition,
    $old_columns$      id, name, slug, collection_id, collection, tagline, description,
      lore, image, images, featured$old_columns$,
    $new_columns$      id, name, slug, collection_id, collection, product_code, tagline, description,
      lore, image, images, featured$new_columns$);
  definition := replace(definition,
    $old_values$      collection_name, coalesce(p_product->>'tagline', ''),$old_values$,
    $new_values$      collection_name, p_product->>'productCode', coalesce(p_product->>'tagline', ''),$new_values$);
  IF position('product_code' in definition) = 0 OR position('p_product->>''productCode''' in definition) = 0 THEN
    RAISE EXCEPTION 'Could not update save_admin_product to persist product codes';
  END IF;
  EXECUTE definition;
END;
$$;

COMMIT;
