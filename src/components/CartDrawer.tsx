import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { X, Minus, Plus, Trash2, MessageCircle } from 'lucide-react';
import { useCart } from '../hooks/useCart';

const WHATSAPP_NUMBER = '94787756338';

export default function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, totalItems, totalPrice } =
    useCart();

  const lines = items.map(
    (item) => `- ${item.name} (Size: ${item.size}) x${item.quantity} — Rs. ${item.price * item.quantity}`
  );
  const whatsappMessage = encodeURIComponent(
    `Hi! I'd like to order the following from ComicCulture:\n\n${lines.join('\n')}\n\nTotal: Rs. ${totalPrice}`
  );
  const whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappMessage}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={closeCart} />

          {/* Drawer */}
          <motion.div
            className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-brand-bg"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 p-6">
              <h2 className="font-display text-2xl text-white tracking-wide">YOUR CART</h2>
              <motion.button
                onClick={closeCart}
                className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                aria-label="Close cart"
              >
                <X className="h-5 w-5" />
              </motion.button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-6">
              {items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <p className="text-white/50">Your cart is empty.</p>
                  <Link to="/shop" onClick={closeCart} className="btn-primary mt-6">
                    Browse Collection
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item) => (
                    <div
                      key={`${item.productId}-${item.size}`}
                      className="glass flex gap-4 rounded-xl p-4"
                    >
                      <Link
                        to={`/product/${item.slug}`}
                        onClick={closeCart}
                        className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg"
                      >
                        <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                      </Link>

                      <div className="flex flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            to={`/product/${item.slug}`}
                            onClick={closeCart}
                            className="font-display text-base text-white tracking-wide transition-colors hover:text-brand-red"
                          >
                            {item.name}
                          </Link>
                          <button
                            onClick={() => removeItem(item.productId, item.size)}
                            className="text-white/40 transition-colors hover:text-brand-red"
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="text-xs text-white/50">Size: {item.size}</p>
                        <p className="mt-1 font-display text-brand-red">Rs. {item.price}</p>

                        <div className="mt-auto flex items-center gap-3 pt-2">
                          <button
                            onClick={() =>
                              updateQuantity(item.productId, item.size, item.quantity - 1)
                            }
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/20 text-white/70 transition-colors hover:border-white/40 hover:text-white"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-4 text-center text-sm text-white">{item.quantity}</span>
                          <button
                            onClick={() =>
                              updateQuantity(item.productId, item.size, item.quantity + 1)
                            }
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/20 text-white/70 transition-colors hover:border-white/40 hover:text-white"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-white/10 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-white/60">
                    Subtotal ({totalItems} {totalItems === 1 ? 'item' : 'items'})
                  </span>
                  <span className="font-display text-2xl text-brand-red">Rs. {totalPrice}</span>
                </div>
                <motion.a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-green-500"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <MessageCircle className="h-5 w-5" />
                  Checkout on WhatsApp
                </motion.a>
                <p className="mt-3 text-center text-xs text-white/40">
                  Card checkout coming soon — for now, we confirm orders over WhatsApp.
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
