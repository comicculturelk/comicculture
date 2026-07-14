import { motion } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import { MessageCircle, Instagram, ArrowLeft, ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useProduct } from '../hooks/useProduct';
import { useCart } from '../hooks/useCart';
import { generateWhatsAppMessage } from '../data/products';

export default function Product() {
  const { slug } = useParams<{ slug: string }>();
  const { product, loading, error } = useProduct(slug);
  const { addItem, openCart } = useCart();
  const [selectedSize, setSelectedSize] = useState<string>('M');
  const [activeImage, setActiveImage] = useState<string | null>(null);

  // Reset the active gallery image whenever the loaded product changes
  useEffect(() => {
    if (product) {
      setActiveImage(product.image);
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

  const whatsappLink = `https://wa.me/94787756338?text=${generateWhatsAppMessage(product, selectedSize)}`;

  const galleryImages =
    product.images && product.images.length > 0
      ? [product.image, ...product.images.filter((img) => img !== product.image)]
      : [product.image];

  const displayedImage = activeImage ?? product.image;

  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      image: product.image,
      price: product.price,
      size: selectedSize,
    });
    openCart();
  };

  return (
    <section className="relative min-h-screen bg-brand-bg py-24 lg:py-32">
      <div className="absolute inset-0 bg-web-pattern opacity-10" />

      <div className="relative z-10 mx-auto max-w-5xl px-6">
        <Link
          to="/shop"
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-white/60 transition-colors hover:text-white"
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
            {/* Collection badge */}
            <div className="inline-flex">
              <span className="rounded-full bg-brand-red/20 px-3 py-1 text-xs font-medium text-brand-red">
                {product.collection}
              </span>
            </div>

            {/* Title */}
            <h1 className="mt-4 font-display text-3xl text-white tracking-wide lg:text-4xl">
              {product.name}
            </h1>

            {/* Lore */}
            <p className="mt-2 text-lg text-white/60 italic">
              "{product.lore}"
            </p>

            {/* Price */}
            <p className="mt-4 font-display text-4xl text-brand-red">
              Rs. {product.price}
            </p>

            {/* Description */}
            <p className="mt-6 text-white/70 leading-relaxed">
              {product.description}
            </p>

            {/* Size selector */}
            <div className="mt-8">
              <p className="mb-3 text-sm font-medium text-white/80">Select Size</p>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((size) => (
                  <motion.button
                    key={size}
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

            {/* CTA buttons */}
            <div className="mt-auto pt-8">
              <div className="flex flex-col gap-3 sm:flex-row">
                <motion.button
                  type="button"
                  onClick={handleAddToCart}
                  className="btn-primary flex-1"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <ShoppingBag className="h-5 w-5" />
                  Add to Cart
                </motion.button>
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
                  View on Instagram
                </motion.a>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
