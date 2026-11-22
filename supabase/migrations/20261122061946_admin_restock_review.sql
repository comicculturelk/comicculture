BEGIN;

CREATE FUNCTION public.admin_restock_review()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  request_time constant timestamptz := statement_timestamp();
  window_start constant timestamptz :=
    ((request_time AT TIME ZONE 'Asia/Colombo')::date - 89)::timestamp AT TIME ZONE 'Asia/Colombo';
  report jsonb;
BEGIN
  IF public.is_store_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  WITH eligible_sizes AS MATERIALIZED (
    SELECT s.id AS edition_size_id, p.name AS product, v.version_name AS edition, s.size, s.sku, s.stock
    FROM public.product_version_sizes s
    JOIN public.product_versions v ON v.id = s.version_id
    JOIN public.products p ON p.id = v.product_id
    WHERE v.is_active AND NOT v.is_preorder AND s.stock BETWEEN 0 AND 3
  ), demand AS (
    SELECT i.version_size_id, count(DISTINCT o.id) AS order_count
    FROM public.orders o
    JOIN public.order_items i ON i.order_id = o.id
    JOIN eligible_sizes s ON s.edition_size_id = i.version_size_id
    WHERE o.created_at >= window_start AND o.created_at < request_time
      AND o.status <> 'cancelled' AND o.payment_status NOT IN ('failed', 'refunded')
    GROUP BY i.version_size_id
  ), candidates AS (
    SELECT s.*, coalesce(d.order_count, 0) AS order_count
    FROM eligible_sizes s
    LEFT JOIN demand d ON d.version_size_id = s.edition_size_id
  )
  SELECT jsonb_build_object(
    'as_of', request_time,
    'starts_at', window_start,
    'candidates', coalesce(jsonb_agg(to_jsonb(c) ORDER BY
      least(c.order_count, 2) DESC, c.stock, c.product, c.edition, c.size, c.edition_size_id), '[]'::jsonb)
  )
  INTO report
  FROM candidates c;
  RETURN report;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_restock_review() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_restock_review() TO authenticated;

COMMIT;
