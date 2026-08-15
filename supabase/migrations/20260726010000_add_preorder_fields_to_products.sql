-- Add product-level pre-order support (Phase 1: database only).
-- Pre-orders are a property of an existing product row; no new table.

alter table products
  add column is_preorder boolean not null default false;

alter table products
  add column preorder_days integer null;

-- Guard rails:
-- 1. When preorder_days is provided, it must be a positive whole number
--    of days (0 or negative doesn't make sense as a wait time).
-- 2. preorder_days must be null for any product that isn't a pre-order,
--    so a product can't carry a stale/meaningless value after being
--    switched back to normal stock. This keeps the two columns
--    consistent with each other at the database level regardless of
--    what the application layer does.
alter table products
  add constraint preorder_days_positive_when_present
    check (preorder_days is null or preorder_days > 0);

alter table products
  add constraint preorder_days_only_when_preorder
    check (is_preorder = true or preorder_days is null);

comment on column products.is_preorder is 'Whether this product is currently sold as a pre-order.';
comment on column products.preorder_days is 'Expected pre-order fulfillment window in days. Null unless is_preorder is true.';
