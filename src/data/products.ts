import { supabase } from '../lib/supabase';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { uploadFile, deleteFile, getPathFromPublicUrl } from '../lib/storage';
import { fetchCollectionById } from './collections';

/**
 * Structured apparel category, replacing free-text guessing from
 * `material`/`fit`. Mirrors the `product_versions_product_type_check`
 * constraint in supabase/migrations — add new values in both places
 * together. Lives on `product_versions` now (Phase 2A model), not on the
 * product itself, since different versions of the same design can be
 * different garment types (e.g. a Spider-Man tee vs. a Spider-Man jersey).
 */
export type ProductType = 'regular_tshirt' | 'oversized_tshirt' | 'jersey' | 'polo' | 'hoodie';

export const PRODUCT_TYPES: ProductType[] = [
  'regular_tshirt',
  'oversized_tshirt',
  'jersey',
  'polo',
  'hoodie',
];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  regular_tshirt: 'Regular T-Shirt',
  oversized_tshirt: 'Oversized T-Shirt',
  jersey: 'Jersey',
  polo: 'Polo',
  hoodie: 'Hoodie',
};

/** Canonical display order for garment sizes. Anything not in this list sorts after, alphabetically. */
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

function compareSizes(a: string, b: string): number {
  const ai = SIZE_ORDER.indexOf(a);
  const bi = SIZE_ORDER.indexOf(b);
  if (ai === -1 && bi === -1) return a.localeCompare(b);
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}

/** The sellable unit: one size of one product version, with its own SKU/price/stock. */
export interface ProductVersionSize {
  id: string;
  versionId: string;
  size: string;
  sku: string;
  price: number;
  stock: number;
  createdAt: string;
}

/** A specific apparel offering of a product (e.g. "Jersey", "Oversized — Black"). */
export interface ProductVersion {
  id: string;
  productId: string;
  versionName: string;
  productType: ProductType;
  material?: string;
  fit?: string;
  color?: string;
  images?: string[];
  careInstructions?: string[];
  isPreorder: boolean;
  preorderDays?: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  sizes: ProductVersionSize[];
}

/** The design/story-level entity — a comic character/theme, independent of any particular garment. */
export interface Product {
  id: string;
  name: string;
  slug: string;
  collection: string;
  collectionId: string | null;
  tagline: string;
  description: string;
  lore: string;
  image: string;
  images?: string[];
  featured?: boolean;
  createdAt: string;
  versions: ProductVersion[];
}

// --- Row shapes as they come back from Supabase (snake_case column names) ---

interface ProductVersionSizeRow {
  id: string;
  version_id: string;
  size: string;
  sku: string;
  price: number;
  stock: number;
  created_at: string;
}

interface ProductVersionRow {
  id: string;
  product_id: string;
  version_name: string;
  product_type: ProductType;
  material: string | null;
  fit: string | null;
  color: string | null;
  images: string[] | null;
  care_instructions: string[] | null;
  is_preorder: boolean;
  preorder_days: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  // Present only when fetched via the nested product select below.
  sizes?: ProductVersionSizeRow[];
}

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  collection: string;
  collection_id: string | null;
  tagline: string;
  description: string;
  lore: string;
  image: string;
  images: string[] | null;
  featured: boolean;
  created_at: string;
  // Present only when fetched via the nested select below.
  versions?: ProductVersionRow[];
}

const DEFAULT_CARE_INSTRUCTIONS = [
  'Machine wash cold with like colors',
  'Do not bleach',
  'Tumble dry low',
  'Do not iron directly on printed graphics',
];

const PRODUCT_IMAGES_BUCKET = 'product-images';

/**
 * Nested select shape for `products`, pulling in every version and every
 * size row for each version in a single round trip. Ordering is applied
 * client-side in the mapping functions below (sort_order for versions,
 * canonical size order for sizes) rather than via `.order(..., { foreignTable })`,
 * to keep this resilient to supabase-js version differences on nested ordering.
 */
