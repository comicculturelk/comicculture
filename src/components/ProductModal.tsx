import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageCircle, Instagram, Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Product } from '../data/products';
import { generateWhatsAppMessage, getStockForSize, isSizeInStock } from '../data/products';

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
}

export default function ProductModal({ product, onClose }: ProductModalProps) {
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [quantity, setQuantity] = useState(1);

  // Reset size/quantity whenever a different product is opened in this modal.
  useEffect(() => {
    if (!product) return;
    const firstAvailable = product.sizes.find((size) => isSizeInStock(product, size));
    setSelectedSize(firstAvailable ?? product.sizes[0] ?? '');
    setQuantity(1);
  }, [product]);

  if (!product) return null;

  const soldOut = !product.sizes.some((size) => isSizeInStock(product, size));
  const maxQuantity = selectedSize ? Math.max(1, getStockForSize(product, selectedSize)) : 1;
  const whatsappLink = `https://wa.me/94787756338?text=${generateWhatsAppMessage(product, selectedSize, quantity)}`;

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-foreground/90 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative z-10 flex flex-col lg:flex-row max-w-5xl w-full max-h-[90vh] overflow-hidden rounded-2xl bg-surface border border-border shadow-elevated"
            initial={{ scale: 0.95, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 16 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <motion.button
              className="absolute top-4 right-4 z-20 rounded-full bg-background/90 p-2 text-foreground border border-border backdrop-blur-sm transition-colors hover:bg-surface-hover"
              onClick={onClose}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </motion.button>

            {/* Product image */}
            <div className="relative lg:w-1/2 flex-shrink-0 bg-background">
              <div className="relative aspect-square overflow-hidden">
                <motion.img
                  src={product.image}
                  alt={product.name}
                  className="h-full w-full object-cover"
                  initial={{ scale: 1.04 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />

                {/* Editorial corner accents */}
                <span className="pointer-events-none absolute top-4 left-4 h-6 w-6 border-t border-l border-foreground/20" />
                <span className="pointer-events-none absolute bottom-4 right-4 h-6 w-6 border-b border-r border-foreground/20" />

                {soldOut && (
                  <span className="absolute top-4 left-4 rounded-full border border-border bg-background/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Sold Out
                  </span>
                )}
              </div>
            </div>

            {/* Product info */}
            <div className="relative flex flex-1 flex-col p-6 lg:p-10 overflow-y-auto">
              {/* Identity row: edition code + featured badge */}
              <div className="flex items-center gap-3">
                {product.sku && (
                  <span className="font-mono text-[11px] tracking-widest text-muted">
                    {product.sku}
                  </span>
                )}
                {product.featured && (
                  <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Featured
                  </span>
                )}
              </div>

              {/* Collection label */}
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                {product.collection}
              </p>

              {/* Title */}
              <h2 className="mt-2 font-display text-3xl lg:text-4xl text-foreground tracking-wide">
                {product.name}
              </h2>

              {/* Lore */}
              {product.lore && (
                <p className="mt-2 text-base text-muted italic">"{product.lore}"</p>
              )}

              {/* Price */}
              <div className="mt-5 flex items-baseline gap-3">
                <span className="font-display text-4xl text-foreground">
                  Rs. {product.price}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-widest text-muted">
                  Limited Drop
                </span>
              </div>

              {/* Description */}
              <p className="mt-5 text-sm text-muted-foreground leading-relaxed">
                {product.description}
              </p>

              {/* Size selector */}
              <div className="mt-8">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-foreground">
                    Select Size
                  </p>
                  <span className="text-xs text-muted">
                    {soldOut ? 'Out of stock' : selectedSize ? `Size ${selectedSize}` : 'Choose a size'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((size) => {
                    const inStock = isSizeInStock(product, size);
                    const isSelected = selectedSize === size;
                    return (
                      <motion.button
                        key={size}
                        type="button"
                        disabled={!inStock}
                        onClick={() => inStock && setSelectedSize(size)}
                        whileHover={inStock ? { y: -2 } : undefined}
                        whileTap={inStock ? { scale: 0.96 } : undefined}
                        className={`relative flex h-11 min-w-[48px] items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : inStock
                            ? 'border-border text-foreground hover:border-foreground/40'
                            : 'border-border text-muted-foreground/50 cursor-not-allowed'
                        }`}
                      >
                        {size}
                        {!inStock && (
                          <span className="pointer-events-none absolute inset-x-2 top-1/2 h-px -translate-y-1/2 -rotate-[14deg] bg-muted-foreground/50" />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Quantity selector */}
              {!soldOut && (
                <div className="mt-6">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-foreground">
                    Quantity
                  </p>
                  <div className="inline-flex items-center rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      className="flex h-11 w-11 items-center justify-center text-foreground transition-colors hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="flex h-11 w-12 items-center justify-center border-x border-border text-sm font-medium text-foreground">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                      disabled={quantity >= maxQuantity}
                      className="flex h-11 w-11 items-center justify-center text-foreground transition-colors hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* CTA buttons */}
              <div className="mt-auto pt-8 flex flex-col sm:flex-row gap-3">
                {soldOut ? (
                  <span className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-6 py-3 font-semibold text-muted-foreground cursor-not-allowed">
                    Sold Out
                  </span>
                ) : (
                  <motion.a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-green-500"
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <MessageCircle className="h-5 w-5" />
                    Order on WhatsApp
                  </motion.a>
                )}
                <motion.a
                  href={product.instagramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 px-6 py-3 font-semibold text-primary-foreground"
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Instagram className="h-5 w-5" />
                  View on Instagram
                </motion.a>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
