-- Additional synthetic volume for visual QA.
INSERT INTO products (id,name,slug) VALUES ('cosmic','Cosmic Sentinel','cosmic'),
  ('wolverine','Weapon X','wolverine'), ('arc','Arc Reactor','arc'),
  ('saiyan','Saiyan Training Club','saiyan'), ('web','Web Slinger','web'), ('vigilante','Night Vigilante','vigilante'),
  ('scarlet','Scarlet Sigil','scarlet');
INSERT INTO product_versions (product_id, version_name, is_active)
SELECT id, CASE WHEN id IN ('cosmic', 'arc') THEN 'Jersey' ELSE 'Heavyweight' END, true
FROM products WHERE id IN ('cosmic', 'wolverine', 'arc', 'saiyan', 'web', 'vigilante', 'scarlet');
INSERT INTO product_version_sizes (version_id, size, sku, price, stock)
SELECT id, CASE WHEN product_id IN ('arc', 'web') THEN 'XL' ELSE 'L' END,
       upper(product_id) || '-TEST', 2300 + length(product_id) * 100, 7
FROM product_versions WHERE product_id IN ('cosmic', 'wolverine', 'arc', 'saiyan', 'web', 'vigilante', 'scarlet');

WITH catalog AS (
  SELECT p.id AS product_id, p.name, s.id AS size_id, s.size, s.price,
    row_number() OVER (ORDER BY p.id, s.id) - 1 AS pos
  FROM products p JOIN product_versions v ON v.product_id = p.id
  JOIN product_version_sizes s ON s.version_id = v.id
  WHERE p.id IN ('test-product', 'noir', 'cosmic', 'wolverine', 'saiyan', 'web', 'vigilante', 'arc', 'scarlet') AND s.sku <> 'TEST-L'
), synthetic AS MATERIALIZED (
  SELECT '58104' || lpad((1000000+n)::text, 7, '0') AS reference,
    ((date_trunc('day', now() AT TIME ZONE 'Asia/Colombo') - (1 + (n * 7) % 29 + CASE WHEN n > 180 THEN 30 ELSE 0 END) * interval '1 day')
       AT TIME ZONE 'Asia/Colombo') + (n % 9) * interval '1 hour' AS created_at,
    CASE WHEN n % 17 = 0 THEN 'pending' WHEN n % 13 = 0 THEN 'shipped' WHEN n % 11 = 0 THEN 'packed'
         WHEN n % 9 = 0 THEN 'confirmed' WHEN n % 19 = 0 THEN 'cancelled' ELSE 'delivered' END AS status,
    CASE WHEN n % 17 = 0 THEN 'awaiting_verification' WHEN n % 19 = 0 THEN 'refunded' WHEN n % 5 = 0 THEN 'pending' ELSE 'paid' END AS payment,
    CASE WHEN n % 17 = 0 OR n % 3 = 0 THEN 'BANK_TRANSFER' ELSE 'COD' END AS method,
    CASE WHEN n % 9 = 0 THEN 200 ELSE 0 END AS discount,
    CASE WHEN n % 7 = 0 THEN 2 ELSE 1 END AS quantity, c.*
  FROM generate_series(1, 331) n JOIN catalog c ON c.pos = (n * 13 + n / 4) % 10
), inserted AS (
  INSERT INTO orders(order_reference, created_at, status, payment_method, payment_status, total, delivery_fee, discount_amount)
  SELECT reference, created_at, status, method, payment, price * quantity + 350 - discount, 350, discount FROM synthetic
  RETURNING id,order_reference
)
INSERT INTO order_items(order_id,product_id,version_size_id,name,size,quantity,price)
SELECT o.id, s.product_id, s.size_id, s.name, s.size, s.quantity, s.price
FROM inserted o JOIN synthetic s ON o.order_reference = s.reference;
