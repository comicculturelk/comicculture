BEGIN;

-- Keep the checkout transaction, response shape, and stored historical
-- references intact. Fail the migration if the expected allocator has drifted.
DO $migration$
DECLARE
  definition text := pg_get_functiondef(
    'public.create_order(text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure
  );
  previous_allocator text := $old$v_order_reference := 'CC-' || to_char(nextval('order_reference_seq'), 'FM0000000');$old$;
  random_allocator text := $new$v_order_reference := 'CC-' || upper(replace(gen_random_uuid()::text, '-', ''));$new$;
BEGIN
  IF strpos(definition, previous_allocator) = 0 THEN
    RAISE EXCEPTION 'Unexpected checkout reference allocator';
  END IF;
  EXECUTE replace(definition, previous_allocator, random_allocator);
END;
$migration$;

-- Checkout and product-code reservation execute with their function owners.
REVOKE ALL ON SEQUENCE public.order_reference_seq, public.product_code_seq
  FROM PUBLIC, anon, authenticated;

-- Existing owner/admin operations policies still allow inactive rows.
ALTER POLICY "Product versions are viewable by everyone"
  ON public.product_versions USING (is_active IS TRUE);

ALTER POLICY "Product version sizes are viewable by everyone"
  ON public.product_version_sizes USING (
    EXISTS (
      SELECT 1 FROM public.product_versions AS version
      WHERE version.id = product_version_sizes.version_id
        AND version.is_active IS TRUE
    )
  );

COMMIT;
