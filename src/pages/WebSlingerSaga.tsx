import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import ProductFilters from '../components/ProductFilters';
import { useProducts } from '../hooks/useProducts';
import { filterProducts, getUniqueSizes, getPriceBounds } from '../data/products';

// Confirmed against Supabase: products.collection = 'Web-Slinger Saga'
const COLLECTION_NAME = 'Web-Slinger Saga';

export default function WebSlingerSaga() {
  const { products, loading, error } = useProducts();

  const collectionProducts = products.filter(
    (product) =>
      product.collection.trim().toLowerCase() === COLLECTION_NAME.trim().toLowerCase()
  );

  const sizes = useMemo(() => getUniqueSizes(collectionProducts), [collectionProducts]);
  const priceBounds = useMemo(() => getPriceBounds(collectionProducts), [collectionProducts]);

  const [search, setSearch] = useState('');
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [priceLimit, setPriceLimit] = useState<number | null>(null);
  const [featuredOnly, setFeaturedOnly] = useState(false);

  const effectivePriceLimit = priceLimit ?? priceBounds.max;

  const filteredProducts = useMemo(
    () =>
      filterProducts(collectionProducts, {
        search,
        size: selectedSize,
        maxPrice: priceLimit !== null ? priceLimit : null,
        featuredOnly,
      }),
    [collectionProducts, search, selectedSize, priceLimit, featuredOnly]
  );

  const hasActiveFilters =
    search.trim() !== '' ||
    selectedSize !== null ||
    (priceLimit !== null && priceLimit < priceBounds.max) ||
    featuredOnly;

  const handleReset = () => {
    setSearch('');
    setSelectedSize(null);
    setPriceLimit(null);
    setFeaturedOnly(false);
  };

  return (
    <section className="relative py-32 lg:py-40">
      {/* Background */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-web-pattern opacity-20" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        {/* Back link */}
        <Link
          to="/shop"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Universe
        </Link>

        {/* Header */}
        <motion.div
          className="mt-8 mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-block rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            DROP 01 · LIVE NOW
          </span>
          <h1 className="mt-6 font-display text-4xl md:text-5xl lg:text-6xl text-foreground tracking-wide">
            WEB-SLINGER SAGA
          </h1>
          <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">
            Six issues. One web. Our debut arc, inspired by the masked hero everyone grew up
            swinging alongside.
          </p>
        </motion.div>

        {/* Loading state */}
        {loading && <p className="text-center text-muted">Loading collection...</p>}

        {/* Error state */}
        {error && !loading && (
          <p className="text-center text-primary">
            Couldn't load products right now. Please refresh the page.
          </p>
        )}

        {/* Search & filters */}
        {!loading && !error && collectionProducts.length > 0 && (
          <ProductFilters
            search={search}
            onSearchChange={setSearch}
            sizes={sizes}
            selectedSize={selectedSize}
            onSizeChange={setSelectedSize}
            priceBounds={priceBounds}
            priceLimit={effectivePriceLimit}
            onPriceLimitChange={setPriceLimit}
            featuredOnly={featuredOnly}
            onFeaturedChange={setFeaturedOnly}
            onReset={handleReset}
            hasActiveFilters={hasActiveFilters}
          />
        )}

        {/* Empty state — no products in collection at all */}
        {!loading && !error && collectionProducts.length === 0 && (
          <p className="text-center text-muted">
            No jerseys found in this collection yet.
          </p>
        )}

        {/* Empty state — filters/search matched nothing */}
        {!loading && !error && collectionProducts.length > 0 && filteredProducts.length === 0 && (
          <p className="text-center text-muted">
            No jerseys match your search or filters.
          </p>
        )}

        {/* Product grid */}
        {!loading && !error && filteredProducts.length > 0 && (
          <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
            <AnimatePresence mode="popLayout">
              {filteredProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                >
                  <ProductCard product={product} index={index} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </section>
  );
}