const PRODUCT_SELECT = `
  *,
  versions:product_versions (
    *,
    sizes:product_version_sizes (*)
  )
`;

function mapRowToVersionSize(row: ProductVersionSizeRow): ProductVersionSize {
  return {
    id: row.id,
    versionId: row.version_id,
    size: row.size,
    sku: row.sku,
    price: row.price,
    stock: row.stock,
    createdAt: row.created_at,
  };
}

function mapRowToVersion(row: ProductVersionRow): ProductVersion {
  return {
    id: row.id,
    productId: row.product_id,
    versionName: row.version_name,
    productType: row.product_type,
    material: row.material ?? undefined,
    fit: row.fit ?? undefined,
    color: row.color ?? undefined,
    images: row.images ?? undefined,
    careInstructions:
      row.care_instructions && row.care_instructions.length > 0
        ? row.care_instructions
        : DEFAULT_CARE_INSTRUCTIONS,
    isPreorder: row.is_preorder,
    preorderDays: row.preorder_days ?? undefined,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    sizes: (row.sizes ?? [])
      .slice()
      .sort((a, b) => compareSizes(a.size, b.size))
      .map(mapRowToVersionSize),
  };
}

function mapRowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    collection: row.collection,
    collectionId: row.collection_id ?? null,
    tagline: row.tagline,
    description: row.description,
    lore: row.lore,
    image: row.image,
    images: row.images ?? undefined,
    featured: row.featured,
    createdAt: row.created_at,
    versions: (row.versions ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapRowToVersion),
  };
}

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load products: ${error.message}`);
  }

  return ((data ?? []) as unknown as ProductRow[]).map(mapRowToProduct);
}

export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load product: ${error.message}`);
  }

  return data ? mapRowToProduct(data as unknown as ProductRow) : null;
}

export function formatPrice(price: number): string {
  return `Rs. ${price.toLocaleString('en-US')}`;
}

/**
 * Human-readable pre-order delivery message, e.g. "Delivery within 14 days".
 * Pre-order status now lives on the product VERSION (not the product), since
 * one version of a design can be in stock while another is pre-order only.
 * Returns null when the version isn't a pre-order, or has no valid
 * timeframe set — callers should never render null/0/undefined to customers.
 */
export function getPreorderMessage(
  version: Pick<ProductVersion, 'isPreorder' | 'preorderDays'>
): string | null {
  if (!version.isPreorder) return null;
  const days = version.preorderDays;
  if (!days || days <= 0) return null;
  return `Delivery within ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Normalizes raw pre-order fields into a consistent DB-ready pair —
 * preorder_days is always forced to null when is_preorder is false,
 * mirroring the product_versions/order_items CHECK constraints. Shared by
 * any write path (admin version form, order item snapshotting) so this
 * rule lives in one place.
 */
export function derivePreorderSnapshot(
  isPreorder: boolean,
  preorderDays: number | null | undefined
): { is_preorder: boolean; preorder_days: number | null } {
  return {
    is_preorder: isPreorder,
    preorder_days: isPreorder ? (preorderDays ?? null) : null,
  };
}

export function generateWhatsAppMessage(product: Pick<Product, 'name'>, size: string, quantity = 1): string {
  const qtyText = quantity > 1 ? `${quantity}x ` : '';
  const message = `Hi! I'd like to order ${qtyText}the ${product.name} in size ${size} from ComicCulture. Is it available?`;
  return encodeURIComponent(message);
}

/**
 * Remaining stock for a given size within a specific product VERSION
 * (0 if unknown/out of stock). Stock is scoped to a version+size now, not
 * to the product as a whole, since e.g. the Jersey and the Hoodie of the
 * same design carry independent stock.
 */
export function getStockForSize(version: Pick<ProductVersion, 'sizes'>, size: string): number {
  return version.sizes.find((s) => s.size === size)?.stock ?? 0;
}

/** Whether a given size of a given version can currently be ordered. */
export function isSizeInStock(version: Pick<ProductVersion, 'sizes'>, size: string): boolean {
  return getStockForSize(version, size) > 0;
}

