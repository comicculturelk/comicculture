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
}

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

export function formatPrice(price: number): string {
  return `Rs. ${price}`;
}

export function generateWhatsAppMessage(product: Product, size: string): string {
  const message = `Hi! I'd like to order the ${product.name} jersey in size ${size} from ComicCulture. Is it available?`;
  return encodeURIComponent(message);
}
