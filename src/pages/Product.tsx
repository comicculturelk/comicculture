import { motion, AnimatePresence } from 'framer-motion';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Truck,
  ShieldCheck,
  RefreshCw,
  Minus,
  Plus,
  X,
  Ruler,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useProduct } from '../hooks/useProduct';
import { useProducts } from '../hooks/useProducts';
import { useCart } from '../hooks/useCart';
import {
  formatPrice,
  getStockForSize,
  isSizeInStock,
  getPreorderMessage,
  getProductMinPrice,
  PRODUCT_TYPE_LABELS,
  formatSize,
  isProductAvailable,
  sortProducts,
} from '../data/products';
import type { Product as ProductType, ProductVersion } from '../data/products';
import { fetchCollectionById } from '../data/collections';
import SEO from '../components/SEO';
import { SITE_URL, productSeo, productSchema, breadcrumbs, STORE_SCHEMA, isIndexableProduct } from '../lib/seo';
import Reviews from '../components/Reviews';
import ProductCard from '../components/ProductCard';
import { getProductSummary } from '../lib/merchandising';
import { STORE_CONFIG } from '../config/store';
import { useDialog } from '../hooks/useDialog';
import { useMediaQuery } from '../hooks/useMediaQuery';

/**
 * Picks the version a freshly-loaded product (or a version switch) should
 * land on: the first *active* version, falling back to the first version
 * at all if none are marked active (so the page never has nothing to show).
 */
function pickDefaultVersion(product: ProductType): ProductVersion | undefined {
  const active = product.versions.filter((v) => v.isActive);
  return (active.length > 0 ? active : product.versions)[0];
}

type AccordionKey = 'story' | 'details' | 'care' | 'shipping';

