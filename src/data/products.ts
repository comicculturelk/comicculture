import { supabase } from '../lib/supabase';
import { uploadFile, deleteFile, getPathFromPublicUrl } from '../lib/storage';

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
  sku: string;
  stock?: Record<string, number>;
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
  sku: string;
  stock: Record<string, number> | null;
}

const DEFAULT_CARE_INSTRUCTIONS = [
  'Machine wash cold with like colors',
  'Do not bleach',
  'Tumble dry low',
  'Do not iron directly on printed graphics',
];

const PRODUCT_IMAGES_BUCKET = 'product-images';

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
    sku: row.sku,
    stock: row.stock ?? {},
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

/** Remaining stock for a given size (0 if unknown/out of stock). */
export function getStockForSize(product: Pick<Product, 'stock'>, size: string): number {
  return product.stock?.[size] ?? 0;
}

/** Whether a given size can currently be ordered. */
export function isSizeInStock(product: Pick<Product, 'stock'>, size: string): boolean {
  return getStockForSize(product, size) > 0;
}

/** Overwrites a product's per-size stock map (admin use only). */
export async function updateProductStock(
  productId: string,
  stock: Record<string, number>
): Promise<void> {
  const { error } = await supabase.from('products').update({ stock }).eq('id', productId);
  if (error) {
    throw new Error(`Failed to update stock: ${error.message}`);
  }
}

// --- Search & filtering (client-side, over already-fetched products) ---

export interface ProductFilters {
  search?: string;
  size?: string | null;
  maxPrice?: number | null;
  featuredOnly?: boolean;
}

export function filterProducts(products: Product[], filters: ProductFilters): Product[] {
  const { search, size, maxPrice, featuredOnly } = filters;
  const query = search?.trim().toLowerCase();

  return products.filter((product) => {
    if (query) {
      const haystack = `${product.name} ${product.collection} ${product.tagline} ${product.description}`
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (size && !product.sizes.includes(size)) return false;
    if (maxPrice != null && product.price > maxPrice) return false;
    if (featuredOnly && !product.featured) return false;
    return true;
  });
}

/** Unique sizes present across a product list, de-duplicated. */
export function getUniqueSizes(products: Product[]): string[] {
  const seen = new Set<string>();
  products.forEach((p) => p.sizes.forEach((s) => seen.add(s)));
  return Array.from(seen);
}

/** Min/max price across a product list. Returns { min: 0, max: 0 } for an empty list. */
export function getPriceBounds(products: Product[]): { min: number; max: number } {
  if (products.length === 0) return { min: 0, max: 0 };
  const prices = products.map((p) => p.price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

// --- Admin: product management (create / edit / delete / duplicate) ---

/**
 * Fields an admin can set when creating or editing a product.
 * `images` is an ordered list — `images[0]` is treated as the primary image
 * and mirrored into the `image` column for storefront compatibility.
 */
export interface ProductInput {
  name: string;
  slug: string;
  sku: string;
  collection: string;
  tagline: string;
  description: string;
  lore: string;
  price: number;
  sizes: string[];
  images: string[];
  featured?: boolean;
  material?: string;
  fit?: string;
  careInstructions?: string[];
  stock?: Record<string, number>;
}

function mapProductInputToRow(input: ProductInput) {
  return {
    name: input.name,
    slug: input.slug,
    sku: input.sku,
    collection: input.collection,
    tagline: input.tagline,
    description: input.description,
    lore: input.lore,
    price: input.price,
    sizes: input.sizes,
    image: input.images[0] ?? '',
    images: input.images,
    // instagram_link is a required legacy column not exposed in the admin form;
    // defaulted to empty string rather than adding it back into the UI.
    instagram_link: '',
    featured: input.featured ?? false,
    material: input.material ?? null,
    fit: input.fit ?? null,
    care_instructions: input.careInstructions ?? null,
    stock: input.stock ?? {},
  };
}

/** Whether a slug is already in use by another product. */
export async function isSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  let query = supabase.from('products').select('id').eq('slug', slug);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Failed to check slug: ${error.message}`);
  }
  return !!data;
}

/** Whether a SKU is already in use by another product. */
export async function isSkuTaken(sku: string, excludeId?: string): Promise<boolean> {
  let query = supabase.from('products').select('id').eq('sku', sku);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Failed to check SKU: ${error.message}`);
  }
  return !!data;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert(mapProductInputToRow(input))
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create product: ${error.message}`);
  }
  return mapRowToProduct(data);
}

export async function updateProduct(id: string, input: ProductInput): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update(mapProductInputToRow(input))
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update product: ${error.message}`);
  }
  return mapRowToProduct(data);
}

/**
 * Deletes a product row, then best-effort cleans up its images from Storage.
 * Image cleanup failures are swallowed (via allSettled) since the product
 * row is already gone by that point — an orphaned file is a minor issue,
 * a stuck delete flow is worse.
 */
export async function deleteProduct(
  product: Pick<Product, 'id' | 'image' | 'images'>
): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', product.id);
  if (error) {
    throw new Error(`Failed to delete product: ${error.message}`);
  }

  const urls =
    product.images && product.images.length > 0
      ? product.images
      : product.image
        ? [product.image]
        : [];

  await Promise.allSettled(urls.map((url) => deleteProductImage(url)));
}

/** Creates a copy of an existing product with a new slug/SKU and a "(Copy)" name suffix. Reuses existing image URLs (no re-upload). */
export async function duplicateProduct(product: Product): Promise<Product> {
  const suffix = Date.now().toString(36);
  return createProduct({
    name: `${product.name} (Copy)`,
    slug: `${product.slug}-copy-${suffix}`,
    sku: `${product.sku}-COPY-${suffix.toUpperCase()}`,
    collection: product.collection,
    tagline: product.tagline,
    description: product.description,
    lore: product.lore,
    price: product.price,
    sizes: product.sizes,
    images: product.images && product.images.length > 0 ? product.images : [product.image],
    featured: false,
    material: product.material,
    fit: product.fit,
    careInstructions: product.careInstructions,
    stock: {},
  });
}

// --- Admin: product image upload (Supabase Storage) ---

/** Uploads a product image to Supabase Storage and returns its public URL. */
export async function uploadProductImage(slug: string, file: File): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `${slug}/${Date.now()}-${safeName}`;
  const { publicUrl } = await uploadFile(PRODUCT_IMAGES_BUCKET, path, file);
  return publicUrl;
}

/** Deletes a product image from Supabase Storage given its public URL. No-ops for URLs outside the managed bucket. */
export async function deleteProductImage(url: string): Promise<void> {
  const path = getPathFromPublicUrl(PRODUCT_IMAGES_BUCKET, url);
  if (!path) return;
  await deleteFile(PRODUCT_IMAGES_BUCKET, path);
}
