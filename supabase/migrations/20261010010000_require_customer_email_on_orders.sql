-- Require a usable customer email at the database boundary too, so callers
-- cannot bypass checkout validation and create an order without one.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_order(
  p_full_name text,
  p_phone text,
  p_mobile_phone text,
  p_email text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_district text,
  p_postal_code text,
  p_payment_method text,
  p_receipt_url text,
  p_items jsonb
)
RETURNS TABLE(order_id uuid, order_reference text, subtotal numeric, delivery_fee numeric, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  created_order record;
  normalized_email text := NULLIF(trim(p_email), '');
BEGIN
  IF normalized_email IS NULL OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A valid customer email is required';
  END IF;

  SELECT * INTO created_order
  FROM public.create_order(
    p_full_name,
    p_phone,
    normalized_email,
    p_address_line1,
    p_address_line2,
    p_city,
    p_district,
    p_postal_code,
    p_payment_method,
    p_receipt_url,
    p_items
  );

  UPDATE public.orders AS o
  SET mobile_phone = NULLIF(trim(p_mobile_phone), '')
  WHERE o.id = created_order.order_id;

  RETURN QUERY SELECT
    created_order.order_id,
    created_order.order_reference,
    created_order.subtotal,
    created_order.delivery_fee,
    created_order.total;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_order(text, text, text, text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(text, text, text, text, text, text, text, text, text, text, text, jsonb) TO anon, service_role;

COMMIT;