export default function Product() {
  const mobileLayout = useMediaQuery('(max-width: 767px)');
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const variantId = searchParams.get('variant');
  const { product, loading, error } = useProduct(slug);
  const { products: allProducts } = useProducts();
  const { addItem, openCart, stockMessage } = useCart();
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [openSection, setOpenSection] = useState<AccordionKey | null>(null);
  const [collectionName, setCollectionName] = useState('');
  const [collectionSlug, setCollectionSlug] = useState<string | null>(null);
  const sizeGuidePanelRef = useRef<HTMLDivElement>(null);
  useDialog(showSizeGuide, sizeGuidePanelRef, () => setShowSizeGuide(false));
  const purchaseCtaRef = useRef<HTMLButtonElement>(null);
  const sizeOptionsRef = useRef<HTMLDivElement>(null);
  const [showStickyBuy, setShowStickyBuy] = useState(false);

  // Reset per-product UI state whenever the loaded product changes: land on
  // the default version, no selected size, and its own image (falling back
  // to the product's design image if the version has none uploaded yet).
  useEffect(() => {
    if (product) {
      const linkedVersion = product.versions.find((v) => v.isActive && v.sizes.some((size) => size.id === variantId));
      const defaultVersion = linkedVersion ?? pickDefaultVersion(product);
      setSelectedVersionId(defaultVersion?.id ?? '');
      setActiveImage(defaultVersion?.images?.[0] ?? product.image);
      setSelectedSize(defaultVersion?.sizes.find((size) => size.id === variantId)?.size ?? '');
      setQuantity(1);
    }
  }, [product, variantId]);

  // Resolve the product's collection slug (for the internal collection link)
  // from the relational collection_id, since `product.collection` is only a
  // display name. Legacy products with no collectionId simply get no link.
  useEffect(() => {
    let cancelled = false;
    setCollectionName('');
    if (!product?.collectionId) {
      setCollectionSlug(null);
      return;
    }
    fetchCollectionById(product.collectionId)
      .then((collection) => {
        if (!cancelled) {
          setCollectionSlug(collection?.slug ?? null);
          setCollectionName(collection?.name ?? '');
        }
      })
      .catch(() => {
        if (!cancelled) setCollectionSlug(null);
      });
    return () => {
      cancelled = true;
    };
  }, [product?.collectionId]);

  useEffect(() => {
    const target = purchaseCtaRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setShowStickyBuy(!entry.isIntersecting), { threshold: 0.15 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [product?.id]);

  if (loading) {
    return (
      <section className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-8 px-6 pb-16 pt-28 md:grid-cols-2" aria-label="Loading product" aria-busy="true">
        <div className="aspect-[4/5] animate-pulse rounded-2xl bg-slate-100" />
        <div className="space-y-5 py-8">
          <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
          <div className="h-10 w-3/4 animate-pulse rounded bg-slate-100" />
          <div className="h-7 w-36 animate-pulse rounded bg-slate-100" />
          <div className="h-20 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-12 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-12 w-full animate-pulse rounded bg-slate-100" />
        </div>
      </section>
    );
  }

  if (error || !product) {
    return (
      <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <SEO title={error ? 'Product temporarily unavailable | ComicCulture' : 'Product not found | ComicCulture'} description="Explore fan-inspired apparel at ComicCulture." canonical={`${SITE_URL}/product/${slug}`} robots="noindex,follow" />
        <p className="text-primary">
          {error ? "Couldn't load this product." : "We couldn't find that product."}
        </p>
        <Link to="/shop" className="btn-primary">
          Back to Shop
        </Link>
      </section>
    );
  }

  // The apparel offering currently selected (e.g. "Jersey" vs "Oversized
  // Cotton"), and the specific sellable size within it. These — not the
  // product itself — now carry type/material/fit/color/images/care/preorder
  // and size/SKU/price/stock respectively.
  const activeVersions = product.versions.filter((v) => v.isActive);
  const selectedVersion =
    activeVersions.find((v) => v.id === selectedVersionId) ?? activeVersions[0];
  const selectedVersionSize = selectedVersion?.sizes.find((s) => s.size === selectedSize);
  const sizeGuide = selectedVersion?.sizeGuide ?? [];
  const hasSizeGuide = sizeGuide.length > 0;
  const isInStock = selectedVersion?.sizes.some((size) => isSizeInStock(selectedVersion, size.size)) ?? false;

  const galleryImages =
    selectedVersion?.images && selectedVersion.images.length > 0
      ? selectedVersion.images
      : product.images && product.images.length > 0
        ? product.images
        : [product.image];

  const displayedImage = activeImage ?? galleryImages[0] ?? product.image;
  const currentImageIndex = Math.max(galleryImages.indexOf(displayedImage), 0);

  const handlePrevImage = () => {
    const prevIndex = (currentImageIndex - 1 + galleryImages.length) % galleryImages.length;
    setActiveImage(galleryImages[prevIndex]);
  };
  const handleNextImage = () => {
    const nextIndex = (currentImageIndex + 1) % galleryImages.length;
    setActiveImage(galleryImages[nextIndex]);
  };

  const relatedProducts = sortProducts(allProducts.filter((p) => p.slug !== product.slug && isProductAvailable(p)), 'recommended')
    .sort((a, b) => Number(b.collectionId === product.collectionId) - Number(a.collectionId === product.collectionId))
    .slice(0, 4);
  const displayCollection = collectionName || product.collection;
  const displayedPrice = selectedVersionSize?.price ?? (selectedVersion?.sizes.length ? Math.min(...selectedVersion.sizes.map((size) => size.price)) : getProductMinPrice(product));

  const availableStock = selectedVersion ? getStockForSize(selectedVersion, selectedSize) : 0;
  const maxQuantity = Math.max(1, Math.min(10, availableStock));
  const preorderMessage = selectedVersion ? getPreorderMessage(selectedVersion) : null;

  const canonicalUrl = `${SITE_URL}/product/${product.slug}`;
  const metadata = productSeo(product);

  const handleSelectVersion = (versionId: string) => {
    if (versionId === selectedVersionId) return;
    const version = product.versions.find((v) => v.id === versionId);
    setSelectedVersionId(versionId);
    setActiveImage(version?.images?.[0] ?? product.image);
    setSelectedSize('');
    setQuantity(1);
    setShowSizeGuide(false);
  };

  const focusSizes = () => {
    sizeOptionsRef.current?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    sizeOptionsRef.current?.querySelector<HTMLButtonElement>('.comic-size-choice:not(:disabled)')?.focus({ preventScroll: true });
  };
  const handleAddToCart = () => {
    if (!selectedVersion || !selectedVersionSize) { focusSizes(); return; }
    addItem(
      {
        versionSizeId: selectedVersionSize.id,
        productId: product.id,
        slug: product.slug,
        // Disambiguate cart/checkout lines when a product has more than one
        // apparel version — single-version products (the common case today)
        // keep the exact same name as before.
        name:
          product.versions.length > 1
            ? `${product.name} — ${selectedVersion.versionName}`
            : product.name,
        image: displayedImage,
        price: selectedVersionSize.price,
        size: selectedVersionSize.size,
        maxStock: availableStock,
      },
      quantity
    );
    openCart();
  };

  const description = product.description && <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">{product.description}</p>;

  const toggleSection = (key: AccordionKey) => {
    setOpenSection((current) => (current === key ? null : key));
  };

  return (
    <>
      <SEO
        title={metadata.title}
        description={metadata.description}
        canonical={canonicalUrl}
        ogType="product"
        image={product.image}
        robots={isIndexableProduct(product) ? 'index,follow' : 'noindex,follow'}
        jsonLd={isIndexableProduct(product) ? [{ id: 'store', data: STORE_SCHEMA }, { id: 'product', data: productSchema(product) }, { id: 'breadcrumb', data: breadcrumbs(product.name, `/product/${product.slug}`) }] : []}
      />
      <section className="comic-page product-detail-page relative min-h-screen bg-background pb-28 pt-24 sm:pb-20 lg:pt-28">
        <div className="absolute inset-0 bg-web-pattern opacity-10" />

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Link to="/" className="transition-colors hover:text-foreground">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link to="/shop" className="transition-colors hover:text-foreground">
            Shop
          </Link>
          {collectionSlug && (
            <>
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
              <Link to={`/collections/${collectionSlug}`} className="transition-colors hover:text-foreground">
                {displayCollection}
              </Link>
            </>
          )}
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
          <span aria-current="page" className="max-w-[14rem] truncate text-foreground">{product.name}</span>
        </nav>

        <motion.div
          className="comic-panel product-detail-card flex flex-col overflow-hidden md:grid md:grid-cols-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Product image gallery */}
          <div className="product-gallery w-full min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="product-gallery-frame relative aspect-[4/5] overflow-hidden bg-[#f1f2f4]">
              <motion.img
                key={displayedImage}
                src={displayedImage}
                alt={
                  galleryImages.length > 1
                    ? `${product.name} — image ${currentImageIndex + 1} of ${galleryImages.length}`
                    : product.name
                }
                className="h-full w-full object-contain"
                {...{ fetchpriority: 'high' }}
                decoding="async"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />

              {/* Editorial corner accents */}

              {product.featured && (
                <span className="absolute left-4 top-4 rounded-full border border-border bg-white/95 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm">
                  Featured
                </span>
              )}

              {selectedVersion?.isPreorder && (
                <span className="absolute right-4 top-4 rounded-full border border-primary/20 bg-white/95 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm backdrop-blur-sm">
                  Pre-Order
                </span>
              )}

              {/* Prev/next controls, only shown when there's more than one image */}
              {galleryImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrevImage}
                    aria-label="Previous image"
                    className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white/95 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextImage}
                    aria-label="Next image"
                    className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white/95 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails, only shown when there's more than one image */}
            {galleryImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto px-4 py-3 lg:px-5">
                {galleryImages.map((img, index) => (
                  <button
                    key={img}
                    type="button"
                    onClick={() => setActiveImage(img)}
                    aria-label={`View image ${index + 1} of ${galleryImages.length}`}
                    aria-current={displayedImage === img}
                    className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border bg-white transition-all ${
                      displayedImage === img
                        ? 'border-primary ring-2 ring-primary/15'
                        : 'border-border hover:border-foreground/40'
                    }`}
                  >
                    <img src={img} alt="" loading="lazy" className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product info */}
          <div className="comic-product-copy product-info-column relative flex min-w-0 flex-1 flex-col p-5 sm:p-7 lg:p-9 xl:p-10">
            {/* Collection label */}
            <div className="flex flex-wrap items-center gap-3">
              {collectionSlug ? (
                <Link
                  to={`/collections/${collectionSlug}`}
                  className="product-collection-link"
                >
                  {displayCollection}
                </Link>
              ) : (
                <span className="product-collection-link">
                  {displayCollection}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="mt-5 max-w-2xl font-display text-4xl leading-[1.02] tracking-wide text-foreground sm:text-5xl">
              {product.name}
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{getProductSummary(product, selectedVersion)}</p>

            {/* Price */}
            <div className="product-price-row mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="font-display text-4xl leading-none text-foreground sm:text-5xl">
                {displayedPrice > 0 ? formatPrice(displayedPrice) : 'Unavailable'}
              </p>
              {selectedVersion?.isPreorder && <span className="rounded-full bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">Pre-order</span>}
            </div>


            {!mobileLayout && description}

            {/* Version selector — only shown when a product actually offers
                more than one apparel version (e.g. Jersey vs Oversized Cotton) */}
            {activeVersions.length === 0 && (
              <div role="status" className="comic-panel mt-8 border-primary bg-primary/10 px-4 py-3 text-sm font-bold text-foreground">
                This edition is currently unavailable. Check back soon for the next drop.
              </div>
            )}
            {activeVersions.length > 1 && (
              <div className="mt-7">
                <p className="mb-3 text-sm font-semibold text-foreground">Style</p>
                <div className="flex flex-wrap gap-2">
                  {activeVersions.map((version) => (
                    <motion.button
                      key={version.id}
                      type="button"
                      aria-pressed={selectedVersion?.id === version.id}
                      className={`comic-option-button min-h-11 px-4 py-2.5 text-sm font-medium transition-all ${
                        selectedVersion?.id === version.id
                          ? 'is-selected'
                          : ''
                      }`}
                      onClick={() => handleSelectVersion(version.id)}
                    >
                      {version.versionName}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Size selector */}
            <div ref={sizeOptionsRef} className="mt-7">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Size</p>
                  <p className="mt-1 text-xs text-muted">{!isInStock ? 'No sizes available' : selectedSize ? `Selected: ${formatSize(selectedSize)}` : 'Choose a size'}</p>
                </div>
                {(

                  <button
                    type="button"
                    onClick={() => setShowSizeGuide(true)}
                    className="comic-size-guide inline-flex min-h-10 items-center gap-2 px-3 text-xs font-medium transition-all"
                  >
                    <Ruler className="h-3.5 w-3.5" />
                    {hasSizeGuide ? 'Fit guide' : 'Fit help'}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(selectedVersion?.sizes ?? []).map((sizeRow) => {
                  const size = sizeRow.size;
                  const inStock = selectedVersion ? isSizeInStock(selectedVersion, size) : false;
                  return (
                    <div key={size} className="flex flex-col items-center gap-1">
                      <motion.button
                        type="button"
                        disabled={!inStock}
                        aria-pressed={selectedSize === size && inStock}
                        aria-label={`${formatSize(size)}${inStock ? '' : ' — sold out'}`}
                        className={`comic-size-choice min-h-12 min-w-14 px-4 py-2 text-sm font-semibold transition-all ${
                          selectedSize === size && inStock
                            ? 'is-selected'
                            : ''
                        }`}
                        onClick={() => {
                          if (!inStock) return;
                          setSelectedSize(size);
                          setQuantity(1);
                        }}
                      >
                        {formatSize(size)}
                      </motion.button>
                      {!inStock && (
                        <span className="text-[9px] font-extrabold uppercase tracking-wide text-primary">
                          Sold out
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quantity selector */}
            {availableStock > 0 && <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Quantity</p>
                {availableStock > 0 && <p className="text-xs font-medium text-muted-foreground">{availableStock <= 3 ? `Only ${availableStock} left` : 'In stock'}</p>}
              </div>
              <div className="comic-stepper inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="flex h-11 w-11 items-center justify-center text-foreground transition-colors hover:bg-warning disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-12 text-center font-display text-xl tabular-nums text-foreground">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                  disabled={quantity >= maxQuantity}
                  className="flex h-11 w-11 items-center justify-center text-foreground transition-colors hover:bg-warning disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>}

            {!isInStock && (
              <p role="status" className="mt-3 text-sm font-medium text-muted-foreground">
                {isInStock ? 'This size is currently sold out. Choose another available size to continue.' : activeVersions.length > 1 ? 'This style is currently sold out. Try another style or browse the shop.' : 'This design is currently sold out. Browse the shop for available designs.'}
              </p>
            )}

            {/* Pre-order notice */}
            {preorderMessage && (
              <div className="comic-panel mt-6 flex items-start gap-3 border-primary bg-primary/5 px-4 py-3 text-sm font-semibold text-foreground">
                <Truck className="h-4 w-4 flex-shrink-0" />
                <span><span className="font-semibold text-primary">Pre-order dispatch</span><br />{preorderMessage}</span>
              </div>
            )}

            {/* CTA buttons */}
            <div className="mt-6">
              <motion.button
                ref={purchaseCtaRef}
                type="button"
                onClick={handleAddToCart}
                disabled={!isInStock}
                className="btn-primary relative min-h-12 w-full disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ShoppingBag aria-hidden="true" className="h-5 w-5" />
                {activeVersions.length === 0
                  ? 'Currently Unavailable'
                  : !isInStock
                  ? 'Sold Out'
                  : !selectedSize
                  ? 'Choose your size'
                  : selectedVersion?.isPreorder
                    ? 'Pre-Order Now'
                    : 'Add to Cart'}
              </motion.button>
              {stockMessage && (
                <p className="mt-2 text-xs text-primary">{stockMessage}</p>
              )}
              {!isInStock && <Link to="/shop" className="btn-outline mt-3 w-full">Browse all designs</Link>}
            </div>

            {mobileLayout && description}

            {/* Trust badges */}
            <div className="product-trust mt-5 grid grid-cols-1 gap-2 border-y border-border py-4 sm:grid-cols-3">
              <div className="comic-trust-card flex items-center gap-2 px-2 py-2 text-xs font-medium leading-tight text-muted-foreground">
                <Truck className="h-4 w-4 flex-shrink-0 text-primary" />
                Delivery · {formatPrice(STORE_CONFIG.deliveryFee)}
              </div>
              <div className="comic-trust-card flex items-center gap-2 px-2 py-2 text-xs font-medium leading-tight text-muted-foreground">
                <ShieldCheck className="h-4 w-4 flex-shrink-0 text-primary" />
                COD or bank transfer
              </div>
              <Link to="/return-policy" className="comic-trust-card flex items-center gap-2 px-2 py-2 text-xs font-medium leading-tight text-muted-foreground transition-colors hover:text-primary">
                <RefreshCw className="h-4 w-4 flex-shrink-0 text-primary" />
                Read exchange policy
              </Link>
            </div>

            <Link to="/delivery" className="inline-flex min-h-11 items-center text-xs font-medium text-primary underline underline-offset-4">Delivery cost and timing</Link>
            <Reviews productName={product.name} compact />

            {/* Accordion: details, materials, care, shipping */}
            <div className="comic-accordion mt-6">
              {product.lore && (
                <AccordionItem
                  title="Design story"
                  isOpen={openSection === 'story'}
                  onToggle={() => toggleSection('story')}
                >
                  <p className="text-sm leading-relaxed text-muted-foreground">{product.lore}</p>
                </AccordionItem>
              )}
              <AccordionItem
                title="Product details"
                isOpen={openSection === 'details'}
                onToggle={() => toggleSection('details')}
              >
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {selectedVersion?.productType && (
                    <li>
                      <span className="text-muted">Type:</span>{' '}
                      {PRODUCT_TYPE_LABELS[selectedVersion.productType]}
                    </li>
                  )}
                  {selectedVersion?.material && (
                    <li>
                      <span className="text-muted">Material:</span> {selectedVersion.material}
                    </li>
                  )}
                  {selectedVersion?.fit && (
                    <li>
                      <span className="text-muted">Fit:</span> {selectedVersion.fit}
                    </li>
                  )}
                  {selectedVersion?.color && selectedVersion.color.toLowerCase() !== 'other' && (
                    <li>
                      <span className="text-muted">Color:</span> {selectedVersion.color}
                    </li>
                  )}
                  <li>
                    <span className="text-muted">Available sizes:</span>{' '}
                    {(selectedVersion?.sizes ?? []).filter((s) => selectedVersion && isSizeInStock(selectedVersion, s.size)).map((s) => formatSize(s.size)).join(', ') || 'Currently sold out'}
                  </li>
                </ul>
              </AccordionItem>

              <AccordionItem
                title="Care Instructions"
                isOpen={openSection === 'care'}
                onToggle={() => toggleSection('care')}
              >
                <ul className="list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
                  {(selectedVersion?.careInstructions ?? []).map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                </ul>
              </AccordionItem>

              <AccordionItem
                title="Shipping & Returns"
                isOpen={openSection === 'shipping'}
                onToggle={() => toggleSection('shipping')}
              >
                <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                  <p>{STORE_CONFIG.deliveryTiming} Delivery costs {formatPrice(STORE_CONFIG.deliveryFee)}. Pre-orders follow the timeframe shown for the selected style.</p>
                  <p>For a size exchange or change-of-mind return, contact us within 3 days of delivery. Exchanges depend on stock, and return delivery charges may apply. Damaged or incorrect items are handled under the full policy.</p>
                  <Link to="/return-policy" className="inline-flex font-medium text-primary underline underline-offset-4 hover:text-primary-hover">Read the return and exchange policy</Link>
                </div>
              </AccordionItem>
            </div>
          </div>
        </motion.div>

        {/* Related products */}
        {relatedProducts.length > 0 && (
          <div className="mt-16">
            <h2 className="font-display text-2xl text-foreground tracking-wide">
              {isInStock ? 'You may also like' : 'Available designs to explore'}
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {relatedProducts.map((related, index) => (
                <ProductCard key={related.id} product={related} index={index} />
              ))}
            </div>
          </div>
        )}
      </div>

      {showStickyBuy && (
        <div className="product-sticky-buy fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(23,25,29,0.08)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <button type="button" disabled={!isInStock} aria-label={isInStock ? "Change size" : "No sizes available"} onClick={() => {
              sizeOptionsRef.current?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
              sizeOptionsRef.current?.querySelector<HTMLButtonElement>('.comic-size-choice:not(:disabled)')?.focus({ preventScroll: true });
            }} className="min-h-11 min-w-0 flex-1 text-left">
              <span className="block truncate text-xs text-muted-foreground">{!isInStock ? 'No sizes available' : selectedSize ? `Size ${formatSize(selectedSize)} · Change` : 'Choose a size'}</span>
              <span className="block font-semibold text-foreground">{displayedPrice > 0 ? formatPrice(displayedPrice) : 'Unavailable'}</span>
            </button>
            <button type="button" onClick={handleAddToCart} disabled={!isInStock} className="btn-primary min-h-11 shrink-0 disabled:cursor-not-allowed disabled:opacity-50">
              {!isInStock ? 'Sold out' : !selectedSize ? 'Choose your size' : selectedVersion?.isPreorder ? 'Pre-order' : 'Add to cart'}
            </button>
          </div>
        </div>
      )}

    </section>

      {/* Size guide modal */}
      <AnimatePresence>
        {showSizeGuide && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-foreground/70 px-3 py-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSizeGuide(false)}
          >
            <motion.div
              ref={sizeGuidePanelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-size-guide-title"
              className="comic-panel w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain p-0"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
            >
            <div className="mb-4 flex items-center justify-between border-b border-border bg-white px-5 py-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{hasSizeGuide ? 'Garment measurements · Inches' : 'Choose with confidence'}</p>
                  <h3 id="product-size-guide-title" className="font-display text-2xl text-foreground tracking-wide">{hasSizeGuide ? 'Size guide' : 'Fit help'}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSizeGuide(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  aria-label="Close size guide"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="overflow-x-auto px-5">
              {hasSizeGuide && <svg viewBox="0 0 240 125" role="img" aria-label="Compare the chest, body length and sleeve of a garment laid flat" className="mx-auto mb-3 h-28 w-full max-w-xs text-muted">
                <path d="M85 15 55 25 20 60 47 80 63 62 63 113 177 113 177 62 193 80 220 60 185 25 155 15Q120 43 85 15Z" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M74 65H166M120 47V103M183 37 205 60" stroke="#c52832" strokeWidth="2" />
                <text x="120" y="59" textAnchor="middle" fontSize="10" fill="currentColor">Chest</text>
                <text x="126" y="94" fontSize="10" fill="currentColor">Length</text>
                <text x="191" y="26" fontSize="10" fill="currentColor">Sleeve</text>
              </svg>}
              {hasSizeGuide ? <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-foreground">
                    <th scope="col" className="py-2 font-semibold">Size</th>
                    <th scope="col" className="py-2 font-semibold">Chest</th>
                    <th scope="col" className="py-2 font-semibold">Length</th>
                    <th scope="col" className="py-2 font-semibold">Sleeve</th>
                  </tr>
                </thead>
                <tbody>
                  {sizeGuide.map((row) => (
                    <tr key={row.size} className="border-b border-border text-muted-foreground">
                      <td className="py-2 font-medium text-foreground">{formatSize(row.size)}</td>
                      <td className="py-2">{row.chest}</td>
                      <td className="py-2">{row.length}</td>
                      <td className="py-2">{row.sleeve}</td>
                    </tr>
                  ))}
                </tbody>
              </table> : <p className="py-4 text-sm leading-relaxed text-muted">Measurements for this style are not published yet. Ask us for the fit details before choosing your size.</p>}
              </div>
              <p className="px-5 pb-5 pt-4 text-xs leading-relaxed text-muted-foreground">
                {hasSizeGuide ? 'Measurements are in inches. Compare these garment measurements with a T-shirt you own. Measurements are approximate.' : 'Include your usual size and the style you are considering when asking for fit details.'}
                <a href={`https://wa.me/94787756338?text=${encodeURIComponent(`Hi, can you help me with sizing for ${product.name}?`)}`} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">Ask about fit on WhatsApp</a>
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function AccordionItem({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panelId = useId();
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        className="flex w-full items-center justify-between py-4 text-left"
      >
        <span className="text-sm font-extrabold uppercase tracking-wide text-foreground">{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
