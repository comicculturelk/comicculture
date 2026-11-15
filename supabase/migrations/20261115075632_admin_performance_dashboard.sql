BEGIN;

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at DESC);

-- The previous summary remains callable during rollout. One read-only RPC
-- supplies the new dashboard and does not return customer contact details.
CREATE FUNCTION public.admin_dashboard_analytics(p_period text, p_low_stock_threshold integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  business_tz constant text := 'Asia/Colombo';
  as_of timestamptz := statement_timestamp();
  local_now timestamp := as_of AT TIME ZONE business_tz;
  today date := local_now::date;
  period_days integer;
  first_day date;
  start_at timestamptz;
  previous_start_at timestamptz;
  previous_end_at timestamptz;
  bin text;
  bin_step interval;
  result jsonb;
BEGIN
  IF public.is_store_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  period_days := CASE p_period
    WHEN 'today' THEN 1 WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 WHEN 'all' THEN 0
  END;
  IF period_days IS NULL OR p_low_stock_threshold IS NULL OR p_low_stock_threshold NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid dashboard filters' USING ERRCODE = '22023';
  END IF;

  IF period_days = 0 THEN
    SELECT coalesce((min(o.created_at) AT TIME ZONE business_tz)::date, today)
    INTO first_day FROM public.orders o WHERE o.created_at < as_of;
  ELSE
    first_day := today - period_days + 1;
    previous_start_at := (first_day - period_days)::timestamp AT TIME ZONE business_tz;
    previous_end_at := (local_now - make_interval(days => period_days)) AT TIME ZONE business_tz;
  END IF;
  start_at := first_day::timestamp AT TIME ZONE business_tz;
  bin := CASE
    WHEN period_days = 1 THEN 'hour'
    WHEN period_days BETWEEN 7 AND 30 THEN 'day'
    WHEN period_days = 90 OR today - first_day <= 365 THEN 'week'
    WHEN today - first_day <= 2192 THEN 'month'
    WHEN today - first_day <= 8766 THEN 'quarter'
    ELSE 'year'
  END;
  bin_step := CASE bin WHEN 'quarter' THEN interval '3 months' ELSE ('1 ' || bin)::interval END;

  WITH scoped_orders AS MATERIALIZED (
    SELECT o.id, o.created_at, o.order_reference, o.status, o.payment_status, o.payment_method,
      o.total, o.delivery_fee, o.discount_amount, o.created_at >= start_at AS selected,
      (o.status <> 'cancelled' AND o.payment_status NOT IN ('failed', 'refunded')) AS valid_demand,
      (o.status <> 'cancelled' AND (o.payment_status = 'paid'
        OR (o.payment_method = 'COD' AND o.status = 'delivered' AND o.payment_status = 'pending'))) AS collected,
      (o.status IN ('pending', 'confirmed', 'packed') AND o.payment_status <> 'refunded') AS needs_action
    FROM public.orders o
    WHERE o.created_at >= coalesce(previous_start_at, start_at) AND o.created_at < as_of
      AND (previous_end_at IS NULL OR o.created_at < previous_end_at OR o.created_at >= start_at)
  ), order_totals AS (
    SELECT selected, count(*) AS placed, count(*) FILTER (WHERE needs_action) AS awaiting_action,
      count(*) FILTER (WHERE status = 'pending' AND needs_action AND created_at <= as_of - interval '48 hours') AS overdue,
      count(*) FILTER (WHERE collected) AS collected_orders,
      coalesce(sum(total) FILTER (WHERE collected), 0) AS revenue,
      coalesce(sum(delivery_fee) FILTER (WHERE collected), 0) AS shipping,
      coalesce(sum(discount_amount) FILTER (WHERE collected), 0) AS discounts,
      round(avg(total) FILTER (WHERE collected), 2) AS aov
    FROM scoped_orders GROUP BY selected
  ), scoped_items AS MATERIALIZED (
    SELECT i.product_id, i.version_size_id, i.name, i.image, i.size, i.quantity,
      i.price * i.quantity AS value, o.selected, o.created_at, o.id AS order_id
    FROM scoped_orders o JOIN public.order_items i ON i.order_id = o.id
    WHERE o.valid_demand
  ), item_totals AS (
    SELECT selected, sum(quantity) AS units FROM scoped_items GROUP BY selected
  ), periods AS (
    SELECT sel.selected, coalesce(o.placed, 0) AS placed, coalesce(i.units, 0) AS units,
      coalesce(o.revenue, 0) AS revenue, o.aov, coalesce(o.shipping, 0) AS shipping,
      coalesce(o.discounts, 0) AS discounts, coalesce(o.collected_orders, 0) AS collected_orders,
      coalesce(o.awaiting_action, 0) AS awaiting_action, coalesce(o.overdue, 0) AS overdue
    FROM (VALUES (true), (false)) AS sel(selected)
    LEFT JOIN order_totals o USING (selected)
    LEFT JOIN item_totals i USING (selected)
  ), series AS (
    SELECT date_trunc(bin, created_at AT TIME ZONE business_tz) AS bucket,
      count(*) AS placed, sum(total) FILTER (WHERE collected) AS revenue
    FROM scoped_orders WHERE selected GROUP BY 1
  ), design_totals AS (
    SELECT product_id, sum(quantity) AS units, sum(value) AS value
    FROM scoped_items WHERE selected GROUP BY product_id
    ORDER BY units DESC, value DESC, product_id LIMIT 10
  ), design_snapshots AS (
    SELECT DISTINCT ON (i.product_id) i.product_id, i.name, nullif(i.image, '') AS image
    FROM scoped_items i JOIN design_totals d USING (product_id) WHERE i.selected
    ORDER BY i.product_id, i.created_at DESC, i.order_id DESC, i.version_size_id
  ), sold_variants AS (
    SELECT version_size_id, sum(quantity) AS units, sum(value) AS value
    FROM scoped_items WHERE selected GROUP BY version_size_id
  ), editions AS (
    SELECT v.id, v.product_id, v.version_name AS edition, p.name AS product,
      sum(x.units) AS units, sum(x.value) AS value
    FROM sold_variants x
    JOIN public.product_version_sizes s ON s.id = x.version_size_id
    JOIN public.product_versions v ON v.id = s.version_id
    JOIN public.products p ON p.id = v.product_id
    GROUP BY v.id, v.product_id, v.version_name, p.name
  ), ranked_editions AS (
    SELECT e.*, row_number() OVER (PARTITION BY e.product_id ORDER BY e.units DESC, e.id) AS position
    FROM editions e JOIN design_totals d USING (product_id)
  ), design_editions AS (
    SELECT product_id, count(*) AS edition_count,
      jsonb_agg(jsonb_build_object('id', id, 'edition', edition, 'units', units) ORDER BY position)
        FILTER (WHERE position <= 5) AS editions
    FROM ranked_editions GROUP BY product_id
  ), best_designs AS (
    SELECT d.*, n.name, coalesce(n.image, nullif(p.images[1], ''), nullif(p.image, '')) AS image,
      coalesce(e.editions, '[]'::jsonb) AS editions, coalesce(e.edition_count, 0) AS edition_count
    FROM design_totals d JOIN design_snapshots n USING (product_id)
    LEFT JOIN public.products p ON p.id = d.product_id LEFT JOIN design_editions e USING (product_id)
  ), active_sizes AS MATERIALIZED (
    SELECT s.id, s.size, s.stock, v.id AS version_id, v.version_name AS edition,
      p.id AS product_id, p.name AS product, greatest(s.created_at, v.created_at, p.created_at) AS listed_at,
      coalesce(x.units, 0) AS units
    FROM public.product_version_sizes s
    JOIN public.product_versions v ON v.id = s.version_id AND v.is_active
    JOIN public.products p ON p.id = v.product_id
    LEFT JOIN sold_variants x ON x.version_size_id = s.id
  ), active_designs AS (
    SELECT active.*, coalesce(sold.units, 0) AS units
    FROM (SELECT product_id AS id, product, sum(stock) AS stock, min(listed_at) AS listed_at
      FROM active_sizes GROUP BY product_id, product) active
    LEFT JOIN (SELECT product_id, sum(quantity) AS units FROM scoped_items WHERE selected GROUP BY product_id) sold
      ON sold.product_id = active.id
  ), demand AS (
    SELECT 'variant' AS grain, id::text, product, edition, size, stock, units, listed_at FROM active_sizes
    UNION ALL
    SELECT 'design', id, product, null, null, stock, units, listed_at FROM active_designs
  ), quiet_demand AS (
    SELECT *, CASE
      WHEN listed_at > as_of - interval '336 hours' THEN 'new'
      WHEN units = 0 THEN 'zero'
      ELSE 'low'
    END AS classification
    FROM demand
    WHERE listed_at < as_of
      AND units <= greatest(1, (today - CASE WHEN period_days = 0 THEN (listed_at AT TIME ZONE business_tz)::date
        ELSE greatest(first_day, (listed_at AT TIME ZONE business_tz)::date) END + 1) / 30)
  ), ranked_quiet AS (
    SELECT *, count(*) OVER (PARTITION BY grain, classification) AS total,
      row_number() OVER (PARTITION BY grain, classification ORDER BY stock DESC, units, product, id) AS position
    FROM quiet_demand
  ), alerts AS (
    SELECT * FROM active_sizes WHERE stock <= p_low_stock_threshold
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('start', first_day, 'end', today, 'as_of', as_of,
      'previous_start', (previous_start_at AT TIME ZONE business_tz)::date,
      'previous_end', (previous_end_at AT TIME ZONE business_tz)::date, 'bin', bin),
    'current', (SELECT to_jsonb(p) - 'selected' FROM periods p WHERE selected),
    'previous', (SELECT to_jsonb(p) - 'selected' FROM periods p WHERE NOT selected AND period_days > 0),
    'trend', (SELECT jsonb_agg(jsonb_build_object('bucket', g.bucket,
      'revenue', coalesce(s.revenue, 0), 'placed', coalesce(s.placed, 0)) ORDER BY g.bucket)
      FROM generate_series(date_trunc(bin, first_day::timestamp), date_trunc(bin, local_now), bin_step) g(bucket)
      LEFT JOIN series s ON s.bucket = g.bucket),
    'orders', coalesce((SELECT jsonb_object_agg(status, count) FROM
      (SELECT status, count(*) FROM scoped_orders WHERE selected GROUP BY status) q), '{}'::jsonb),
    'payments', coalesce((SELECT jsonb_object_agg(payment_status, count) FROM
      (SELECT payment_status, count(*) FROM scoped_orders WHERE selected GROUP BY payment_status) q), '{}'::jsonb),
    'bank_review', (SELECT count(*) FROM scoped_orders WHERE selected AND status = 'pending' AND payment_method = 'BANK_TRANSFER' AND payment_status = 'awaiting_verification'),
    'recent', coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY created_at DESC, order_reference) FROM
      (SELECT order_reference, status, created_at, total FROM scoped_orders WHERE selected
       ORDER BY created_at DESC, order_reference LIMIT 5) q), '[]'::jsonb),
    'bestsellers', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY units DESC, value DESC, product_id) FROM best_designs d), '[]'::jsonb),
    'editions', coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY units DESC, id) FROM
      (SELECT * FROM editions ORDER BY units DESC, id LIMIT 5) q), '[]'::jsonb),
    'sizes', coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY units DESC, size) FROM
      (SELECT CASE upper(trim(i.size)) WHEN 'XXL' THEN '2XL' WHEN 'XXXL' THEN '3XL' ELSE upper(trim(i.size)) END AS size,
          sum(i.quantity) AS units FROM scoped_items i WHERE i.selected GROUP BY 1
       ORDER BY units DESC, size LIMIT 12) q), '[]'::jsonb),
    'quiet', coalesce((SELECT jsonb_agg(to_jsonb(q) - 'position' ORDER BY grain, classification, position)
      FROM ranked_quiet q WHERE position <= 10), '[]'::jsonb),
    'stock', (SELECT jsonb_build_object('low', count(*) FILTER (WHERE stock > 0),
      'out', count(*) FILTER (WHERE stock = 0), 'products', count(DISTINCT product_id),
      'threshold', p_low_stock_threshold,
      'alerts', coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY stock, product, edition, size, id) FROM
        (SELECT id, product, edition, size, stock FROM alerts ORDER BY stock, product, edition, size, id LIMIT 10) q), '[]'::jsonb))
      FROM alerts)
  ) INTO result;
  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_dashboard_analytics(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_analytics(text, integer) TO authenticated;

COMMIT;
