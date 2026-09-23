import { motion, AnimatePresence } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
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
import { useEffect, useState } from 'react';
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
} from '../data/products';
import type { Product as ProductType, ProductVersion } from '../data/products';
import { fetchCollectionById } from '../data/collections';
import SEO, { type JsonLdBlock } from '../components/SEO';
import { STORE_CONFIG } from '../config/store';

const SITE_URL = 'https://comicculture.lk';

// --- Merchant Listings structured data: store-wide policy constants ---
// These describe ComicCulture's actual, already-published policies (see
// ReturnPolicy.tsx and the "Shipping & Returns" accordion below) — not
// per-product data, so they're defined once here and reused for every
// product's JSON-LD automatically.

/**
 * Mirrors ReturnPolicy.tsx section 2 ("Change of Mind Returns"): a 3-day
 * contact window, and the customer covers return delivery charges. This
 * intentionally represents the general/default policy — ReturnPolicy.tsx's
 * carve-outs (e.g. damaged/defective items, where ComicCulture arranges a
 * free resolution) aren't expressible in this single structured field.
 */
const RETURN_POLICY_JSONLD = {
  '@type': 'MerchantReturnPolicy',
  returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
  merchantReturnDays: 3,
  returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
  applicableCountry: 'LK',
} as const;

/**
 * Mirrors the "Shipping & Returns" accordion text below: dispatch within
 * 1-2 business days, arrival within 2-4 business days, island-wide
 * (Sri Lanka only — the site has no other delivery region anywhere).
 * `shippingRate` uses the centralized STORE_CONFIG.deliveryFee (the same
 * Rs. 350 customer-facing delivery fee charged at checkout) rather than a
 * hardcoded value.
 */
const SHIPPING_DETAILS_JSONLD = {
  '@type': 'OfferShippingDetails',
  shippingRate: {
    '@type': 'MonetaryAmount',
    value: STORE_CONFIG.deliveryFee,
    currency: STORE_CONFIG.currency,
  },
  shippingDestination: {
    '@type': 'DefinedRegion',
    addressCountry: 'LK',
  },
  deliveryTime: {
    '@type': 'ShippingDeliveryTime',
    handlingTime: {
      '@type': 'QuantitativeValue',
      minValue: 1,
      maxValue: 2,
      unitCode: 'DAY',
    },
    transitTime: {
      '@type': 'QuantitativeValue',
      minValue: 2,
      maxValue: 4,
      unitCode: 'DAY',
    },
  },
} as const;

/**
 * Builds a concise, unique meta description from real product data only —
 * no invented claims (e.g. "limited edition"). Falls back through
 * description -> tagline -> a plain collection-based sentence, and trims
 * to a search-snippet-friendly length.
 */
function buildProductMetaDescription(product: ProductType): string {
  const source =
    product.description?.trim() ||
    product.tagline?.trim() ||
    `${product.name} from ComicCulture's ${product.collection} collection.`;
  return source.length > 160 ? `${source.slice(0, 157).trimEnd()}…` : source;
}

/**
 * Picks the version a freshly-loaded product (or a version switch) should
 * land on: the first *active* version, falling back to the first version
 * at all if none are marked active (so the page never has nothing to show).
 */
function pickDefaultVersion(product: ProductType): ProductVersion | undefined {
  const active = product.versions.filter((v) => v.isActive);
  return (active.length > 0 ? active : product.versions)[0];
}

/** First in-stock size of a version, falling back to its first size at all. */
function pickDefaultSize(version: ProductVersion | undefined): string {
  if (!version) return '';
  const inStock = version.sizes.find((s) => isSizeInStock(version, s.size));
  return inStock?.size ?? version.sizes[0]?.size ?? '';
}

const SIZE_GUIDE = [
  { size: 'XS', chest: '18"', length: '26"', sleeve: '7¼"' },
  { size: 'S', chest: '19"', length: '27"', sleeve: '7¾"' },
  { size: 'M', chest: '20"', length: '28"', sleeve: '8¼"' },
  { size: 'L', chest: '21"', length: '29"', sleeve: '8¾"' },
  { size: 'XL', chest: '22"', length: '30"', sleeve: '9¼"' },
  { size: 'XXL', chest: '23"', length: '31"', sleeve: '9¾"' },
];

type AccordionKey = 'description' | 'details' | 'care' | 'shipping';

