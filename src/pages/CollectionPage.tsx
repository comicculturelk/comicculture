import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import ProductFilters from '../components/ProductFilters';
import NotFound from './NotFound';
import { useProducts } from '../hooks/useProducts';
import { filterProducts, getUniqueSizes, getPriceBounds, sortProducts, type ProductSort } from '../data/products';
import { fetchCollectionBySlug, type Collection } from '../data/collections';
import SEO, { type JsonLdBlock } from '../components/SEO';

const SITE_URL = 'https://comicculture.lk';

/**
 * Builds a concise, unique meta description from real collection data only —
 * no invented claims (limited edition, exclusive, jersey, etc.). For a
 * 'soon' collection, appends a plain "Coming soon" notice instead of
 * implying products are currently purchasable.
 */
function buildCollectionMetaDescription(collection: Collection): string {
  if (collection.status === 'soon') {
    const base =
      collection.description?.trim() ||
      collection.tagline?.trim() ||
      `${collection.name} — a new collection from ComicCulture.`;
    const withNotice = `${base} Coming soon.`;
    return withNotice.length > 160 ? `${withNotice.slice(0, 157).trimEnd()}…` : withNotice;
  }

  const base =
    collection.description?.trim() ||
    collection.tagline?.trim() ||
    `Explore the ${collection.name} collection from ComicCulture.`;
  return base.length > 160 ? `${base.slice(0, 157).trimEnd()}…` : base;
}

