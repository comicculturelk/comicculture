-- Orders + order items for ComicCulture checkout
-- Run this in the Supabase SQL editor (or via CLI migration).

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique,
  full_name text not null,
  phone text not null,
  email text,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  district text not null,
  postal_code text,
  subtotal numeric not null,
  delivery_fee numeric not null,
  total numeric not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id text not null,
  slug text not null,
  name text not null,
  image text,
  price numeric not null,
  size text not null,
  quantity integer not null
);

create index if not exists order_items_order_id_idx on order_items(order_id);

-- RLS: the storefront uses the anon key, so allow anonymous inserts
-- (customers creating their own order) but block reads/updates/deletes
-- from the client so order data + customer PII isn't publicly readable.
alter table orders enable row level security;
alter table order_items enable row level security;

create policy "Anyone can create an order"
  on orders for insert
  to anon
  with check (true);

create policy "Anyone can add items to an order"
  on order_items for insert
  to anon
  with check (true);

-- No select/update/delete policies are created for the anon role,
-- so orders are write-only from the storefront. Manage/view orders
-- from the Supabase dashboard or a service-role backend.