/**
 * Overwrites the stock for a single product_version_sizes row (admin use
 * only). Previously this took a productId + a whole per-size stock map,
 * because stock lived directly on `products`; now stock is per
 * (version, size) row, so callers must target the specific row by id.
 */
export async function updateProductStock(versionSizeId: string, stock: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('product_version_sizes')
    .update({ stock })
    .eq('id', versionSizeId);
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

/** All distinct sizes available across a product's versions. */
function getProductSizes(product: Pick<Product, 'versions'>): string[] {
  const seen = new Set<string>();
  product.versions.forEach((v) => v.sizes.forEach((s) => seen.add(s.size)));
  return Array.from(seen);
}

/** Cheapest price across all of a product's version-sizes (0 if it has none). */
function getProductMinPrice(product: Pick<Product, 'versions'>): number {
  const prices = product.versions.flatMap((v) => v.sizes.map((s) => s.price));
  return prices.length > 0 ? Math.min(...prices) : 0;
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
    if (size && !getProductSizes(product).includes(size)) return false;
    // "maxPrice" is satisfied if the product has at least one option at or
    // under that price (its cheapest version-size), matching a typical
    // "starting from" storefront price filter.
    if (maxPrice != null && getProductMinPrice(product) > maxPrice) return false;
    if (featuredOnly && !product.featured) return false;
    return true;
  });
}

/** Unique sizes present across a product list's versions, de-duplicated. */
export function getUniqueSizes(products: Product[]): string[] {
  const seen = new Set<string>();
  products.forEach((p) => getProductSizes(p).forEach((s) => seen.add(s)));
  return Array.from(seen);
}

