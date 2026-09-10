-- Phase 2: replace the flat products model with
--   collections -> products (design) -> product_versions (apparel/version)
--   -> product_version_sizes (sellable unit: size/SKU/price/stock)
--
-- Confirmed via live inspection before writing this migration:
--   - products currently holds product_type/material/fit/care_instructions/
--     price/sku/sizes[]/stock{jsonb} directly (single row per design).
--   - All 6 existing rows (classic-gwen, noir-spider, classic-red,
--     symbiotic-suit, volt-spider, upgraded-black) are product_type='jersey'.
--   - orders(14)/order_items(17)/inventory_movements(28) contain only
--     pre-launch test data — explicitly confirmed with the project owner as
--     safe to clear; no real customer orders exist yet.
--   - products.instagram_link is read into the TS `Product` type but never
--     rendered anywhere in the app, and is explicitly commented in
--     src/data/products.ts as "legacy ... not exposed in the admin form" —
--     always written as an empty string on create. Nothing depends on its
--     value, so it is dropped along with the other design-level cleanup.
--     (The TypeScript side will need a follow-up in Phase 2B regardless,
--     same as every other column this migration touches.)
--
-- This migration is intentionally NOT a generic variant system: color lives
-- as a plain column on product_versions, not a separate colors table, per
-- the agreed scope.
--
-- Review round 2 corrections applied:
--   1. create_order() no longer trusts client-supplied product_id/size —
--      both are derived from the product_version_sizes/product_versions row
--      identified by version_size_id, for every write (inventory_movements
--      and order_items alike).
--   2. Every SECURITY DEFINER function in this migration (plus the
--      pre-existing get_order_tracking, hardened here too) explicitly sets
--      search_path = public.
--   3. EXECUTE grants on create_order/adjust_stock/restock_product are set
--      explicitly rather than left implicit: create_order stays
--      anon + service_role (unauthenticated checkout); adjust_stock and
--      restock_product become authenticated + service_role only (admin-only
--      inventory mutation must never be publicly executable).

BEGIN;

-- ===========================================================================
-- 1. New tables
-- ===========================================================================

CREATE TABLE product_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version_name text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN (
    'regular_tshirt', 'oversized_tshirt', 'jersey', 'polo', 'hoodie'
  )),
  material text,
  fit text,
  color text,
  images text[],
  care_instructions text[],
  is_preorder boolean NOT NULL DEFAULT false,
  preorder_days integer,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_versions_preorder_days_only_when_preorder
    CHECK (is_preorder = true OR preorder_days IS NULL),
  CONSTRAINT product_versions_preorder_days_positive_when_present
    CHECK (preorder_days IS NULL OR preorder_days > 0),
  CONSTRAINT product_versions_product_id_version_name_key UNIQUE (product_id, version_name)
);

COMMENT ON TABLE product_versions IS
  'One row per apparel/version offering of a product (e.g. "Jersey", "Oversized Cotton — Black"). Version-level: type, material, fit, color, images, care, preorder.';

CREATE INDEX idx_product_versions_product_id ON product_versions(product_id);

CREATE TABLE product_version_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
  size text NOT NULL,
  sku text NOT NULL UNIQUE,
  price numeric NOT NULL CHECK (price >= 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_version_sizes_version_id_size_key UNIQUE (version_id, size)
);

COMMENT ON TABLE product_version_sizes IS
  'The actual sellable/inventory unit: one row per size of a product_version, carrying its own SKU, price, and stock.';

CREATE INDEX idx_product_version_sizes_version_id ON product_version_sizes(version_id);

ALTER TABLE product_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_version_sizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Product versions are viewable by everyone"
  ON product_versions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert product versions"
  ON product_versions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update product versions"
  ON product_versions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete product versions"
  ON product_versions FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Product version sizes are viewable by everyone"
  ON product_version_sizes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert product version sizes"
  ON product_version_sizes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update product version sizes"
  ON product_version_sizes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete product version sizes"
  ON product_version_sizes FOR DELETE
  TO authenticated
  USING (true);

