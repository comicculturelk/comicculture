import { supabase } from '../lib/supabase';

export interface Product {
  id: string;
  name: string;
  slug: string;
  collection: string;
  tagline: string;
  description: string;
  lore: string;
  price: number;
  sizes: string[];
  image: string;
  images?: string[];
  instagramLink: string;
  featured?: boolean;
  material?: string;
  fit?: string;
  careInstructions?: string[];
  sku?: string;
}

// Shape of a row as it comes back from Supabase (snake_case column names)
interface ProductRow {
  id: string;
  name: string;
  slug: string;
  collection: string;
  tagline: string;
  description: string;
  lore: string;
  price: number;
  sizes: string[];
  image: string;
  images: string[] | null;
  instagram_link: string;
  featured: boolean;
  material: string | null;
  fit: string | null;
  care_instructions: string[] | null;
}

const DEFAULT_CARE_INSTRUCTIONS = [
  'Machine wash cold with like colors',
  'Do not bleach',
  'Tumble dry low',
  'Do not iron directly on printed graphics',
];

function mapRowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    collection: row.collection,
    tagline: row.tagline,
    description: row.description,
    lore: row.lore,
    price: row.price,
    sizes: row.sizes,
    image: row.image,
    images: row.images ?? undefined,
    instagramLink: row.instagram_link,
    featured: row.featured,
    material: row.material ?? 'Premium breathable polyester mesh',
    fit: row.fit ?? 'True to size, athletic fit',
    careInstructions:
      row.care_instructions && row.care_instructions.length > 0
        ? row.care_instructions
        : DEFAULT_CARE_INSTRUCTIONS,
    sku: `CC-${row.id.toUpperCase()}`,
  };
}

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load products: ${error.message}`);
  }

  return (data ?? []).map(mapRowToProduct);
}

export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load product: ${error.message}`);
  }

  return data ? mapRowToProduct(data) : null;
}

export function formatPrice(price: number): string {
  return `Rs. ${price}`;
}

export function generateWhatsAppMessage(product: Product, size: string, quantity = 1): string {
  const qtyText = quantity > 1 ? `${quantity}x ` : '';
  const message = `Hi! I'd like to order ${qtyText}the ${product.name} jersey in size ${size} from ComicCulture. Is it available?`;
  return encodeURIComponent(message);
}
