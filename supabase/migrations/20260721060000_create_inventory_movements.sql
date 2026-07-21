-- Inventory movement history for ComicCulture
-- Replaces the Excel "Sales / Restock Log / Stock Adjustment" tabs with a
-- single append-only audit table. Every stock change (sale, restock,
-- adjustment, or cancellation restore) writes one row here.
-- Run this in the Supabase SQL editor (or via CLI migration).

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,
  product_name text not null, -- denormalized so history stays readable if a product is later renamed/removed
  size text not null,
  change_type text not null check (change_type in ('sale', 'restock', 'adjustment', 'cancellation')),
  quantity_change integer not null, -- signed: negative for sale, positive for restock/cancellation, +/- for adjustment
  resulting_stock integer not null, -- stock level for that size immediately after this movement
  reason text, -- adjustments: 'damaged' | 'missing' | 'giveaway' | 'correction' | 'other'; sales/cancellations: order_reference
  note text, -- optional free-text note from admin
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_product_id_idx on inventory_movements(product_id);
create index if not exists inventory_movements_created_at_idx on inventory_movements(created_at desc);
create index if not exists inventory_movements_change_type_idx on inventory_movements(change_type);

-- RLS: only admins (authenticated) can read movement history.
-- No insert/update/delete policies are added for any role — every row is
-- written exclusively by SECURITY DEFINER functions (see the two migrations
-- that follow), which bypass RLS as the function owner. This guarantees the
-- audit trail can't be tampered with or bypassed from the client.
alter table inventory_movements enable row level security;

create policy "Authenticated users can view inventory movements"
  on inventory_movements for select
  to authenticated
  using (true);