-- ===========================================================================
-- 2. Backfill existing products into one default "Jersey" version each
--    (generic over whatever rows currently exist in `products` — not
--    hardcoded to specific ids — but today that's exactly the 6 Spider-Man
--    products, all product_type = 'jersey').
-- ===========================================================================

INSERT INTO product_versions (
  product_id, version_name, product_type, material, fit, color,
  images, care_instructions, is_preorder, preorder_days, is_active, sort_order
)
SELECT
  id, 'Jersey', product_type, material, fit, NULL,
  images, care_instructions, is_preorder, preorder_days, true, 0
FROM products;

-- One product_version_sizes row per (product, size), carrying over that
-- product's existing single price/sku/stock. Since the old schema had one
-- SKU per *product* (not per size), the size is appended to make each new
-- per-size SKU unique — verify these generated SKUs before relying on them
-- externally (see notes at the end of this file).
INSERT INTO product_version_sizes (version_id, size, sku, price, stock)
SELECT
  pv.id,
  s.size,
  p.sku || '-' || s.size,
  p.price,
  COALESCE((p.stock ->> s.size)::int, 0)
FROM products p
JOIN product_versions pv ON pv.product_id = p.id AND pv.version_name = 'Jersey'
CROSS JOIN LATERAL unnest(p.sizes) AS s(size);

-- ===========================================================================
-- 3. Clear pre-launch test data (explicitly confirmed: no real orders yet).
--    Must happen before adding NOT NULL FK columns below.
-- ===========================================================================

TRUNCATE TABLE inventory_movements, order_items, orders;

-- ===========================================================================
-- 4. Point order_items / inventory_movements at the new sellable unit.
--    product_id is kept on both tables as a convenience denormalization for
--    display/joins without walking version -> product every time. It is now
--    always derived server-side from version_size_id (see create_order and
--    restore_stock_on_cancel below) rather than trusted from any caller.
-- ===========================================================================

ALTER TABLE order_items
  ADD COLUMN version_size_id uuid NOT NULL REFERENCES product_version_sizes(id);

CREATE INDEX idx_order_items_version_size_id ON order_items(version_size_id);

ALTER TABLE inventory_movements
  ADD COLUMN version_size_id uuid NOT NULL REFERENCES product_version_sizes(id);

CREATE INDEX idx_inventory_movements_version_size_id ON inventory_movements(version_size_id);

-- ===========================================================================
-- 5. Rewrite stock-touching functions around product_version_sizes.
-- ===========================================================================

DROP TRIGGER IF EXISTS trg_restore_stock_on_cancel ON orders;

