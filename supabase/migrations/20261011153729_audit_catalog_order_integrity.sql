BEGIN;

-- Make product creation safe for every caller while retaining the existing
-- text IDs and leaving all current product/order rows untouched.
ALTER TABLE public.products
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- SKU is a point-in-time sellable-unit identifier. Historical order items
-- remain NULL; this migration does not rewrite existing customer records.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS sku text;

-- The checkout function accepts only a sellable size ID and quantity as
-- catalog input. Names, slugs, images, size labels, SKU, prices, preorder
-- details, and product identity are all read from the database.
CREATE OR REPLACE FUNCTION public.create_order(
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
RETURNS TABLE(order_id uuid, order_reference text, subtotal numeric, delivery_fee numeric, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery_fee CONSTANT numeric := 350;
  v_order_id uuid := gen_random_uuid();
  v_order_reference text;
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
  item_is_active boolean;
  item_preorder_days int;
  item_sku text;
  item_slug text;
  item_image text;
  derived_product_id text;
  derived_size text;
BEGIN
  IF p_payment_method NOT IN ('COD', 'BANK_TRANSFER') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  v_order_reference := 'CC-' || to_char(nextval('order_reference_seq'), 'FM0000000');

  IF p_payment_method = 'BANK_TRANSFER' THEN
    IF p_receipt_url IS NOT NULL AND length(trim(p_receipt_url)) > 0 THEN
      v_payment_status := 'awaiting_verification';
    ELSE
      v_payment_status := 'awaiting_payment';
    END IF;
  ELSE
    v_payment_status := 'pending';
  END IF;

  -- Lock both the inventory row and its version so an admin cannot deactivate
  -- an edition midway through checkout. Any failure rolls back all stock moves.
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) AS entries(value)
  LOOP
    vsid := (item->>'version_size_id')::uuid;
    qty := (item->>'quantity')::int;

    IF qty IS NULL OR qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for version size %', vsid;
    END IF;

    SELECT pvs.stock, pvs.price, p.name, pv.product_id, pvs.size, pv.is_active
    INTO current_qty, item_price, item_name, derived_product_id, derived_size, item_is_active
    FROM public.product_version_sizes AS pvs
    JOIN public.product_versions AS pv ON pv.id = pvs.version_id
    JOIN public.products AS p ON p.id = pv.product_id
    WHERE pvs.id = vsid
    FOR UPDATE OF pvs, pv;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product version size % not found', vsid;
    END IF;
    IF item_is_active IS NULL THEN
      RAISE EXCEPTION 'Product edition is unavailable';
    END IF;
    IF NOT item_is_active THEN
      RAISE EXCEPTION 'This product edition is no longer available';
    END IF;
    IF current_qty < qty THEN
      RAISE EXCEPTION 'Sorry, only % left in size % — please update your cart', current_qty, derived_size;
    END IF;

    new_qty := current_qty - qty;
    UPDATE public.product_version_sizes SET stock = new_qty WHERE id = vsid;
    INSERT INTO public.inventory_movements (
      product_id, version_size_id, product_name, size, change_type,
      quantity_change, resulting_stock, reason
    ) VALUES (
      derived_product_id, vsid, item_name, derived_size, 'sale', -qty,
      new_qty, v_order_reference
    );
    v_subtotal := v_subtotal + (item_price * qty);
  END LOOP;

  v_total := v_subtotal + v_delivery_fee;
  INSERT INTO public.orders (
    id, order_reference, full_name, phone, email, address_line1,
    address_line2, city, district, postal_code, subtotal, delivery_fee,
    total, payment_method, payment_status, receipt_url
  ) VALUES (
    v_order_id, v_order_reference, p_full_name, p_phone, p_email,
    p_address_line1, p_address_line2, p_city, p_district, p_postal_code,
    v_subtotal, v_delivery_fee, v_total, p_payment_method,
    v_payment_status, p_receipt_url
  );

  FOR item IN SELECT value FROM jsonb_array_elements(p_items) AS entries(value)
  LOOP
    vsid := (item->>'version_size_id')::uuid;
    qty := (item->>'quantity')::int;
    SELECT pvs.price, pv.is_preorder, pv.preorder_days, pv.product_id,
           pvs.size, pvs.sku, p.slug, p.name,
           coalesce(nullif(pv.images[1], ''), nullif(p.images[1], ''), nullif(p.image, ''), '')
    INTO item_price, item_is_preorder, item_preorder_days, derived_product_id,
         derived_size, item_sku, item_slug, item_name, item_image
    FROM public.product_version_sizes AS pvs
    JOIN public.product_versions AS pv ON pv.id = pvs.version_id
    JOIN public.products AS p ON p.id = pv.product_id
    WHERE pvs.id = vsid;

    INSERT INTO public.order_items (
      order_id, product_id, version_size_id, slug, name, image, sku,
      price, size, quantity, is_preorder, preorder_days
    ) VALUES (
      v_order_id, derived_product_id, vsid, item_slug, item_name,
      item_image, item_sku, item_price, derived_size, qty,
      item_is_preorder, item_preorder_days
    );
  END LOOP;

  RETURN QUERY SELECT v_order_id, v_order_reference, v_subtotal, v_delivery_fee, v_total;
END;
$function$;

-- Save a complete admin product edit as one transaction. Any invalid row,
-- uniqueness conflict, or stock correction error rolls back the entire save.
CREATE FUNCTION public.save_admin_product(
  p_is_create boolean,
  p_product jsonb,
  p_existing_versions jsonb,
  p_existing_sizes jsonb,
  p_new_existing_sizes jsonb,
  p_new_versions jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product_id text := p_product->>'id';
  v_collection_id uuid := (p_product->>'collectionId')::uuid;
  collection_name text;
  entry jsonb;
  size_entry jsonb;
  version_id uuid;
  current_stock integer;
  target_stock integer;
  affected integer;
BEGIN
  IF auth.uid() IS DISTINCT FROM 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid THEN
    RAISE EXCEPTION 'Not authorized to manage products' USING ERRCODE = '42501';
  END IF;
  IF v_product_id IS NULL OR v_collection_id IS NULL THEN
    RAISE EXCEPTION 'Product ID and collection are required';
  END IF;
  SELECT c.name INTO collection_name FROM public.collections AS c WHERE c.id = v_collection_id;
  IF collection_name IS NULL THEN
    RAISE EXCEPTION 'Selected collection does not exist';
  END IF;

  IF p_is_create THEN
    INSERT INTO public.products (
      id, name, slug, collection_id, collection, tagline, description,
      lore, image, images, featured
    ) VALUES (
      v_product_id, p_product->>'name', p_product->>'slug', v_collection_id,
      collection_name, coalesce(p_product->>'tagline', ''),
      coalesce(p_product->>'description', ''), coalesce(p_product->>'lore', ''),
      coalesce((p_product->'images'->>0), ''),
      ARRAY(SELECT jsonb_array_elements_text(coalesce(p_product->'images', '[]'::jsonb))),
      coalesce((p_product->>'featured')::boolean, false)
    );
  ELSE
    UPDATE public.products
    SET name = p_product->>'name',
        slug = p_product->>'slug',
        collection_id = v_collection_id,
        collection = collection_name,
        tagline = coalesce(p_product->>'tagline', ''),
        description = coalesce(p_product->>'description', ''),
        lore = coalesce(p_product->>'lore', ''),
        image = coalesce((p_product->'images'->>0), ''),
        images = ARRAY(SELECT jsonb_array_elements_text(coalesce(p_product->'images', '[]'::jsonb))),
        featured = coalesce((p_product->>'featured')::boolean, false)
    WHERE id = v_product_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Product no longer exists'; END IF;
  END IF;

  -- Free the unique (product_id, version_name) keys first so admins may
  -- safely exchange two version names in the same save.
  UPDATE public.product_versions AS pv
  SET version_name = '__cc_txn__' || gen_random_uuid()::text
  WHERE pv.product_id = v_product_id
    AND pv.id IN (
      SELECT (rows.value->>'id')::uuid
      FROM jsonb_array_elements(coalesce(p_existing_versions, '[]'::jsonb)) AS rows(value)
    );

  FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(p_existing_versions, '[]'::jsonb)) AS rows(value)
  LOOP
    UPDATE public.product_versions
    SET version_name = entry->>'versionName',
        product_type = entry->>'productType',
        material = nullif(entry->>'material', ''),
        fit = nullif(entry->>'fit', ''),
        color = nullif(entry->>'color', ''),
        images = CASE WHEN jsonb_typeof(entry->'images') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(entry->'images')) ELSE NULL END,
        care_instructions = CASE WHEN jsonb_typeof(entry->'careInstructions') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(entry->'careInstructions')) ELSE NULL END,
        is_preorder = coalesce((entry->>'isPreorder')::boolean, false),
        preorder_days = CASE WHEN coalesce((entry->>'isPreorder')::boolean, false)
          THEN nullif(entry->>'preorderDays', '')::integer ELSE NULL END,
        is_active = coalesce((entry->>'isActive')::boolean, true),
        sort_order = coalesce((entry->>'sortOrder')::integer, 0),
        size_guide = CASE WHEN jsonb_typeof(entry->'sizeGuide') = 'array'
          THEN entry->'sizeGuide' ELSE NULL END
    WHERE id = (entry->>'id')::uuid AND product_id = v_product_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'A product version no longer exists'; END IF;
  END LOOP;

  FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(p_existing_sizes, '[]'::jsonb)) AS rows(value)
  LOOP
    UPDATE public.product_version_sizes AS pvs
    SET sku = entry->>'sku', price = (entry->>'price')::numeric
    FROM public.product_versions AS pv
    WHERE pvs.id = (entry->>'id')::uuid
      AND pvs.version_id = pv.id
      AND pv.product_id = v_product_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'A product size no longer exists'; END IF;

    SELECT pvs.stock INTO current_stock
    FROM public.product_version_sizes AS pvs
    WHERE pvs.id = (entry->>'id')::uuid FOR UPDATE;
    target_stock := greatest(0, coalesce((entry->>'stock')::integer, current_stock));
    IF target_stock <> current_stock THEN
      PERFORM public.adjust_stock(
        (entry->>'id')::uuid,
        target_stock - current_stock,
        'correction',
        'Stock corrected via product editor'
      );
    END IF;
  END LOOP;

  FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(p_new_existing_sizes, '[]'::jsonb)) AS rows(value)
  LOOP
    INSERT INTO public.product_version_sizes (version_id, size, sku, price, stock)
    SELECT (entry->>'versionId')::uuid, entry->>'size', entry->>'sku',
           (entry->>'price')::numeric, greatest(0, coalesce((entry->>'stock')::integer, 0))
    WHERE EXISTS (
      SELECT 1 FROM public.product_versions AS pv
      WHERE pv.id = (entry->>'versionId')::uuid AND pv.product_id = v_product_id
    );
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Could not add a size to this product'; END IF;
  END LOOP;

  FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(p_new_versions, '[]'::jsonb)) AS rows(value)
  LOOP
    INSERT INTO public.product_versions (
      product_id, version_name, product_type, material, fit, color, images,
      care_instructions, is_preorder, preorder_days, is_active, sort_order, size_guide
    ) VALUES (
      v_product_id, entry->>'versionName', entry->>'productType',
      nullif(entry->>'material', ''), nullif(entry->>'fit', ''), nullif(entry->>'color', ''),
      CASE WHEN jsonb_typeof(entry->'images') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(entry->'images')) ELSE NULL END,
      CASE WHEN jsonb_typeof(entry->'careInstructions') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(entry->'careInstructions')) ELSE NULL END,
      coalesce((entry->>'isPreorder')::boolean, false),
      CASE WHEN coalesce((entry->>'isPreorder')::boolean, false)
        THEN nullif(entry->>'preorderDays', '')::integer ELSE NULL END,
      coalesce((entry->>'isActive')::boolean, true),
      coalesce((entry->>'sortOrder')::integer, 0),
      CASE WHEN jsonb_typeof(entry->'sizeGuide') = 'array'
        THEN entry->'sizeGuide' ELSE NULL END
    ) RETURNING id INTO version_id;

    FOR size_entry IN SELECT value FROM jsonb_array_elements(coalesce(entry->'sizes', '[]'::jsonb)) AS sizes(value)
    LOOP
      INSERT INTO public.product_version_sizes (version_id, size, sku, price, stock)
      VALUES (
        version_id, size_entry->>'size', size_entry->>'sku',
        (size_entry->>'price')::numeric,
        greatest(0, coalesce((size_entry->>'stock')::integer, 0))
      );
    END LOOP;
  END LOOP;

  RETURN v_product_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_admin_product(boolean, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_admin_product(boolean, jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated, service_role;


COMMIT;
