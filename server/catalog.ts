import type { Product, ProductVersion } from '../src/data/products.ts';
import type { Collection } from '../src/data/collections.ts';

type CollectionRow = Pick<Collection, 'id' | 'name' | 'slug' | 'tagline' | 'description' | 'status'> & {
  cover_image: string | null; sort_order: number; created_at: string;
};
type VersionRow = Pick<ProductVersion, 'id' | 'material' | 'fit' | 'color' | 'images'> & {
  version_name: string; product_type: ProductVersion['productType']; is_active: boolean;
  is_preorder: boolean; preorder_days: number | null; sort_order: number;
  sizes: Pick<ProductVersion['sizes'][number], 'id' | 'size' | 'sku' | 'price' | 'stock'>[];
};
type ProductRow = Pick<Product, 'id' | 'name' | 'slug' | 'collection' | 'tagline' | 'description' | 'lore' | 'image' | 'images' | 'featured'> & {
  product_code: string; collection_id: string | null; created_at: string; versions: VersionRow[];
};

/** Public catalog only. Never attach admin sessions or service-role credentials. */
export async function fetchCatalog() {
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('Public catalog configuration unavailable');
  const read = async <T>(table: string, select: string): Promise<T[]> => {
    const url = new URL(`/rest/v1/${table}`, base);
    url.searchParams.set('select', select);
    const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Public catalog unavailable');
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error('Invalid public catalog response');
    return rows as T[];
  };
  const [productRows, collectionRows] = await Promise.all([
    read<ProductRow>('products', 'id,product_code,name,slug,collection_id,collection,tagline,description,lore,image,images,featured,created_at,versions:product_versions(id,version_name,product_type,material,fit,color,images,is_active,is_preorder,preorder_days,sort_order,sizes:product_version_sizes(id,size,sku,price,stock))'),
    read<CollectionRow>('collections', 'id,name,slug,tagline,description,cover_image,status,sort_order,created_at'),
  ]);
  const collections: Collection[] = collectionRows.map((row) => ({ ...row,
    coverImage: row.cover_image, sortOrder: row.sort_order, createdAt: row.created_at,
    heroFocusDesktop: null, heroFocusMobile: null, cardFocus: null,
  }));
  const products: Product[] = productRows.map((row) => ({ ...row,
    productCode: row.product_code, collectionId: row.collection_id, createdAt: row.created_at,
    collection: collections.find((c) => c.id === row.collection_id)?.name ?? row.collection,
    versions: row.versions.map((version) => ({ ...version,
      productId: row.id, versionName: version.version_name, productType: version.product_type,
      isActive: version.is_active, isPreorder: version.is_preorder, preorderDays: version.preorder_days,
      sortOrder: version.sort_order, createdAt: '',
      sizes: version.sizes.map((size) => ({ ...size, versionId: version.id, createdAt: '' })),
    })).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)),
  }));
  return { products, collections };
}

export type Catalog = Awaited<ReturnType<typeof fetchCatalog>>;
