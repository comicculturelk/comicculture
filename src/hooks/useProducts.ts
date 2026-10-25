import { useEffect, useState } from 'react';
import { fetchProducts } from '../data/products';
import type { Product } from '../data/products';
import { fetchCollections } from '../data/collections';

interface UseProductsResult {
  products: Product[];
  loading: boolean;
  error: string | null;
}

export function useProducts(): UseProductsResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchProducts(), fetchCollections().catch(() => [])])
      .then(([data, collections]) => {
        if (!cancelled) {
          // Use the collection's current name for display; keep IDs and SKUs intact.
          const names = new Map(collections.map((collection) => [collection.id, collection.name]));
          setProducts(data.map((product) => ({ ...product, collection: names.get(product.collectionId ?? '') ?? product.collection })));
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { products, loading, error };
}