-- create_order: same signature (types unchanged); p_items elements now carry
-- version_size_id (uuid) and quantity. product_id and size are NEVER taken
-- from the client — both are derived from the product_version_sizes row
-- (joined to product_versions for product_id) so order_items/
-- inventory_movements can never end up with a product_id/size that doesn't
-- actually match the version_size_id that was locked and decremented.
CREATE OR REPLACE FUNCTION public.create_order(
  p_order_reference text,
  p_full_name text,
  p_phone text,
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
RETURNS TABLE(order_id uuid, subtotal numeric, delivery_fee numeric, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Keep in sync with STORE_CONFIG.deliveryFee in src/config/store.ts.
  v_delivery_fee CONSTANT numeric := 350;
  v_order_id uuid := gen_random_uuid();
  v_subtotal numeric := 0;
  v_total numeric;
  v_payment_status text;
  item jsonb;
  vsid uuid;
  qty int;
  current_qty int;
  new_qty int;
  item_price numeric;
  item_name text;
  item_is_preorder boolean;
  item_preorder_days int;
  -- Authoritative, server-derived values — never taken from the client.
  derived_product_id text;
  derived_size text;
BEGIN
  IF p_payment_method NOT IN ('COD', 'BANK_TRANSFER') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  -- Derive payment_status server-side — never accepted from the client.
  IF p_payment_method = 'BANK_TRANSFER' THEN
    IF p_receipt_url IS NOT NULL AND length(trim(p_receipt_url)) > 0 THEN
      v_payment_status := 'awaiting_verification';
    ELSE
      v_payment_status := 'awaiting_payment';
    END IF;
  ELSE
    v_payment_status := 'pending';
  END IF;

  -- Pass 1: validate + decrement stock on product_version_sizes, look up the
  -- authoritative price/product_id/size for each item, and accumulate the
  -- real subtotal.
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    vsid := (item->>'version_size_id')::uuid;
    qty := (item->>'quantity')::int;

    IF qty IS NULL OR qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for version_size %', vsid;
    END IF;

    SELECT pvs.stock, pvs.price, p.name, pv.product_id, pvs.size
    INTO current_qty, item_price, item_name, derived_product_id, derived_size
    FROM product_version_sizes pvs
    JOIN product_versions pv ON pv.id = pvs.version_id
    JOIN products p ON p.id = pv.product_id
    WHERE pvs.id = vsid
    FOR UPDATE OF pvs;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product version size % not found', vsid;
    END IF;

    IF current_qty < qty THEN
      RAISE EXCEPTION 'Sorry, only % left in size % — please update your cart', current_qty, derived_size;
    END IF;

    new_qty := current_qty - qty;

    UPDATE product_version_sizes SET stock = new_qty WHERE id = vsid;

    INSERT INTO inventory_movements (product_id, version_size_id, product_name, size, change_type, quantity_change, resulting_stock, reason)
    VALUES (derived_product_id, vsid, item_name, derived_size, 'sale', -qty, new_qty, p_order_reference);

    v_subtotal := v_subtotal + (item_price * qty);
  END LOOP;

  v_total := v_subtotal + v_delivery_fee;

  INSERT INTO orders (
    id, order_reference, full_name, phone, email,
    address_line1, address_line2, city, district, postal_code,
    subtotal, delivery_fee, total,
    payment_method, payment_status, receipt_url
  ) VALUES (
    v_order_id, p_order_reference, p_full_name, p_phone, p_email,
    p_address_line1, p_address_line2, p_city, p_district, p_postal_code,
    v_subtotal, v_delivery_fee, v_total,
    p_payment_method, v_payment_status, p_receipt_url
  );

  -- Pass 2: insert order_items with the authoritative price + a fresh
  -- pre-order snapshot, and the same server-derived product_id/size as
  -- pass 1 (re-derived rather than reused from a variable, in case a
  -- future edit reorders these loops — cheap and keeps the two passes
  -- independently correct).
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    vsid := (item->>'version_size_id')::uuid;
    qty := (item->>'quantity')::int;

    SELECT pvs.price, pv.is_preorder, pv.preorder_days, pv.product_id, pvs.size
    INTO item_price, item_is_preorder, item_preorder_days, derived_product_id, derived_size
    FROM product_version_sizes pvs
    JOIN product_versions pv ON pv.id = pvs.version_id
    WHERE pvs.id = vsid;

    INSERT INTO order_items (
      order_id, product_id, version_size_id, slug, name, image, price, size, quantity, is_preorder, preorder_days
    ) VALUES (
      v_order_id,
      derived_product_id,
      vsid,
      item->>'slug',
      item->>'name',
      item->>'image',
      item_price,
      derived_size,
      qty,
      item_is_preorder,
      item_preorder_days
    );
  END LOOP;

  RETURN QUERY SELECT v_order_id, v_subtotal, v_delivery_fee, v_total;
END;
$function$;

-- Explicit, deterministic EXECUTE grants for the checkout RPC: unauthenticated
-- storefront customers (anon) and the service role only. Never PUBLIC, never
-- authenticated-by-default — stated explicitly rather than relied upon
-- implicitly via CREATE OR REPLACE preserving whatever grants happened to
-- already be there.
REVOKE ALL ON FUNCTION public.create_order(text, text, text, text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(text, text, text, text, text, text, text, text, text, text, text, jsonb) TO anon, service_role;

-- adjust_stock: signature changes (product_id/size -> version_size_id), so
-- the old function is dropped and recreated. This is an admin-only
-- inventory mutation — it must NEVER be publicly executable, so grants are
-- set explicitly below rather than left to whatever the default happens to
-- be for a newly created function (which is PUBLIC execute in Postgres).
DROP FUNCTION IF EXISTS public.adjust_stock(text, text, integer, text, text);

CREATE FUNCTION public.adjust_stock(
  p_version_size_id uuid,
  p_quantity_change integer,
  p_reason text,
  p_note text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_qty int;
  new_qty int;
  pid text;
  pname text;
  sz text;
BEGIN
  IF p_quantity_change = 0 THEN
    RAISE EXCEPTION 'Adjustment quantity cannot be zero';
  END IF;

  IF p_reason NOT IN ('damaged', 'missing', 'giveaway', 'correction', 'other') THEN
    RAISE EXCEPTION 'Invalid adjustment reason: %', p_reason;
  END IF;

  SELECT pvs.stock, pvs.size, p.id, p.name
  INTO current_qty, sz, pid, pname
  FROM product_version_sizes pvs
  JOIN product_versions pv ON pv.id = pvs.version_id
  JOIN products p ON p.id = pv.product_id
  WHERE pvs.id = p_version_size_id
  FOR UPDATE OF pvs;

  IF pname IS NULL THEN
    RAISE EXCEPTION 'Product version size % not found', p_version_size_id;
  END IF;

  -- Clamp at 0: an adjustment can reduce stock but never below zero.
  new_qty := GREATEST(0, current_qty + p_quantity_change);

  UPDATE product_version_sizes SET stock = new_qty WHERE id = p_version_size_id;

  INSERT INTO inventory_movements (product_id, version_size_id, product_name, size, change_type, quantity_change, resulting_stock, reason, note)
  VALUES (pid, p_version_size_id, pname, sz, 'adjustment', new_qty - current_qty, new_qty, p_reason, p_note);
END;
$function$;

REVOKE ALL ON FUNCTION public.adjust_stock(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, integer, text, text) TO authenticated, service_role;

-- restock_product: same reasoning as adjust_stock above — admin-only,
-- authenticated + service_role only, never PUBLIC.
DROP FUNCTION IF EXISTS public.restock_product(text, text, integer, text);

CREATE FUNCTION public.restock_product(
  p_version_size_id uuid,
  p_quantity integer,
  p_note text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_qty int;
  new_qty int;
  pid text;
  pname text;
  sz text;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Restock quantity must be positive';
  END IF;

  SELECT pvs.stock, pvs.size, p.id, p.name
  INTO current_qty, sz, pid, pname
  FROM product_version_sizes pvs
  JOIN product_versions pv ON pv.id = pvs.version_id
  JOIN products p ON p.id = pv.product_id
  WHERE pvs.id = p_version_size_id
  FOR UPDATE OF pvs;

  IF pname IS NULL THEN
    RAISE EXCEPTION 'Product version size % not found', p_version_size_id;
  END IF;

  new_qty := current_qty + p_quantity;

  UPDATE product_version_sizes SET stock = new_qty WHERE id = p_version_size_id;

  INSERT INTO inventory_movements (product_id, version_size_id, product_name, size, change_type, quantity_change, resulting_stock, note)
  VALUES (pid, p_version_size_id, pname, sz, 'restock', p_quantity, new_qty, p_note);
END;
$function$;

REVOKE ALL ON FUNCTION public.restock_product(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restock_product(uuid, integer, text) TO authenticated, service_role;

-- restore_stock_on_cancel: same signature, rewritten to restore stock on
-- product_version_sizes instead of products. product_id/size for the
-- inventory_movements log line are taken from order_items, which itself now
-- only ever contains server-derived values from create_order above — never
-- re-derived from anywhere client-controlled here.
CREATE OR REPLACE FUNCTION public.restore_stock_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item record;
  current_qty int;
  new_qty int;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    FOR item IN
      SELECT product_id, version_size_id, name, size, quantity FROM order_items WHERE order_id = NEW.id
    LOOP
      SELECT stock INTO current_qty
      FROM product_version_sizes
      WHERE id = item.version_size_id
      FOR UPDATE;

      -- If the version/size was removed from the catalog since the order
      -- was placed, there's nothing to restore stock on — skip it.
      IF current_qty IS NULL AND NOT EXISTS (SELECT 1 FROM product_version_sizes WHERE id = item.version_size_id) THEN
        CONTINUE;
      END IF;

      current_qty := COALESCE(current_qty, 0);
      new_qty := current_qty + item.quantity;

      UPDATE product_version_sizes SET stock = new_qty WHERE id = item.version_size_id;

      INSERT INTO inventory_movements (product_id, version_size_id, product_name, size, change_type, quantity_change, resulting_stock, reason)
      VALUES (item.product_id, item.version_size_id, item.name, item.size, 'cancellation', item.quantity, new_qty, NEW.order_reference);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_restore_stock_on_cancel
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION restore_stock_on_cancel();

-- get_order_tracking() is functionally untouched — it only reads
-- order_items.name/size/quantity/price/is_preorder/preorder_days, all of
-- which are unchanged on order_items. It is re-defined here purely to add
-- an explicit search_path, per the "every SECURITY DEFINER function" review
-- note; its grants and logic are otherwise identical to what's live today.
CREATE OR REPLACE FUNCTION public.get_order_tracking(
  p_order_reference text,
  p_email text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order orders%ROWTYPE;
  v_items json;
BEGIN
  -- Require at least one contact detail — never allow a reference-only lookup.
  IF p_email IS NULL AND p_phone IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_order
  FROM orders
  WHERE order_reference = p_order_reference
    AND (
      (p_email IS NOT NULL AND email IS NOT NULL AND lower(trim(email)) = lower(trim(p_email)))
      OR
      (p_phone IS NOT NULL AND trim(phone) = trim(p_phone))
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(
    json_build_object(
      'name', name,
      'size', size,
      'quantity', quantity,
      'price', price,
      'is_preorder', is_preorder,
      'preorder_days', preorder_days
    )
    ORDER BY name
  )
  INTO v_items
  FROM order_items
  WHERE order_id = v_order.id;

  RETURN json_build_object(
    'order_reference', v_order.order_reference,
    'status', v_order.status,
    'created_at', v_order.created_at,
    'subtotal', v_order.subtotal,
    'delivery_fee', v_order.delivery_fee,
    'total', v_order.total,
    'items', COALESCE(v_items, '[]'::json)
  );
END;
$function$;

-- ===========================================================================
-- 6. Remove the now-migrated (and, for instagram_link, unused) columns from
--    products (design-level only). Dependent constraints
--    (products_sku_key, products_product_type_check,
--    preorder_days_only_when_preorder, preorder_days_positive_when_present)
--    are dropped automatically along with their columns.
-- ===========================================================================

ALTER TABLE products
  DROP COLUMN product_type,
  DROP COLUMN material,
  DROP COLUMN fit,
  DROP COLUMN care_instructions,
  DROP COLUMN price,
  DROP COLUMN sku,
  DROP COLUMN sizes,
  DROP COLUMN stock,
  DROP COLUMN is_preorder,
  DROP COLUMN preorder_days,
  DROP COLUMN instagram_link;

COMMIT;
