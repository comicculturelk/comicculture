/*
# Create products table

1. New Tables
   - `products`
     - `id` (uuid, primary key, auto-generated)
     - `name` (text, not null) — product display name
     - `artisan` (text, not null) — creator/maker name
     - `price_cents` (integer, not null) — price in cents to avoid floating-point errors
     - `image` (text, not null) — URL to product image
     - `badge` (text, nullable) — optional label like "Best Seller", "New", "Eco"
     - `rating` (numeric(2,1), default 0) — 0.0–5.0 rating with one decimal
     - `created_at` (timestamptz, default now()) — auto-set insertion timestamp

2. Security
   - Enable RLS on `products`.
   - SELECT: open to anon + authenticated (public product catalog).
   - INSERT/UPDATE/DELETE: restricted to authenticated users only (future admin).

3. Seed Data
   - 8 artisan products matching the previous mock data, with prices in cents.
*/

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  artisan text NOT NULL,
  price_cents integer NOT NULL,
  image text NOT NULL,
  badge text,
  rating numeric(2,1) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_products" ON products;
CREATE POLICY "public_select_products" ON products FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_products" ON products;
CREATE POLICY "authenticated_insert_products" ON products FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_products" ON products;
CREATE POLICY "authenticated_update_products" ON products FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_products" ON products;
CREATE POLICY "authenticated_delete_products" ON products FOR DELETE
  TO authenticated USING (true);

INSERT INTO products (name, artisan, price_cents, image, badge, rating) VALUES
  ('Handwoven Jute Basket', 'Maya Textiles', 3800,
   'https://images.pexels.com/photos/6195125/pexels-photo-6195125.jpeg?auto=compress&cs=tinysrgb&w=600',
   'Best Seller', 4.8),
  ('Ceramic Moon Vase', 'Clay & Craft Studio', 5200,
   'https://images.pexels.com/photos/6194127/pexels-photo-6194127.jpeg?auto=compress&cs=tinysrgb&w=600',
   'New', 4.9),
  ('Organic Soy Candle Set', 'Glow & Co.', 2900,
   'https://images.pexels.com/photos/6195169/pexels-photo-6195169.jpeg?auto=compress&cs=tinysrgb&w=600',
   'Eco', 4.7),
  ('Macramé Wall Hanging', 'Knot & Thread', 6500,
   'https://images.pexels.com/photos/6194083/pexels-photo-6194083.jpeg?auto=compress&cs=tinysrgb&w=600',
   NULL, 4.6),
  ('Hand-Poured Beeswax Candle', 'Honeybee Workshop', 2400,
   'https://images.pexels.com/photos/6195147/pexels-photo-6195147.jpeg?auto=compress&cs=tinysrgb&w=600',
   NULL, 4.5),
  ('Reclaimed Wood Tray', 'Urban Timber Co.', 7800,
   'https://images.pexels.com/photos/6195170/pexels-photo-6195170.jpeg?auto=compress&cs=tinysrgb&w=600',
   'Best Seller', 4.8),
  ('Linen Embroidered Pillow', 'Stitch & Stone', 4500,
   'https://images.pexels.com/photos/6195105/pexels-photo-6195105.jpeg?auto=compress&cs=tinysrgb&w=600',
   'New', 4.7),
  ('Artisan Soap Collection', 'Herb & Petal', 2200,
   'https://images.pexels.com/photos/6195120/pexels-photo-6195120.jpeg?auto=compress&cs=tinysrgb&w=600',
   'Eco', 4.9)
ON CONFLICT DO NOTHING;
