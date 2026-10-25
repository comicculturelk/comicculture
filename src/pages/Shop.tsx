import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import CatalogState from '../components/CatalogState';
import ProductCard from '../components/ProductCard';
import ProductFilters from '../components/ProductFilters';
import { useProducts } from '../hooks/useProducts';
import { filterProducts, getUniqueSizes, getPriceBounds, isProductAvailable, sortProducts, type ProductSort } from '../data/products';
import SEO from '../components/SEO';
import ProductGridSkeleton from '../components/ProductGridSkeleton';

const SITE_URL = 'https://comicculture.lk';

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isNewest = searchParams.get('sort') === 'newest';

  const { products, loading, error } = useProducts();

  // Explicit newest links retain their sort; the default uses available-first recommendations.
  const [sort, setSort] = useState<ProductSort>(isNewest ? 'newest' : 'recommended');
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [availableOnly, setAvailableOnly] = useState(false);

  useEffect(() => {
    if (isNewest) setSort('newest');
  }, [isNewest]);

  const sortedProducts = useMemo(() => sortProducts(products, sort), [products, sort]);
  const collectionOptions = useMemo(
    () => Array.from(new Set(products.map((product) => product.collection))).sort((a, b) => a.localeCompare(b)),
    [products]
  );

  const sizes = useMemo(() => getUniqueSizes(sortedProducts), [sortedProducts]);
  const priceBounds = useMemo(() => getPriceBounds(sortedProducts), [sortedProducts]);

  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [priceLimit, setPriceLimit] = useState<number | null>(null);

  const effectivePriceLimit = priceLimit ?? priceBounds.max;

  const filteredProducts = useMemo(
    () =>
      filterProducts(sortedProducts, {
        search,
        size: selectedSize,
        maxPrice: priceLimit !== null ? priceLimit : null,
        collection: selectedCollection,
        availableOnly,
      }),
    [sortedProducts, search, selectedSize, priceLimit, selectedCollection, availableOnly]
  );

  const hasActiveFilters =
    search.trim() !== '' ||
    selectedSize !== null ||
    (priceLimit !== null && priceLimit < priceBounds.max) ||
    selectedCollection !== null || availableOnly;

  const handleReset = () => {
    setSearch('');
    setSelectedSize(null);
    setPriceLimit(null);
    setSelectedCollection(null);
    setAvailableOnly(false);
  };

  const pageTitle = isNewest ? 'New Arrivals' : 'Shop All';
  const canonicalUrl = isNewest ? `${SITE_URL}/shop?sort=newest` : `${SITE_URL}/shop`;

  return (
    <>
      <SEO
        title={`${pageTitle} | ComicCulture`}
        description="Browse ComicCulture's full catalog of fan-inspired apparel — premium designs inspired by comics, superheroes, and pop culture."
        canonical={canonicalUrl}
        ogType="website"
      />
      <section className="comic-page catalog-page relative pb-16 pt-24 sm:py-32 lg:py-40">
        {/* Background */}
        <div className="absolute inset-0 bg-background">
          <div className="absolute inset-0 bg-web-pattern opacity-20" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6">
          {/* Header */}
          <motion.div
            className="mb-6 text-left sm:mb-16 sm:text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              {isNewest ? 'Just dropped' : 'Full catalog'}
            </span>
            <h1 className="mt-3 font-display text-4xl md:text-5xl lg:text-6xl text-foreground tracking-wide uppercase">
              {pageTitle}
            </h1>
          </motion.div>

          {/* Loading state */}
          {loading && <ProductGridSkeleton count={8} />}

          {/* Error state */}
          {error && !loading && (
            <CatalogState error />
          )}

          {/* Search & filters */}
          {!loading && !error && sortedProducts.length > 0 && (
            <ProductFilters
              search={search}
              onSearchChange={setSearch}
              sizes={sizes}
              selectedSize={selectedSize}
              onSizeChange={setSelectedSize}
              priceBounds={priceBounds}
              priceLimit={effectivePriceLimit}
              onPriceLimitChange={setPriceLimit}
              onReset={handleReset}
              hasActiveFilters={hasActiveFilters}
              sort={sort}
              onSortChange={(nextSort) => {
                setSort(nextSort);
                if (nextSort === 'newest') setSearchParams({ sort: 'newest' }, { replace: true });
                else setSearchParams({}, { replace: true });
              }}
              collections={collectionOptions}
              selectedCollection={selectedCollection}
              onCollectionChange={setSelectedCollection}
              availableOnly={availableOnly}
              onAvailableChange={setAvailableOnly}
            />
          )}

          {!loading && !error && sortedProducts.length > 0 && (
            <p role="status" className="mb-5 text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{filteredProducts.length}</span> of {sortedProducts.length} designs
            </p>
          )}

          {/* Empty state — no products in the catalog at all */}
          {!loading && !error && sortedProducts.length === 0 && (
            <CatalogState />
          )}

          {/* Empty state — filters/search matched nothing */}
          {!loading && !error && sortedProducts.length > 0 && filteredProducts.length === 0 && (
            <CatalogState filtered onReset={handleReset} />
          )}

          {/* Product grid */}
          {!loading && !error && filteredProducts.length > 0 && (
            <motion.div layout className={`product-grid grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4 ${filteredProducts.length === 1 ? 'single-product-grid' : ''}`}>
              <AnimatePresence mode="popLayout">
                {filteredProducts.flatMap((product, index) => [
                  sort === 'recommended' && !isProductAvailable(product) && (index === 0 || isProductAvailable(filteredProducts[index - 1]))
                    ? <motion.div key="sold-out-heading" className="col-span-full border-t border-border pt-6">
                        <h2 className="font-display text-2xl">Currently sold out</h2>
                        <p className="mt-1 text-sm text-muted">These designs are unavailable right now. Available designs are shown first.</p>
                      </motion.div>
                    : null,
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.25 }}
                  >
                    <ProductCard product={product} index={index} />
                  </motion.div>,
                ])}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </section>
    </>
  );
}
