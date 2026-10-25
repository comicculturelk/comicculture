-- Isolated PostgreSQL fixture: synthetic data only, no credentials or network.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid; $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE TABLE public.store_admins(user_id uuid PRIMARY KEY, is_active boolean NOT NULL);
CREATE FUNCTION public.is_store_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $$
  SELECT EXISTS(SELECT 1 FROM public.store_admins WHERE user_id = auth.uid() AND is_active);
$$;
CREATE SEQUENCE public.product_code_seq;
CREATE TABLE public.collections(id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.products (
  id text PRIMARY KEY, name text, slug text UNIQUE, collection_id uuid REFERENCES collections,
  collection text, product_code text UNIQUE, tagline text, description text, lore text,
  image text, images text[], featured boolean
);
CREATE TABLE public.product_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id text REFERENCES products,
  version_name text, product_type text, material text, fit text, color text, images text[],
  care_instructions text[], is_preorder boolean, preorder_days integer, is_active boolean,
  sort_order integer, size_guide jsonb, UNIQUE(product_id, version_name)
);
CREATE TABLE public.product_version_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version_id uuid REFERENCES product_versions,
  size text, sku text UNIQUE, price numeric CHECK(price >= 0), stock integer CHECK(stock >= 0)
);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_method text, payment_status text,
  status text, order_reference text, receipt_url text, refund_reference text, courier_name text, tracking_number text, tracking_url text
);
CREATE TABLE public.order_notification_state(order_id uuid REFERENCES orders, sent_at timestamptz, notification_token uuid);
CREATE TABLE public.admin_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid, actor_email text, event_type text,
  entity_type text, entity_id text, before_data jsonb, after_data jsonb, note text
);
CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE, discount_type text,
  discount_value numeric, minimum_subtotal numeric, max_redemptions integer,
  usage_count integer NOT NULL DEFAULT 0, starts_at timestamptz, expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.customer_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), review_text text, is_published boolean);
ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.customer_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_reviews TO authenticated;
CREATE POLICY "Store admins manage customer reviews" ON public.customer_reviews FOR ALL TO authenticated
  USING ((SELECT public.is_store_admin())) WITH CHECK ((SELECT public.is_store_admin()));
INSERT INTO public.store_admins VALUES ('00000000-0000-0000-0000-000000000001', true);
INSERT INTO public.collections VALUES ('00000000-0000-0000-0000-000000000010', 'Test collection');
INSERT INTO public.products(id,name,slug,collection_id,collection,product_code) VALUES
  ('test-product','Test product','test-product','00000000-0000-0000-0000-000000000010','Test collection','CC-TEST');
INSERT INTO public.product_versions(id,product_id,version_name,is_active) VALUES
  ('00000000-0000-0000-0000-000000000020','test-product','Cotton',true),
  ('00000000-0000-0000-0000-000000000021','test-product','Jersey',true);
INSERT INTO public.product_version_sizes(id,version_id,size,sku,price,stock) VALUES
  ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020','M','TEST-M',100,4);
INSERT INTO public.customer_reviews(review_text,is_published) VALUES ('Published',true),('Private',false);

CREATE TABLE public.order_items(order_id uuid REFERENCES orders, product_id text, version_size_id uuid REFERENCES product_version_sizes, name text, size text, quantity integer);
CREATE TABLE public.inventory_movements(product_id text, version_size_id uuid, product_name text, size text, change_type text, quantity_change integer, resulting_stock integer, reason text);
