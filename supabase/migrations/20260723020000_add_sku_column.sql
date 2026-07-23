-- Promote SKU to a real, editable column.
-- Previously it was derived client-side as `CC-{id}` and never stored.

alter table products add column if not exists sku text;

-- Backfill existing rows with their previously-derived value so nothing breaks
update products
set sku = 'CC-' || upper(id::text)
where sku is null;

alter table products alter column sku set not null;

-- Enforce uniqueness at the DB level (existing backfilled values are already
-- unique since they're derived from the unique id column)
alter table products add constraint products_sku_key unique (sku);
