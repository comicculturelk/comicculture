/*
  # Create products table

  1. New Tables
    - `products`
      - `id` (text, primary key) - URL-friendly id used across the app (e.g. 'classic-red')
      - `name` (text) - Display name (e.g. 'The Classic Red')
      - `slug` (text, unique) - URL slug, kept separate from id for future product detail pages
      - `collection` (text) - e.g. 'Drop 01'
      - `tagline` (text) - Short badge text shown on the product card
      - `description` (text) - Full product description
      - `lore` (text) - Short italicized flavor text
      - `price` (numeric) - Price in LKR
      - `sizes` (text[]) - Available sizes
      - `image` (text) - Primary image path
      - `images` (text[], nullable) - Additional gallery images
      - `instagram_link` (text) - Instagram link shown for this product
      - `featured` (boolean, default false) - Whether to highlight this product
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `products` table
    - Add a policy allowing anyone (anon + authenticated) to SELECT products,
      since this is a public storefront catalog
    - No insert/update/delete policies are added — product management happens
      via the Supabase dashboard (or a future admin tool using the service
      role key), never from the public client

  3. Seed data
    - Inserts the 6 products currently hardcoded in the site, so the switch
      from static data to Supabase is a no-op for what visitors see
*/

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  collection text NOT NULL,
  tagline text NOT NULL,
  description text NOT NULL,
  lore text NOT NULL,
  price numeric NOT NULL,
  sizes text[] NOT NULL DEFAULT '{}',
  image text NOT NULL,
  images text[],
  instagram_link text NOT NULL,
  featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Products are viewable by everyone"
  ON products
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO products (id, name, slug, collection, tagline, description, lore, price, sizes, image, instagram_link, featured)
VALUES
  ('classic-red', 'The Classic Red', 'classic-red', 'Drop 01', 'The Original',
   'Premium football jersey inspired by the classic Spider-Man suit. Features breathable mesh fabric with iconic web pattern embroidery.',
   'The suit that started everything.', 3399, ARRAY['S','M','L','XL','XXL'],
   '/images/products/classic-red/front.webp', 'https://instagram.com/comicculture.lk', true),

  ('upgraded-black', 'The Upgraded Black', 'upgraded-black', 'Drop 01', 'Evolution',
   'Sleek black variant with red accents. Made with premium moisture-wicking fabric for ultimate comfort.',
   'The evolution of a legend.', 3399, ARRAY['S','M','L','XL','XXL'],
   '/images/products/upgraded-black/front.webp', 'https://instagram.com/comicculture.lk', true),

  ('symbiotic-suit', 'The Symbiotic Suit', 'symbiotic-suit', 'Drop 01', 'Dark Power',
   'All-black design with subtle white spider emblem. Premium heavyweight fabric with a matte finish.',
   'Forged from darkness. Built for domination.', 3399, ARRAY['S','M','L','XL','XXL'],
   '/images/products/symbiotic-suit/front.webp', 'https://instagram.com/comicculture.lk', false),

  ('classic-gwen', 'The Classic Gwen', 'classic-gwen', 'Drop 01', 'Spider-Gwen',
   'White and pink design inspired by Spider-Gwen. Lightweight fabric with hood-style collar detail.',
   'Grace, speed and precision.', 3399, ARRAY['S','M','L','XL','XXL'],
   '/images/products/classic-gwen/front.webp', 'https://instagram.com/comicculture.lk', true),

  ('volt-spider', 'The Volt Spider', 'volt-spider', 'Drop 01', 'Electric',
   'Neon yellow and black design with electric accents. Reflective details that glow under UV light.',
   'Powered by pure energy.', 3399, ARRAY['S','M','L','XL','XXL'],
   '/images/products/volt-spider/front.webp', 'https://instagram.com/comicculture.lk', false),

  ('noir-spider', 'The Noir Spider', 'noir-spider', 'Drop 01', 'Dark Hero',
   'Black and white noir-inspired design. Vintage wash finish with distressed details.',
   'Darkness hides the strongest heroes.', 3399, ARRAY['S','M','L','XL','XXL'],
   '/images/products/noir-spider/front.webp', 'https://instagram.com/comicculture.lk', false)
ON CONFLICT (id) DO NOTHING;