export default function Product() {
  const { slug } = useParams<{ slug: string }>();
  const { product, loading, error } = useProduct(slug);
  const { products: allProducts } = useProducts();
  const { addItem, openCart, stockMessage } = useCart();
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [openSection, setOpenSection] = useState<AccordionKey | null>('description');
  const [collectionSlug, setCollectionSlug] = useState<string | null>(null);

  // Reset per-product UI state whenever the loaded product changes: land on
  // the default version, its default size, and its own image (falling back
  // to the product's design image if the version has none uploaded yet).
  useEffect(() => {
    if (product) {
      const defaultVersion = pickDefaultVersion(product);
      setSelectedVersionId(defaultVersion?.id ?? '');
      setActiveImage(defaultVersion?.images?.[0] ?? product.image);
      setSelectedSize(pickDefaultSize(defaultVersion));
      setQuantity(1);
    }
  }, [product]);

  // Resolve the product's collection slug (for the internal collection link)
  // from the relational collection_id, since `product.collection` is only a
  // display name. Legacy products with no collectionId simply get no link.
  useEffect(() => {
    let cancelled = false;
    if (!product?.collectionId) {
      setCollectionSlug(null);
      return;
    }
    fetchCollectionById(product.collectionId)
      .then((collection) => {
        if (!cancelled) setCollectionSlug(collection?.slug ?? null);
      })
      .catch(() => {
        if (!cancelled) setCollectionSlug(null);
      });
    return () => {
      cancelled = true;
    };
  }, [product?.collectionId]);

  if (loading) {
    return (
      <section className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading product...</p>
      </section>
    );
  }

  if (error || !product) {
    return (
      <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
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
  const activeVersions =
    product.versions.filter((v) => v.isActive).length > 0
      ? product.versions.filter((v) => v.isActive)
      : product.versions;
  const selectedVersion =
    product.versions.find((v) => v.id === selectedVersionId) ?? activeVersions[0];
  const selectedVersionSize = selectedVersion?.sizes.find((s) => s.size === selectedSize);

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

  const relatedProducts = allProducts
    .filter((p) => p.collection === product.collection && p.slug !== product.slug)
    .slice(0, 4);

  const availableStock = selectedVersion ? getStockForSize(selectedVersion, selectedSize) : 0;
  const maxQuantity = Math.max(1, Math.min(10, availableStock));
  const preorderMessage = selectedVersion ? getPreorderMessage(selectedVersion) : null;

  const canonicalUrl = `${SITE_URL}/product/${product.slug}`;
  const metaDescription = buildProductMetaDescription(product);
  const isInStock = selectedVersion
    ? selectedVersion.sizes.some((size) => isSizeInStock(selectedVersion, size.size))
    : false;

  const productJsonLd: JsonLdBlock = {
    id: 'product',
    data: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: metaDescription,
      image: product.image,
      sku: selectedVersionSize?.sku,
      brand: {
        '@type': 'Brand',
        name: 'ComicCulture',
      },
      offers: {
        '@type': 'Offer',
        url: canonicalUrl,
        price: selectedVersionSize?.price ?? 0,
        priceCurrency: 'LKR',
        availability: isInStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        hasMerchantReturnPolicy: RETURN_POLICY_JSONLD,
        shippingDetails: SHIPPING_DETAILS_JSONLD,
      },
    },
  };

  const breadcrumbJsonLd: JsonLdBlock = {
    id: 'breadcrumb',
    data: {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Shop', item: `${SITE_URL}/shop` },
        { '@type': 'ListItem', position: 3, name: product.name, item: canonicalUrl },
      ],
    },
  };

  const handleSelectVersion = (versionId: string) => {
    if (versionId === selectedVersionId) return;
    const version = product.versions.find((v) => v.id === versionId);
    setSelectedVersionId(versionId);
    setActiveImage(version?.images?.[0] ?? product.image);
    setSelectedSize(pickDefaultSize(version));
    setQuantity(1);
  };

  const handleAddToCart = () => {
    if (!selectedVersion || !selectedVersionSize) return;
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

  const toggleSection = (key: AccordionKey) => {
    setOpenSection((current) => (current === key ? null : key));
  };

  return (
    <>
      <SEO
        title={`${product.name} | ComicCulture`}
        description={metaDescription}
        canonical={canonicalUrl}
        ogType="product"
        image={product.image}
        jsonLd={[productJsonLd, breadcrumbJsonLd]}
      />
      <section className="relative min-h-screen bg-background py-24 lg:py-32">
        <div className="absolute inset-0 bg-web-pattern opacity-10" />

        <div className="relative z-10 mx-auto max-w-6xl px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link to="/" className="transition-colors hover:text-foreground">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link to="/shop" className="transition-colors hover:text-foreground">
            Shop
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-muted">{product.name}</span>
        </nav>

        <Link
          to="/shop"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Shop
        </Link>

        <motion.div
          className="flex flex-col overflow-hidden border border-border bg-surface lg:flex-row"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Product image gallery */}
          <div className="flex-shrink-0 lg:w-1/2">
            <div className="relative aspect-square overflow-hidden bg-background">
              <motion.img
                key={displayedImage}
                src={displayedImage}
                alt={
                  galleryImages.length > 1
                    ? `${product.name} — image ${currentImageIndex + 1} of ${galleryImages.length}`
                    : product.name
                }
                className="h-full w-full object-cover"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />

              {/* Editorial corner accents */}
              <span className="pointer-events-none absolute top-4 right-4 h-6 w-6 border-t border-r border-foreground/20" />
              <span className="pointer-events-none absolute bottom-4 left-4 h-6 w-6 border-b border-l border-foreground/20" />

              {product.featured && (
                <span className="absolute left-4 top-4 border border-border bg-background/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary backdrop-blur-sm">
                  Featured
                </span>
              )}

              {selectedVersion?.isPreorder && (
                <span className="absolute right-4 top-4 border border-primary/30 bg-primary/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary backdrop-blur-sm">
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
                    className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground backdrop-blur-sm transition-colors hover:border-foreground active:scale-95"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextImage}
                    aria-label="Next image"
                    className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground backdrop-blur-sm transition-colors hover:border-foreground active:scale-95"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails, only shown when there's more than one image */}
            {galleryImages.length > 1 && (
              <div className="flex gap-3 overflow-x-auto p-4">
                {galleryImages.map((img, index) => (
                  <button
                    key={img}
                    type="button"
                    onClick={() => setActiveImage(img)}
                    aria-label={`View image ${index + 1} of ${galleryImages.length}`}
                    aria-current={displayedImage === img}
                    className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                      displayedImage === img
                        ? 'border-primary'
                        : 'border-border hover:border-foreground'
                    }`}
                  >
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product info */}
          <div className="relative flex flex-1 flex-col p-6 lg:p-10">
            {/* Collection label */}
            <div className="flex items-center justify-between">
              {collectionSlug ? (
                <Link
                  to={`/collections/${collectionSlug}`}
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-primary hover:underline"
                >
                  {product.collection}
                </Link>
              ) : (
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  {product.collection}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="mt-4 font-display text-3xl text-foreground tracking-wide lg:text-4xl">
              {product.name}
            </h1>

            {/* Lore */}
            <p className="mt-2 text-lg text-muted-foreground italic">"{product.lore}"</p>

            {/* Price */}
            <div className="mt-4 flex items-baseline gap-3">
              <p className="font-display text-4xl text-foreground">
                {formatPrice(selectedVersionSize?.price ?? 0)}
              </p>
            </div>

            {/* Description */}
            <p className="mt-6 text-muted-foreground leading-relaxed">{product.description}</p>

            {/* Version selector — only shown when a product actually offers
                more than one apparel version (e.g. Jersey vs Oversized Cotton) */}
            {activeVersions.length > 1 && (
              <div className="mt-8">
                <p className="mb-3 text-sm font-medium text-muted">
                  Select Version
                  {selectedVersion && (
                    <span className="text-muted-foreground"> — {selectedVersion.versionName}</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {activeVersions.map((version) => (
                    <motion.button
                      key={version.id}
                      type="button"
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                        selectedVersion?.id === version.id
                          ? 'border-primary bg-primary/20 text-primary'
                          : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                      }`}
                      onClick={() => handleSelectVersion(version.id)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {version.versionName}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Size selector */}
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-muted">
                  Select Size <span className="text-muted-foreground">— {selectedSize}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setShowSizeGuide(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Ruler className="h-3.5 w-3.5" />
                  Size Guide
                </button>
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
                        className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                          selectedSize === size
                            ? 'border-primary bg-primary/20 text-primary'
                            : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                        } ${
                          !inStock
                            ? 'cursor-not-allowed opacity-40 hover:border-border hover:text-muted-foreground'
                            : ''
                        }`}
                        onClick={() => {
                          if (!inStock) return;
                          setSelectedSize(size);
                          setQuantity(1);
                        }}
                        whileHover={inStock ? { scale: 1.05 } : undefined}
                        whileTap={inStock ? { scale: 0.95 } : undefined}
                      >
                        {size}
                      </motion.button>
                      {!inStock && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Sold out
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quantity selector */}
            <div className="mt-6">
              <p className="mb-3 text-sm font-medium text-muted">Quantity</p>
              <div className="inline-flex items-center rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center text-sm font-medium text-foreground">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                  disabled={quantity >= maxQuantity}
                  className="flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {quantity >= maxQuantity && availableStock > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Only {availableStock} left in size {selectedSize}
                </p>
              )}
            </div>

            {/* Pre-order notice */}
            {preorderMessage && (
              <div className="mt-6 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
                <Truck className="h-4 w-4 flex-shrink-0" />
                Pre-Order — {preorderMessage}
              </div>
            )}

            {/* CTA buttons */}
            <div className="mt-8">
              <motion.button
                type="button"
                onClick={handleAddToCart}
                disabled={availableStock === 0 || !selectedVersionSize}
                className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <ShoppingBag className="h-5 w-5" />
                {availableStock === 0
                  ? 'Sold Out'
                  : selectedVersion?.isPreorder
                    ? 'Pre-Order Now'
                    : 'Add to Cart'}
              </motion.button>
              {stockMessage && (
                <p className="mt-2 text-xs text-primary">{stockMessage}</p>
              )}
            </div>

            {/* Trust badges */}
            <div className="mt-8 grid grid-cols-1 gap-3 border-t border-border pt-6 sm:grid-cols-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Truck className="h-4 w-4 flex-shrink-0 text-primary" />
                Island-wide delivery
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 flex-shrink-0 text-primary" />
                Secure ordering
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-4 w-4 flex-shrink-0 text-primary" />
                7-day exchange
              </div>
            </div>

            {/* Accordion: details, materials, care, shipping */}
            <div className="mt-8 divide-y divide-border border-t border-border">
              <AccordionItem
                title="Details & Materials"
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
                  {selectedVersion?.color && (
                    <li>
                      <span className="text-muted">Color:</span> {selectedVersion.color}
                    </li>
                  )}
                  <li>
                    <span className="text-muted">Available sizes:</span>{' '}
                    {(selectedVersion?.sizes ?? []).map((s) => s.size).join(', ')}
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
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Orders are dispatched within 1-2 business days and typically arrive within
                  2-4 business days island-wide. If an item doesn't fit right, reach out to us
                  on WhatsApp within 7 days of delivery to arrange a free size exchange.
                </p>
              </AccordionItem>
            </div>
          </div>
        </motion.div>

        {/* Related products */}
        {relatedProducts.length > 0 && (
          <div className="mt-16">
            <h2 className="font-display text-2xl text-foreground tracking-wide">
              More from {product.collection}
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {relatedProducts.map((related) => (
                <RelatedProductCard key={related.id} product={related} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Size guide modal */}
      <AnimatePresence>
        {showSizeGuide && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/70 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSizeGuide(false)}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl border border-border bg-background p-6"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-xl text-foreground tracking-wide">Size Guide</h3>
                <button
                  type="button"
                  onClick={() => setShowSizeGuide(false)}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Close size guide"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 font-medium">Size</th>
                    <th className="py-2 font-medium">Chest</th>
                    <th className="py-2 font-medium">Length</th>
                  </tr>
                </thead>
                <tbody>
                  {SIZE_GUIDE.map((row) => (
                    <tr key={row.size} className="border-b border-border text-muted-foreground">
                      <td className="py-2 font-medium text-foreground">{row.size}</td>
                      <td className="py-2">{row.chest}</td>
                      <td className="py-2">{row.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 text-xs text-muted-foreground">
                Measurements are approximate. Between sizes? Message us on WhatsApp and we'll
                help you pick the right fit.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
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
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between py-4 text-left"
      >
        <span className="text-sm font-medium text-foreground">{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
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

function RelatedProductCard({ product }: { product: ProductType }) {
  return (
    <Link
      to={`/product/${product.slug}`}
      className="group overflow-hidden border border-border bg-surface transition-colors hover:border-foreground/40"
    >
      <div className="aspect-square overflow-hidden bg-background">
        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
        <p className="mt-1 text-sm text-primary">{formatPrice(getProductMinPrice(product))}</p>
      </div>
    </Link>
  );
}
