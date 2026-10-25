BEGIN;

-- Replace the legacy fixed-account rules; access now follows current membership.
DROP POLICY IF EXISTS "Published reviews and admin review access" ON public.customer_reviews;
DROP POLICY IF EXISTS "ComicCulture admin inserts customer reviews" ON public.customer_reviews;
DROP POLICY IF EXISTS "ComicCulture admin updates customer reviews" ON public.customer_reviews;
DROP POLICY IF EXISTS "ComicCulture admin deletes customer reviews" ON public.customer_reviews;
-- The existing membership-based ALL policy remains the private read/write rule.
CREATE POLICY "Published customer reviews are public" ON public.customer_reviews
  FOR SELECT TO anon, authenticated USING (is_published);

-- Catalog saves must preserve stock changed by checkout or Inventory, including
-- stale clients still sending a stock field. New-size opening stock is retained.
CREATE OR REPLACE FUNCTION public.save_admin_product(p_is_create boolean, p_product jsonb, p_existing_versions jsonb, p_existing_sizes jsonb, p_new_existing_sizes jsonb, p_new_versions jsonb)
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
  affected integer;
BEGIN
  IF NOT public.is_store_admin() THEN
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
      id, name, slug, collection_id, collection, product_code, tagline, description,
      lore, image, images, featured
    ) VALUES (
      v_product_id, p_product->>'name', p_product->>'slug', v_collection_id,
      collection_name, p_product->>'productCode', coalesce(p_product->>'tagline', ''),
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
    )
    AND pv.version_name IS DISTINCT FROM (
      SELECT rows.value->>'versionName'
      FROM jsonb_array_elements(coalesce(p_existing_versions, '[]'::jsonb)) AS rows(value)
      WHERE (rows.value->>'id')::uuid = pv.id
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

    -- Retained stock is managed only by Inventory delta actions, never catalog saves.

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


-- Both redemption and admin edits lock the same promo row. An edit that waits
-- behind the first redemption observes OLD.usage_count > 0 and is rejected.
CREATE OR REPLACE FUNCTION public.protect_used_promo_terms()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.usage_count > 0 AND
    ROW(NEW.code, NEW.discount_type, NEW.discount_value, NEW.minimum_subtotal,
        NEW.max_redemptions, NEW.starts_at, NEW.expires_at)
    IS DISTINCT FROM
    ROW(OLD.code, OLD.discount_type, OLD.discount_value, OLD.minimum_subtotal,
        OLD.max_redemptions, OLD.starts_at, OLD.expires_at)
  THEN
    RAISE EXCEPTION 'Used promo terms are locked. Create a new code instead.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_used_promo_terms() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_used_promo_terms BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.protect_used_promo_terms();

-- Preserve the column default and privileged internal callers while preventing
-- non-admin authenticated users from consuming product codes directly.
CREATE OR REPLACE FUNCTION public.next_product_code()
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_store_admin() AND coalesce(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  RETURN 'CC-P' || lpad(nextval('public.product_code_seq')::text, 6, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_product_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_product_code() TO authenticated, service_role;

-- Reopen existing proof for a deliberate second review; never mark it paid
-- here, replace receipt files, or bypass the existing verification transition.
CREATE OR REPLACE FUNCTION public.admin_reopen_payment_review(p_order_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders%rowtype;
BEGIN
  IF NOT public.is_store_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  IF length(trim(coalesce(p_note, ''))) < 3 THEN RAISE EXCEPTION 'Explain why this payment needs another review'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.payment_method IS DISTINCT FROM 'BANK_TRANSFER' OR o.status <> 'pending'
     OR o.payment_status <> 'failed' OR nullif(trim(o.receipt_url), '') IS NULL THEN
    RAISE EXCEPTION 'Only a pending rejected bank transfer with existing proof can be reopened';
  END IF;
  UPDATE public.orders SET payment_status = 'awaiting_verification' WHERE id = p_order_id;
  INSERT INTO public.admin_activity_log(actor_id, actor_email, event_type, entity_type, entity_id, before_data, after_data, note)
  VALUES (auth.uid(), auth.jwt()->>'email', 'order_payment_review_reopened', 'order', p_order_id::text,
    jsonb_build_object('payment_status', o.payment_status),
    jsonb_build_object('payment_status', 'awaiting_verification'), trim(p_note));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reopen_payment_review(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reopen_payment_review(uuid,text) TO authenticated, service_role;

-- Expose notification confirmation only, never private tokens or lock fields.
CREATE OR REPLACE FUNCTION public.admin_order_notification_status(p_order_ids uuid[])
RETURNS TABLE(order_id uuid, sent_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_store_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT n.order_id, n.sent_at
    FROM public.order_notification_state n WHERE n.order_id = ANY(p_order_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_order_notification_status(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_order_notification_status(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_verify_order_payment(p_order_id uuid, p_outcome text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.orders%rowtype; next_status text;
BEGIN
  IF NOT public.is_store_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('paid','failed') THEN RAISE EXCEPTION 'Invalid payment outcome'; END IF;
  IF p_outcome = 'failed' AND length(trim(coalesce(p_note, ''))) < 3 THEN
    RAISE EXCEPTION 'Enter a payment rejection reason';
  END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.payment_method IS DISTINCT FROM 'BANK_TRANSFER' OR o.payment_status <> 'awaiting_verification' OR o.status <> 'pending' THEN
    RAISE EXCEPTION 'This order is not awaiting payment verification';
  END IF;
  next_status := CASE WHEN p_outcome = 'paid' THEN 'confirmed' ELSE o.status END;
  UPDATE public.orders SET payment_status = p_outcome, status = next_status WHERE id = p_order_id;
  INSERT INTO public.admin_activity_log(actor_id, actor_email, event_type, entity_type, entity_id, before_data, after_data, note)
  VALUES (auth.uid(), auth.jwt()->>'email', 'order_payment_verified', 'order', p_order_id::text,
    jsonb_build_object('payment_status', o.payment_status, 'status', o.status),
    jsonb_build_object('payment_status', p_outcome, 'status', next_status), p_note);
END;
$function$;

COMMIT;
