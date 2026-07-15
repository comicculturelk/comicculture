import { motion, AnimatePresence } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import {
  MessageCircle,
  Instagram,
  ArrowLeft,
  ShoppingBag,
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
import { generateWhatsAppMessage, formatPrice } from '../data/products';
import type { Product as ProductType } from '../data/products';

const SIZE_GUIDE = [
  { size: 'S', chest: '36-38"', length: '27"' },
  { size: 'M', chest: '39-41"', length: '28"' },
  { size: 'L', chest: '42-44"', length: '29"' },
  { size: 'XL', chest: '45-47"', length: '30"' },
  { size: 'XXL', chest: '48-50"', length: '31"' },
];

type AccordionKey = 'description' | 'details' | 'care' | 'shipping';

export default function Product() {
  const { slug } = useParams<{ slug: string }>();
  const { product, loading, error } = useProduct(slug);
  const { products: allProducts } = useProducts();
  const { addItem, openCart } = useCart();
  const [selectedSize, setSelectedSize] = useState<string>('M');
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [openSection, setOpenSection] = useState<AccordionKey | null>('description');

  // Reset per-product UI state whenever the loaded product changes
  useEffect(() => {
    if (product) {
      setActiveImage(product.image);
      setSelectedSize(product.sizes[0] ?? 'M');
      setQuantity(1);
    }
  }, [product]);

  if (loading) {
    return (
      <section className="flex min-h-screen items-center justify-center bg-brand-bg">
        <p className="text-white/50">Loading product...</p>
      </section>
    );
  }

  if (error || !product) {
    return (
      <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-bg px-6 text-center">
        <p className="text-brand-red">
          {error ? "Couldn't load this product." : "We couldn't find that product."}
        </p>
        <Link to="/shop" className="btn-primary">
          Back to Shop
        </Link>
      </section>
    );
  }

  const whatsappLink = `https://wa.me/94787756338?text=${generateWhatsAppMessage(
    product,
    selectedSize,
    quantity
  )}`;

  const galleryImages =
    product.images && product.images.length > 0
      ? [product.image, ...product.images.filter((img) => img !== product.image)]
      : [product.image];

  const displayedImage = activeImage ?? product.image;

  const relatedProducts = allProducts
    .filter((p) => p.collection === product.collection && p.slug !== product.slug)
    .slice(0, 4);

  const handleAddToCart = () => {
    for (let i = 0; i < quantity; i += 1) {
      addItem({
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: product.image,
        price: product.price,
        size: selectedSize,
      });
    }
    openCart();
  };

  const toggleSection = (key: AccordionKey) => {
    setOpenSection((current) => (current === key ? null : key));
  };

  return (
    <section className="relative min-h-screen bg-brand-bg py-24 lg:py-32">
      <div className="absolute inset-0 bg-web-pattern opacity-10" />

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-1.5 text-sm text-white/50">
          <Link to="/" className="transition-colors hover:text-white">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link to="/shop" className="transition-colors hover:text-white">
            Shop
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-white/80">{product.name}</span>
        </nav>

        <Link
          to="/shop"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-white/60 transition-colors hover:text-white lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Shop
        </Link>

        <motion.div
          className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 lg:flex-row"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Product image gallery */}
          <div className="flex-shrink-0 lg:w-1/2">
            <div className="relative aspect-square overflow-hidden bg-brand-bg">
              <motion.img
                key={displayedImage}
                src={displayedImage}
                alt={product.name}
                className="h-full w-full object-cover"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-bg via-transparent to-transparent lg:bg-gradient-to-r" />
              {product.featured && (
                <span className="absolute left-4 top-4 rounded-full bg-brand-red px-3 py-1 text-xs font-semibold text-white">
                  Featured
                </span>
              )}
            </div>

            {/* Thumbnails, only shown when there's more than one image */}
            {galleryImages.length > 1 && (
              <div className="flex gap-3 p-4">
                {galleryImages.map((img) => (
                  <button
                    key={img}
                    type="button"
                    onClick={() => setActiveImage(img)}
                    className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                      displayedImage === img
                        ? 'border-brand-red'
                        : 'border-white/20 hover:border-white/40'
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
            {/* Collection badge + SKU */}
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-brand-red/20 px-3 py-1 text-xs font-medium text-brand-red">
                {product.collection}
              </span>
              {product.sku && (
                <span className="text-xs uppercase tracking-wide text-white/40">
                  SKU: {product.sku}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="mt-4 font-display text-3xl text-white tracking-wide lg:text-4xl">
              {product.name}
            </h1>

            {/* Lore */}
            <p className="mt-2 text-lg text-white/60 italic">"{product.lore}"</p>

            {/* Price */}
            <p className="mt-4 font-display text-4xl text-brand-red">
              {formatPrice(product.price)}
            </p>

            {/* Description */}
            <p className="mt-6 text-white/70 leading-relaxed">{product.description}</p>

            {/* Size selector */}
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-white/80">
                  Select Size <span className="text-white/50">— {selectedSize}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setShowSizeGuide(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-white/50 transition-colors hover:text-white"
                >
                  <Ruler className="h-3.5 w-3.5" />
                  Size Guide
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((size) => (
                  <motion.button
                    key={size}
                    type="button"
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                      selectedSize === size
                        ? 'border-brand-red bg-brand-red/20 text-brand-red'
                        : 'border-white/20 text-white/70 hover:border-white/40 hover:text-white'
                    }`}
                    onClick={() => setSelectedSize(size)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {size}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Quantity selector */}
            <div className="mt-6">
              <p className="mb-3 text-sm font-medium text-white/80">Quantity</p>
              <div className="inline-flex items-center rounded-lg border border-white/20">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="flex h-10 w-10 items-center justify-center text-white/70 transition-colors hover:text-white disabled:opacity-30"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center text-sm font-medium text-white">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                  disabled={quantity >= 10}
                  className="flex h-10 w-10 items-center justify-center text-white/70 transition-colors hover:text-white disabled:opacity-30"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* CTA buttons */}
            <div className="mt-8">
              <motion.button
                type="button"
                onClick={handleAddToCart}
                className="btn-primary w-full"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <ShoppingBag className="h-5 w-5" />
                Add to Cart
              </motion.button>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <motion.a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-green-500"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <MessageCircle className="h-5 w-5" />
                  Order on WhatsApp
                </motion.a>
                <motion.a
                  href={product.instagramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 px-6 py-3 font-semibold text-white"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Instagram className="h-5 w-5" />
                  Instagram
                </motion.a>
              </div>
            </div>

            {/* Trust badges */}
            <div className="mt-8 grid grid-cols-1 gap-3 border-t border-white/10 pt-6 sm:grid-cols-3">
              <div className="flex items-center gap-2 text-xs text-white/60">
                <Truck className="h-4 w-4 flex-shrink-0 text-brand-red" />
                Island-wide delivery
              </div>
              <div className="flex items-center gap-2 text-xs text-white/60">
                <ShieldCheck className="h-4 w-4 flex-shrink-0 text-brand-red" />
                Secure ordering
              </div>
              <div className="flex items-center gap-2 text-xs text-white/60">
                <RefreshCw className="h-4 w-4 flex-shrink-0 text-brand-red" />
                7-day exchange
              </div>
            </div>

            {/* Accordion: details, materials, care, shipping */}
            <div className="mt-8 divide-y divide-white/10 border-t border-white/10">
              <AccordionItem
                title="Details & Materials"
                isOpen={openSection === 'details'}
                onToggle={() => toggleSection('details')}
              >
                <ul className="space-y-1.5 text-sm text-white/60">
                  <li>
                    <span className="text-white/80">Material:</span> {product.material}
                  </li>
                  <li>
                    <span className="text-white/80">Fit:</span> {product.fit}
                  </li>
                  <li>
                    <span className="text-white/80">Available sizes:</span>{' '}
                    {product.sizes.join(', ')}
                  </li>
                </ul>
              </AccordionItem>

              <AccordionItem
                title="Care Instructions"
                isOpen={openSection === 'care'}
                onToggle={() => toggleSection('care')}
              >
                <ul className="list-inside list-disc space-y-1.5 text-sm text-white/60">
                  {(product.careInstructions ?? []).map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                </ul>
              </AccordionItem>

              <AccordionItem
                title="Shipping & Returns"
                isOpen={openSection === 'shipping'}
                onToggle={() => toggleSection('shipping')}
              >
                <p className="text-sm leading-relaxed text-white/60">
                  Orders are dispatched within 1-2 business days and typically arrive within
                  2-4 business days island-wide. If a jersey doesn't fit right, reach out to us
                  on WhatsApp within 7 days of delivery to arrange a free size exchange.
                </p>
              </AccordionItem>
            </div>
          </div>
        </motion.div>

        {/* Related products */}
        {relatedProducts.length > 0 && (
          <div className="mt-16">
            <h2 className="font-display text-2xl text-white tracking-wide">
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSizeGuide(false)}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl border border-white/10 bg-brand-bg p-6"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-xl text-white tracking-wide">Size Guide</h3>
                <button
                  type="button"
                  onClick={() => setShowSizeGuide(false)}
                  className="text-white/50 transition-colors hover:text-white"
                  aria-label="Close size guide"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-white/50">
                    <th className="py-2 font-medium">Size</th>
                    <th className="py-2 font-medium">Chest</th>
                    <th className="py-2 font-medium">Length</th>
                  </tr>
                </thead>
                <tbody>
                  {SIZE_GUIDE.map((row) => (
                    <tr key={row.size} className="border-b border-white/5 text-white/70">
                      <td className="py-2 font-medium text-white">{row.size}</td>
                      <td className="py-2">{row.chest}</td>
                      <td className="py-2">{row.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 text-xs text-white/40">
                Measurements are approximate. Between sizes? Message us on WhatsApp and we'll
                help you pick the right fit.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
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
        <span className="text-sm font-medium text-white">{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-white/50 transition-transform ${
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
      className="group overflow-hidden rounded-xl border border-white/10 bg-white/5 transition-colors hover:border-white/30"
    >
      <div className="aspect-square overflow-hidden bg-brand-bg">
        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-medium text-white">{product.name}</p>
        <p className="mt-1 text-sm text-brand-red">{formatPrice(product.price)}</p>
      </div>
    </Link>
  );
}
