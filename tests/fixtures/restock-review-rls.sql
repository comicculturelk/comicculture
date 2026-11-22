-- Match the existing admin SELECT grants and order visibility policies.
GRANT SELECT ON public.products, public.product_versions, public.product_version_sizes,
  public.orders, public.order_items TO authenticated;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store admins view orders" ON public.orders FOR SELECT TO authenticated
  USING ((SELECT public.is_store_admin()));
CREATE POLICY "Store admins view order items" ON public.order_items FOR SELECT TO authenticated
  USING ((SELECT public.is_store_admin()));
