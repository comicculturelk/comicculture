-- Snapshot pre-order status onto order_items at the time of purchase, so
-- historical orders don't depend on a product's current pre-order settings
-- (Phase 5: database only).

alter table order_items
  add column is_preorder boolean not null default false;

alter table order_items
  add column preorder_days integer null;

-- Same guard rails as products.is_preorder / products.preorder_days:
-- 1. A stored day count must be a positive whole number.
-- 2. A day count can only be present on a row that was actually a
--    pre-order at the time of the order.
alter table order_items
  add constraint order_items_preorder_days_positive_when_present
    check (preorder_days is null or preorder_days > 0);

alter table order_items
  add constraint order_items_preorder_days_only_when_preorder
    check (is_preorder = true or preorder_days is null);

comment on column order_items.is_preorder is 'Snapshot of the product''s is_preorder flag at the time this order item was created.';
comment on column order_items.preorder_days is 'Snapshot of the product''s preorder_days at the time this order item was created. Null unless is_preorder is true.';

-- Existing rows backfill as is_preorder = false / preorder_days = null via
-- the column default, which is correct: the pre-order feature didn't exist
-- when those orders were placed, so they were not pre-orders.
