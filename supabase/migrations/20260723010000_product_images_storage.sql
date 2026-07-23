-- Create public storage bucket for product images
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Allow public read access to product images (storefront needs to display them)
create policy "Public read access for product images"
on storage.objects for select
using (bucket_id = 'product-images');

-- Allow authenticated admin users to upload product images
create policy "Authenticated users can upload product images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'product-images');

-- Allow authenticated admin users to update product images
create policy "Authenticated users can update product images"
on storage.objects for update
to authenticated
using (bucket_id = 'product-images')
with check (bucket_id = 'product-images');

-- Allow authenticated admin users to delete product images
create policy "Authenticated users can delete product images"
on storage.objects for delete
to authenticated
using (bucket_id = 'product-images');