export default function CollectionPage() {
  const { slug } = useParams<{ slug: string }>();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [collectionLoading, setCollectionLoading] = useState(true);
  const [collectionError, setCollectionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCollectionLoading(true);
    setCollectionError(null);
    setCollection(null);

    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setCollectionError('This collection is taking longer than expected to load.');
        setCollectionLoading(false);
      }
    }, 12000);

    if (!slug) {
      window.clearTimeout(timeout);
      setCollectionLoading(false);
      return;
    }

    fetchCollectionBySlug(slug)
      .then((data) => {
        if (!cancelled) {
          window.clearTimeout(timeout);
          setCollection(data);
          setCollectionError(null);
          setCollectionLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          window.clearTimeout(timeout);
          setCollectionError(err.message);
          setCollectionLoading(false);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [slug]);

  const { products, loading: productsLoading, error: productsError } = useProducts();

  const collectionProducts = useMemo(
    () =>
      collection ? products.filter((product) => product.collectionId === collection.id) : [],
    [products, collection]
  );

  const sizes = useMemo(() => getUniqueSizes(collectionProducts), [collectionProducts]);
  const priceBounds = useMemo(() => getPriceBounds(collectionProducts), [collectionProducts]);

  const [search, setSearch] = useState('');
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [priceLimit, setPriceLimit] = useState<number | null>(null);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState<ProductSort>('recommended');

  const effectivePriceLimit = priceLimit ?? priceBounds.max;

  const filteredProducts = useMemo(
    () =>
      filterProducts(collectionProducts, {
        search,
        size: selectedSize,
        maxPrice: priceLimit !== null ? priceLimit : null,
        featuredOnly,
        availableOnly,
      }),
    [collectionProducts, search, selectedSize, priceLimit, featuredOnly, availableOnly]
  );
  const orderedFilteredProducts = useMemo(() => sortProducts(filteredProducts, sort), [filteredProducts, sort]);

  const hasActiveFilters =
    search.trim() !== '' ||
    selectedSize !== null ||
    (priceLimit !== null && priceLimit < priceBounds.max) ||
    featuredOnly || availableOnly;

  const handleReset = () => {
    setSearch('');
    setSelectedSize(null);
    setPriceLimit(null);
    setFeaturedOnly(false);
    setAvailableOnly(false);
  };

  // Collection lookup finished and nothing was found — same 404 behavior
  // used by the app's catch-all route.
  if (!collectionLoading && !collectionError && !collection) {
    return <NotFound />;
  }

  const loading = collectionLoading || (!!collection && productsLoading);
  const error = collectionError || (collection ? productsError : null);

  const canonicalUrl = collection ? `${SITE_URL}/collections/${collection.slug}` : '';
  const metaDescription = collection ? buildCollectionMetaDescription(collection) : '';

  const breadcrumbJsonLd: JsonLdBlock | null = collection
    ? {
        id: 'breadcrumb',
        data: {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: 'Shop', item: `${SITE_URL}/shop` },
            { '@type': 'ListItem', position: 3, name: collection.name, item: canonicalUrl },
          ],
        },
      }
    : null;

  // CollectionPage + nested ItemList, built only from collectionProducts
  // (the collection's full relational product set — not the search/filter-
  // narrowed subset). Price/availability are intentionally left off each
  // ListItem: that data already has a single source of truth in each
  // product's own Product/Offer JSON-LD (Phase 6A), so it isn't duplicated
  // here to avoid two structured-data blocks going out of sync.
  const collectionPageJsonLd: JsonLdBlock | null = collection
    ? {
        id: 'collection-page',
        data: {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: collection.name,
          url: canonicalUrl,
          ...(metaDescription ? { description: metaDescription } : {}),
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: collectionProducts.map((product, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              url: `${SITE_URL}/product/${product.slug}`,
              name: product.name,
              image: product.image,
            })),
          },
        },
      }
    : null;

  return (
    <>
      {collection && (
        <SEO
          title={`${collection.name} | ComicCulture`}
          description={metaDescription}
          canonical={canonicalUrl}
          ogType="website"
          image={collection.coverImage ?? undefined}
          jsonLd={[breadcrumbJsonLd, collectionPageJsonLd].filter((b): b is JsonLdBlock => b !== null)}
        />
      )}
      <section className="comic-page relative py-32 lg:py-40">
      {/* Background */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-web-pattern opacity-20" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        {/* Breadcrumb */}
        {collection && (
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link to="/" className="transition-colors hover:text-foreground">
              Home
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link to="/shop" className="transition-colors hover:text-foreground">
              Shop
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-muted">{collection.name}</span>
          </nav>
        )}

        {/* Back link */}
        <Link
          to="/shop"
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Universe
        </Link>

        {/* Header */}
        {collection && (
          <motion.div
            className="mt-8 mb-16 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              {collection.tagline || (collection.status === 'soon' ? 'COMING SOON' : 'LIVE NOW')}
            </span>
            {collection.coverImage && (
              <div className="mx-auto mt-8 max-w-3xl overflow-hidden rounded-2xl border border-border">
                <img
                  src={collection.coverImage}
                  alt={collection.name}
                  className="h-56 w-full object-cover sm:h-72"
                />
              </div>
            )}
            <h1 className="mt-6 font-display text-4xl md:text-5xl lg:text-6xl text-foreground tracking-wide uppercase">
              {collection.name}
            </h1>
            {collection.description && (
              <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">{collection.description}</p>
            )}
          </motion.div>
        )}

        {/* Loading state */}
        {loading && <p className="text-center text-muted">Loading collection...</p>}

        {/* Error state */}
        {error && !loading && (
          <div role="alert" className="mx-auto max-w-lg rounded-xl border border-border bg-surface p-6 text-center">
            <p className="font-medium text-foreground">{error.includes('collection') ? 'We couldn’t load this collection.' : 'We couldn’t load the products.'}</p>
            <p className="mt-2 text-sm text-muted-foreground">Please check your connection and try again.</p>
            <button type="button" onClick={() => window.location.reload()} className="btn-outline mt-5">
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Try again
            </button>
          </div>
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
            sort={sort}
            onSortChange={setSort}
            availableOnly={availableOnly}
            onAvailableChange={setAvailableOnly}
          />
        )}

        {!loading && !error && collectionProducts.length > 0 && (
          <p role="status" className="mb-5 text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{orderedFilteredProducts.length}</span> of {collectionProducts.length} designs
          </p>
        )}

        {/* Empty state — no products in collection at all */}
        {!loading && !error && collectionProducts.length === 0 && (
          <p className="text-center text-muted">
            No products found in this collection yet.
          </p>
        )}

        {/* Empty state — filters/search matched nothing */}
        {!loading && !error && collectionProducts.length > 0 && filteredProducts.length === 0 && (
          <p className="text-center text-muted">
            No products match your search or filters.
          </p>
        )}

        {/* Product grid */}
        {!loading && !error && orderedFilteredProducts.length > 0 && (
          <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            <AnimatePresence mode="popLayout">
              {orderedFilteredProducts.map((product, index) => (
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
    </>
  );
}
