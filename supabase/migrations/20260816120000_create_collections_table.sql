-- Phase 8A: Collections database foundation
-- Additive only. Does not modify or drop products.collection, orders,
-- order_items, inventory, tracking RPCs, or Edge Functions.

-- 1. Create collections table
create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  tagline text,
  description text,
  cover_image text,
  status text not null default 'live',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 2. RLS
alter table collections enable row level security;

create policy "Collections are viewable by everyone"
  on collections
  for select
  to anon, authenticated
  using (true);

create policy "Authenticated users can insert collections"
  on collections
  for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update collections"
  on collections
  for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete collections"
  on collections
  for delete
  to authenticated
  using (true);

-- 3. Add nullable FK on products (existing products.collection is untouched)
alter table products
  add column if not exists collection_id uuid references collections(id);

-- Supporting index for the FK column (standard practice, avoids seq scans
-- once storefront/admin start querying products by collection_id).
create index if not exists idx_products_collection_id
  on products (collection_id);

-- 4. Seed known existing collections
-- Slugs are hand-derived here (only two known values) rather than via a
-- generated slugify function, keeping this migration free of new functions.
insert into collections (name, slug, status, sort_order)
values
  ('Web-Slinger Saga', 'web-slinger-saga', 'live', 0),
  ('Doomsday', 'doomsday', 'live', 1)
on conflict (slug) do nothing;

-- 5. Backfill products.collection_id from existing products.collection
-- Normalized (trim + lower) match, per requirement. Only touches rows
-- that don't already have a collection_id set, so this migration is safe
-- to re-run.
update products p
set collection_id = c.id
from collections c
where p.collection_id is null
  and trim(lower(p.collection)) = trim(lower(c.name));