/** Min/max price across every version-size of a product list. Returns { min: 0, max: 0 } if none exist. */
export function getPriceBounds(products: Product[]): { min: number; max: number } {
  const prices = products.flatMap((p) => p.versions.flatMap((v) => v.sizes.map((s) => s.price)));
  if (prices.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

// --- Admin: product management (create / edit / delete / duplicate) ---

/**
 * Fields an admin can set when creating or editing a product's design/story
 * layer. Garment-specific fields (type, material, price, sizes, stock, SKU,
 * pre-order) have moved to `ProductVersionInput` / `ProductVersionSizeInput`
 * below — a product on its own is just the design.
 * `images` is an ordered list — `images[0]` is treated as the primary image
 * and mirrored into the `image` column for storefront compatibility.
 */
export interface ProductInput {
  name: string;
  slug: string;
  /**
   * Relational source of truth — the id of an existing `collections` row.
   * Free-text collection names are no longer accepted from callers; the
   * legacy `products.collection` text column (still NOT NULL in the DB)
   * is derived server-side from the selected collection's canonical name,
   * never taken from client input.
   */
  collectionId: string;
  tagline: string;
  description: string;
  lore: string;
  images: string[];
  featured?: boolean;
}

/**
 * Resolves the write-side row shape from admin input. Async because the
 * legacy `products.collection` text column (still NOT NULL in the DB) is
 * derived here from the selected collection's canonical name — looked up
 * server-side via collectionId, never trusted from the client — rather
 * than accepting arbitrary typed text. `collection_id` is the new source
 * of truth; `collection` is written only for backward compatibility.
 */
async function mapProductInputToRow(input: ProductInput) {
  const collection = await fetchCollectionById(input.collectionId);
  if (!collection) {
    throw new Error('Selected collection could not be found. Please re-select a collection.');
  }

  return {
    name: input.name,
    slug: input.slug,
    collection_id: input.collectionId,
    collection: collection.name,
    tagline: input.tagline,
    description: input.description,
    lore: input.lore,
    image: input.images[0] ?? '',
    images: input.images,
    featured: input.featured ?? false,
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

/**
 * Whether a SKU is already in use by another product-version-size row.
 * SKUs now live on `product_version_sizes` (one per sellable size), not on
 * `products` — so this checks that table, and `excludeSizeId` refers to a
 * `product_version_sizes.id`, not a product id.
 */
export async function isSkuTaken(sku: string, excludeSizeId?: string): Promise<boolean> {
  let query = supabase.from('product_version_sizes').select('id').eq('sku', sku);
  if (excludeSizeId) query = query.neq('id', excludeSizeId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Failed to check SKU: ${error.message}`);
  }
  return !!data;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const row = await mapProductInputToRow(input);
  const { data, error } = await supabaseAdmin.from('products').insert(row).select().single();

  if (error) {
    throw new Error(`Failed to create product: ${error.message}`);
  }
  // A freshly created product has no versions yet; mapRowToProduct defaults
  // `versions` to [] since `data` has no nested `versions` key here.
  return mapRowToProduct(data as ProductRow);
}

export async function updateProduct(id: string, input: ProductInput): Promise<Product> {
  const row = await mapProductInputToRow(input);
  const { data, error } = await supabaseAdmin
    .from('products')
    .update(row)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update product: ${error.message}`);
  }
  // Same note as createProduct: this response has no nested versions, so
  // callers that need the full versions/sizes tree should re-fetch via
  // fetchProductBySlug/fetchProducts after an update.
  return mapRowToProduct(data as ProductRow);
}

/**
 * Deletes a product row, then best-effort cleans up its images from Storage.
 * Uses delete + select so the deleted row's id comes back — with RLS
 * enabled, a missing/misconfigured DELETE policy causes Postgres to match
 * zero rows rather than raise an error, which would otherwise look
 * identical to a successful delete. Image cleanup only runs once we've
 * confirmed a row was actually deleted.
 * Image cleanup failures are swallowed (via allSettled) since the product
 * row is already gone by that point — an orphaned file is a minor issue,
 * a stuck delete flow is worse.
 * NOTE: this does not explicitly delete the product's `product_versions` /
 * `product_version_sizes` rows — whether they're removed depends on the FK
 * behavior configured in the DB (see report).
 */
export async function deleteProduct(
  product: Pick<Product, 'id' | 'image' | 'images'>
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .delete()
    .eq('id', product.id)
    .select('id');
  if (error) {
    throw new Error(`Failed to delete product: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      'Product could not be deleted. Check permissions or verify that the product still exists.'
    );
  }

  const urls =
    product.images && product.images.length > 0
      ? product.images
      : product.image
        ? [product.image]
        : [];

  await Promise.allSettled(urls.map((url) => deleteProductImage(url)));
}

// --- Admin: product version & version-size management ---
//
// Minimal CRUD to support duplicateProduct below and any Phase 2B version
// editor. `ProductForm.tsx` itself is untouched in this phase per the task
// scope, so nothing here is wired into the UI yet.

/** Fields an admin can set when creating or editing a product version. */
export interface ProductVersionInput {
  versionName: string;
  productType: ProductType;
  material?: string | null;
  fit?: string | null;
  color?: string | null;
  images?: string[];
  careInstructions?: string[];
  isPreorder?: boolean;
  preorderDays?: number | null;
  isActive?: boolean;
  sortOrder?: number;
}

function mapVersionInputToRow(productId: string, input: ProductVersionInput) {
  return {
    product_id: productId,
    version_name: input.versionName,
    product_type: input.productType,
    material: input.material ?? null,
    fit: input.fit ?? null,
    color: input.color ?? null,
    images: input.images ?? null,
    care_instructions: input.careInstructions ?? null,
    is_preorder: input.isPreorder ?? false,
    // Defensive: mirrors the DB check constraint (preorder_days must be
    // null unless is_preorder is true) so a stale value can never slip
    // through even if the caller passes one by mistake.
    preorder_days: input.isPreorder ? (input.preorderDays ?? null) : null,
    is_active: input.isActive ?? true,
    sort_order: input.sortOrder ?? 0,
  };
}

export async function createProductVersion(
  productId: string,
  input: ProductVersionInput
): Promise<ProductVersion> {
  const { data, error } = await supabaseAdmin
    .from('product_versions')
    .insert(mapVersionInputToRow(productId, input))
    .select()
    .single();
  if (error) {
    throw new Error(`Failed to create product version: ${error.message}`);
  }
  return mapRowToVersion({ ...(data as ProductVersionRow), sizes: [] });
}

/**
 * Maps ProductVersionInput to an update payload, deliberately omitting
 * product_id — a version's parent product never changes via this path,
 * so it's left untouched rather than re-sent on every edit.
 */
function mapVersionInputToUpdateRow(input: ProductVersionInput) {
  return {
    version_name: input.versionName,
    product_type: input.productType,
    material: input.material ?? null,
    fit: input.fit ?? null,
    color: input.color ?? null,
    images: input.images ?? null,
    care_instructions: input.careInstructions ?? null,
    is_preorder: input.isPreorder ?? false,
    preorder_days: input.isPreorder ? (input.preorderDays ?? null) : null,
    is_active: input.isActive ?? true,
    sort_order: input.sortOrder ?? 0,
  };
}

/** Updates a version's metadata (versionName, productType, material, fit, color, images, careInstructions, isPreorder, preorderDays, isActive, sortOrder). Does not touch its sizes. */
export async function updateProductVersion(
  id: string,
  input: ProductVersionInput
): Promise<ProductVersion> {
  const { data, error } = await supabaseAdmin
    .from('product_versions')
    .update(mapVersionInputToUpdateRow(input))
    .eq('id', id)
    .select()
    .single();
  if (error) {
    throw new Error(`Failed to update product version: ${error.message}`);
  }
  // Like createProductVersion, this response has no nested sizes; callers
  // needing the full sizes list should re-fetch via fetchProductBySlug/
  // fetchProducts after an update.
  return mapRowToVersion({ ...(data as ProductVersionRow), sizes: [] });
}

/**
 * Deletes a product version. `product_version_sizes.version_id` is
 * ON DELETE CASCADE, so this also deletes all of the version's sizes —
 * unless any of those sizes already appear in `order_items` (or
 * `inventory_movements`), in which case the database's foreign key
 * constraint blocks the whole delete and this throws a clear error rather
 * than a raw Postgres constraint message.
 */
export async function deleteProductVersion(id: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('product_versions')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) {
    if (error.code === '23503') {
      throw new Error(
        'This version cannot be deleted because one or more of its sizes has existing order or inventory history. Deactivate it instead.'
      );
    }
    throw new Error(`Failed to delete product version: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      'Product version could not be deleted. Check permissions or verify that it still exists.'
    );
  }
}

/** Fields an admin can set when creating or editing a single sellable size row. */
export interface ProductVersionSizeInput {
  size: string;
  sku: string;
  price: number;
  stock?: number;
}

export async function createProductVersionSize(
  versionId: string,
  input: ProductVersionSizeInput
): Promise<ProductVersionSize> {
  const { data, error } = await supabaseAdmin
    .from('product_version_sizes')
    .insert({
      version_id: versionId,
      size: input.size,
      sku: input.sku,
      price: input.price,
      stock: input.stock ?? 0,
    })
    .select()
    .single();
  if (error) {
    throw new Error(`Failed to create size: ${error.message}`);
  }
  return mapRowToVersionSize(data as ProductVersionSizeRow);
}

/**
 * Updates a size's size/SKU/price only. Deliberately does NOT accept
 * `stock` — stock changes must always go through adjustStock()/
 * restockProduct() in inventory.ts, which record an inventory_movements
 * row and enforce reasons/non-negative stock via the adjust_stock/
 * restock_product RPCs. Omitting `stock` from the input type (rather than
 * just ignoring it if passed) makes that impossible to get wrong at
 * compile time.
 */
export async function updateProductVersionSize(
  id: string,
  input: Omit<ProductVersionSizeInput, 'stock'>
): Promise<ProductVersionSize> {
  const { data, error } = await supabaseAdmin
    .from('product_version_sizes')
    .update({ size: input.size, sku: input.sku, price: input.price })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    throw new Error(`Failed to update size: ${error.message}`);
  }
  return mapRowToVersionSize(data as ProductVersionSizeRow);
}

/**
 * Deletes a single size row. Blocked by the database's foreign key
 * constraint if it already appears in `order_items` (or
 * `inventory_movements`) — that failure is converted into a clear error
 * rather than a raw Postgres constraint message. Callers wanting to check
 * this ahead of time (e.g. to hide/disable a delete button) can use
 * hasOrderHistory() below.
 */
export async function deleteProductVersionSize(id: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('product_version_sizes')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) {
    if (error.code === '23503') {
      throw new Error(
        'This size cannot be deleted because it has existing order or inventory history. Set its stock to 0 instead.'
      );
    }
    throw new Error(`Failed to delete size: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error('Size could not be deleted. Check permissions or verify that it still exists.');
  }
}

/**
 * Whether a version-size has ever been ordered. This is an informational
 * read only — the actual enforcement is the order_items.version_size_id
 * foreign key checked by deleteProductVersionSize()/deleteProductVersion()
 * above. Useful for a caller that wants to explain *why* deletion is
 * blocked (or hide the option) before the user even tries.
 */
export async function hasOrderHistory(versionSizeId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('order_items')
    .select('id')
    .eq('version_size_id', versionSizeId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to check order history: ${error.message}`);
  }
  return !!data;
}

/**
 * Creates a copy of an existing product — including all of its versions and
 * their sizes — with new slugs/SKUs and a "(Copy)" name suffix. Reuses
 * existing image URLs (no re-upload). Stock on every duplicated size starts
 * at 0, matching the previous single-table behavior.
 * This now requires several sequential inserts (one product, then one per
 * version, then one per size) since the data is spread across three
 * tables; there's no multi-table transaction here, so a failure partway
 * through can leave a partially-duplicated product behind (see report).
 */
export async function duplicateProduct(product: Product): Promise<Product> {
  if (!product.collectionId) {
    throw new Error(
      'This product has no collection assigned and cannot be duplicated. Edit it and select a collection first.'
    );
  }
  const suffix = Date.now().toString(36);
  const newProduct = await createProduct({
    name: `${product.name} (Copy)`,
    slug: `${product.slug}-copy-${suffix}`,
    collectionId: product.collectionId,
    tagline: product.tagline,
    description: product.description,
    lore: product.lore,
    images: product.images && product.images.length > 0 ? product.images : [product.image],
    featured: false,
  });

  for (const version of product.versions) {
    const newVersion = await createProductVersion(newProduct.id, {
      versionName: version.versionName,
      productType: version.productType,
      material: version.material,
      fit: version.fit,
      color: version.color,
      images: version.images,
      careInstructions: version.careInstructions,
      isPreorder: version.isPreorder,
      preorderDays: version.preorderDays,
      isActive: version.isActive,
      sortOrder: version.sortOrder,
    });

    for (const size of version.sizes) {
      await createProductVersionSize(newVersion.id, {
        size: size.size,
        sku: `${size.sku}-COPY-${suffix.toUpperCase()}`,
        price: size.price,
        stock: 0,
      });
    }
  }

  const duplicated = await fetchProductBySlug(newProduct.slug);
  if (!duplicated) {
    throw new Error('Product was duplicated but could not be reloaded.');
  }
  return duplicated;
}

// --- Admin: product image upload (Supabase Storage) ---

/** Uploads a product image to Supabase Storage and returns its public URL. */
export async function uploadProductImage(slug: string, file: File): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `${slug}/${Date.now()}-${safeName}`;
  const { publicUrl } = await uploadFile(PRODUCT_IMAGES_BUCKET, path, file, 'public', supabaseAdmin);
  return publicUrl;
}

/** Deletes a product image from Supabase Storage given its public URL. No-ops for URLs outside the managed bucket. */
export async function deleteProductImage(url: string): Promise<void> {
  const path = getPathFromPublicUrl(PRODUCT_IMAGES_BUCKET, url);
  if (!path) return;
  await deleteFile(PRODUCT_IMAGES_BUCKET, path, supabaseAdmin);
}
