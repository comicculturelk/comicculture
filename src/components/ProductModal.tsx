import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageCircle, Instagram } from 'lucide-react';
import { useState } from 'react';
import type { Product } from '../data/products';
import { generateWhatsAppMessage } from '../data/products';

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
}

export default function ProductModal({ product, onClose }: ProductModalProps) {
  const [selectedSize, setSelectedSize] = useState<string>('M');

  if (!product) return null;

  const whatsappLink = `https://wa.me/94787756338?text=${generateWhatsAppMessage(product, selectedSize)}`;

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
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative z-10 flex flex-col lg:flex-row max-w-5xl w-full max-h-[90vh] overflow-hidden rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <motion.button
              className="absolute top-4 right-4 z-20 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
              onClick={onClose}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <X className="h-6 w-6" />
            </motion.button>

            {/* Product image */}
            <div className="relative lg:w-1/2 flex-shrink-0">
              <div className="aspect-square overflow-hidden bg-brand-bg">
                <motion.img
                  src={product.image}
                  alt={product.name}
                  className="h-full w-full object-cover"
                  initial={{ scale: 1.1 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.4 }}
                />
              </div>

              {/* Glow effect */}
              <div className="absolute inset-0 bg-gradient-to-t from-brand-bg via-transparent to-transparent lg:bg-gradient-to-r" />
            </div>

            {/* Product info */}
            <div className="relative flex flex-1 flex-col p-6 lg:p-10 overflow-y-auto">
              {/* Collection badge */}
              <div className="inline-flex">
                <span className="rounded-full bg-brand-red/20 px-3 py-1 text-xs font-medium text-brand-red">
                  {product.collection}
                </span>
              </div>

              {/* Title */}
              <h2 className="mt-4 font-display text-3xl lg:text-4xl text-white tracking-wide">
                {product.name}
              </h2>

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
                <p className="text-sm font-medium text-white/80 mb-3">Select Size</p>
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
              <div className="mt-auto pt-8 flex flex-col sm:flex-row gap-3">
                <motion.a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-green-500"
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
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 px-6 py-3 font-semibold text-white"
                  whileHover={{ scale: 1.02 }}
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
