UPDATE products SET name = 'Shibuya Collection Tee' WHERE id = 'test-product';
UPDATE product_version_sizes SET stock = 2 WHERE sku = 'TEST-M';
INSERT INTO products (id,name,slug) VALUES
  ('noir','Gotham Noir','noir'), ('moon','Moon Knight','moon'), ('spider','Spider-Verse','spider'),
  ('void','The Void','void'), ('retired','Retired drop','retired'), ('new-drop','Midnight Archive','new-drop');
UPDATE products SET created_at = now() - interval '2 days' WHERE id = 'new-drop';

INSERT INTO product_versions(id,product_id,version_name,is_active) VALUES
  ('00000000-0000-0000-0000-000000000022','noir','Cotton',true),
  ('00000000-0000-0000-0000-000000000023','moon','Oversized',true),
  ('00000000-0000-0000-0000-000000000024','spider','Classic',true),
  ('00000000-0000-0000-0000-000000000025','void','Cotton',true),
  ('00000000-0000-0000-0000-000000000026','retired','Discontinued',false),
  ('00000000-0000-0000-0000-000000000027','new-drop','Classic',true);
INSERT INTO product_version_sizes(id,version_id,size,sku,price,stock) VALUES
  ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000021','L','TEST-J-L',2200,12),
  ('00000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000022','M','NOIR-M',2500,8),
  ('00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000023','XL','MOON-XL',2900,1),
  ('00000000-0000-0000-0000-000000000034','00000000-0000-0000-0000-000000000024','S','SPIDER-S',2300,20),
  ('00000000-0000-0000-0000-000000000035','00000000-0000-0000-0000-000000000025','M','VOID-M',2700,0),
  ('00000000-0000-0000-0000-000000000036','00000000-0000-0000-0000-000000000026','M','RETIRED-M',2000,0),
  ('00000000-0000-0000-0000-000000000037','00000000-0000-0000-0000-000000000027','S','ARCHIVE-S',2400,14),
  ('00000000-0000-0000-0000-000000000038','00000000-0000-0000-0000-000000000020','L','TEST-L',2400,0);

-- Set test timestamps from Colombo midnight even if the session timezone differs.
SET TIME ZONE 'America/New_York';
WITH local_clock AS (
  SELECT now() AS instant, date_trunc('day', now() AT TIME ZONE 'Asia/Colombo') AT TIME ZONE 'Asia/Colombo' AS midnight
), cases (ref, day_offset, clock_share, status, payment_status, method, total, discount) AS (
  VALUES
    ('583104927618', 0, 0.80, 'delivered', 'paid', 'COD', 4850, 200),
    ('CC-0000201', 0, 0.00, 'confirmed', 'pending', 'COD', 4750, 0),
    ('CC-ABCDE01234564ABC8123456789ABCDEF', 1, 0.50, 'delivered', 'pending', 'COD', 3250, 0),
    ('CC-0000203', 1, 1.01, 'shipped', 'paid', 'BANK_TRANSFER', 5150, 400),
    ('CC-0000204', 3, 0.50, 'cancelled', 'refunded', 'BANK_TRANSFER', 5350, 0),
    ('CC-0000205', 4, 0.50, 'pending', 'failed', 'BANK_TRANSFER', 3350, 0),
    ('CC-0000206', 5, 0.50, 'pending', 'awaiting_verification', 'BANK_TRANSFER', 5350, 0),
    ('CC-0000207', 8, 0.50, 'pending', 'awaiting_payment', 'BANK_TRANSFER', 3350, 0),
    ('CC-0000208', 9, 0.50, 'delivered', 'refunded', 'COD', 3350, 0),
    ('CC-0000209', 30, 0.50, 'delivered', 'paid', 'BANK_TRANSFER', 4350, 0),
    ('CC-0000210', 112, 0.50, 'delivered', 'paid', 'COD', 8350, 0)
)
INSERT INTO orders(order_reference, created_at, status, payment_status, payment_method, total, delivery_fee, discount_amount)
SELECT ref, midnight - day_offset * interval '24 hours' + (instant - midnight) * clock_share::float8, status,
       payment_status, method, total, 350, discount
FROM cases CROSS JOIN local_clock;

WITH snapshots (ref, size_id, product, name, size, quantity, price) AS (
  VALUES
    ('583104927618', 30, 'test-product', 'Shibuya Incident', 'M', 2, 2350),
    ('CC-0000201', 31, 'test-product', 'Shibuya Original', 'L', 2, 2200),
    ('CC-ABCDE01234564ABC8123456789ABCDEF', 33, 'moon', 'Moon Knight', 'XL', 1, 2900),
    ('CC-0000203', 30, 'test-product', 'Shibuya Original', 'M', 2, 2400),
    ('CC-0000204', 34, 'spider', 'Spider-Verse', 'S', 2, 2500),
    ('CC-0000205', 34, 'spider', 'Spider-Verse', 'S', 1, 3000),
    ('CC-0000206', 32, 'noir', 'Shibuya Incident', 'M', 2, 2500),
    ('CC-0000208', 34, 'spider', 'Spider-Verse', 'S', 1, 3000),
    ('CC-0000209', 30, 'test-product', 'Shibuya Original', 'M', 2, 2000),
    ('CC-0000210', 31, 'test-product', 'Shibuya Original', 'L', 4, 2000)
)
INSERT INTO order_items(order_id,version_size_id,product_id,name,size,quantity,price)
SELECT orders.id, ('00000000-0000-0000-0000-0000000000' || size_id)::uuid, product, name, size, quantity, price
FROM snapshots JOIN orders ON order_reference = ref;
