BEGIN;

CREATE FUNCTION public.generate_numeric_order_reference()
RETURNS text
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $function$
DECLARE
  sample bigint;
BEGIN
  FOR draw IN 1..8 LOOP
    -- UUID v4 uses PostgreSQL's strong random source. Its first 48 bits
    -- precede the version and variant bits. Reject the tail to avoid bias.
    sample := ('x' || left(replace(gen_random_uuid()::text, '-', ''), 12))::bit(48)::bigint;
    IF sample < 281000000000000 THEN
      RETURN lpad((sample % 1000000000000)::text, 12, '0');
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Unable to generate order reference' USING ERRCODE = '55000';
END;
$function$;
REVOKE ALL ON FUNCTION public.generate_numeric_order_reference() FROM PUBLIC, anon, authenticated, service_role;

-- Patch the existing allocator at the authoritative base checkout function.
-- The retry block covers the stock changes, movement log, and order insert.
-- A reference collision rolls back that block before the next draw. All other
-- errors retain their original behavior, including receipt and pricing errors.
DO $migration$
DECLARE
  target regprocedure := 'public.create_order(text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure;
  definition text := pg_get_functiondef(target);
  allocator text := $old$v_order_reference := 'CC-' || upper(replace(gen_random_uuid()::text, '-', ''));$old$;
  start_marker text := '  -- Lock both the inventory row';
  end_marker text := '  FOR item IN SELECT value FROM jsonb_array_elements(p_items) AS entries(value)';
  retry_from integer := strpos(definition, start_marker);
  retry_until integer := strpos(definition, 'v_payment_status, p_receipt_url');
  next_loop integer;
  retry_block text;
BEGIN
  IF strpos(definition, allocator) = 0 THEN
    RAISE EXCEPTION 'Unexpected checkout allocator';
  END IF;
  IF retry_from = 0 OR retry_until <= retry_from THEN
    RAISE EXCEPTION 'Unexpected checkout stock or order insert block';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_order_reference_key'
         AND contype = 'u' AND NOT condeferrable
         AND pg_get_constraintdef(oid) = 'UNIQUE (order_reference)'
     ) THEN
    RAISE EXCEPTION 'Unexpected orders reference constraint';
  END IF;

  next_loop := strpos(substr(definition, retry_until), end_marker);
  IF next_loop = 0 THEN
    RAISE EXCEPTION 'Unexpected checkout order insert';
  END IF;
  retry_until := retry_until + next_loop - 1;
  retry_block := substr(definition, retry_from, retry_until - retry_from);

  definition := replace(definition, retry_block, $start$  FOR reference_attempt IN 1..8 LOOP
    BEGIN
      v_subtotal := 0;
      v_order_reference := public.generate_numeric_order_reference();
$start$ || regexp_replace(rtrim(retry_block, chr(10) || chr(13)), '^(.+)$', '    \1', 'gn') || $stop$
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS
        conflicting_schema = SCHEMA_NAME,
        conflicting_table = TABLE_NAME,
        conflicting_constraint = CONSTRAINT_NAME;
      IF conflicting_schema IS DISTINCT FROM 'public'
         OR conflicting_table IS DISTINCT FROM 'orders'
         OR conflicting_constraint IS DISTINCT FROM 'orders_order_reference_key' THEN
        RAISE;
      END IF;
      IF reference_attempt = 8 THEN
        RAISE EXCEPTION 'Unable to allocate order reference' USING ERRCODE = '55000';
      END IF;
    END;
  END LOOP;

$stop$);
  definition := replace(definition, '  v_order_reference text;', $vars$  v_order_reference text;
  conflicting_schema text;
  conflicting_table text;
  conflicting_constraint text;$vars$);
  definition := replace(definition, allocator, '-- The reference is allocated inside the retry block.');
  IF strpos(definition, allocator) <> 0 OR strpos(definition, '  conflicting_constraint text;') = 0 THEN
    RAISE EXCEPTION 'Unexpected checkout allocator declaration';
  END IF;
  EXECUTE definition;
END;
$migration$;

COMMIT;
