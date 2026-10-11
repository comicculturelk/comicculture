import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { X, Minus, Plus, Trash2, Info, ShoppingBag, ArrowRight, Sparkles } from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { useProducts } from '../hooks/useProducts';
import { formatPrice, getPreorderMessage } from '../data/products';
import type { Product, ProductVersion } from '../data/products';

/**
 * Preorder status now lives on ProductVersion, not Product. A cart line only
 * knows its versionSizeId, so to get preorder info we find the version
 * (within the item's loaded product) whose sizes include that id.
 */
function findVersionForVersionSizeId(
  product: Product | undefined,
  versionSizeId: string
): ProductVersion | undefined {
  return product?.versions.find((v) => v.sizes.some((s) => s.id === versionSizeId));
}

export default function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, totalItems, totalPrice, stockMessage } =
    useCart();
  const { products } = useProducts();

  const hasPreorderItems = items.some((item) => {
    const product = products.find((p) => p.id === item.productId);
    const version = findVersionForVersionSizeId(product, item.versionSizeId);
    return version ? !!getPreorderMessage(version) : false;
  });

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
          <motion.button
            type="button"
            aria-label="Close cart"
            className="absolute inset-0 cursor-default bg-foreground/75 backdrop-blur-sm"
            onClick={closeCart}
          />

          {/* Drawer */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                closeCart();
                return;
              }
              if (event.key !== 'Tab') return;

              const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
              );
              if (focusable.length === 0) {
                event.preventDefault();
                return;
              }

              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
            className="comic-page absolute right-0 top-0 flex h-full w-full max-w-md flex-col overflow-hidden border-l-4 border-foreground bg-background shadow-[-10px_0_0_rgba(21,21,21,0.2)]"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
          >
            {/* Header */}
            <div className="relative flex items-center justify-between border-b-4 border-foreground bg-warning px-5 py-4 sm:px-6">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-primary">ComicCulture · collector edition</p>
                <h2 id="cart-title" className="mt-0.5 font-display text-2xl tracking-wide text-foreground sm:text-3xl">THE PULL LIST</h2>
                <p className="text-xs font-semibold uppercase tracking-widest text-foreground/70">{String(totalItems).padStart(2, '0')} {totalItems === 1 ? 'item' : 'items'} in your bag</p>
              </div>
              <motion.button
                onClick={closeCart}
                autoFocus
                className="flex h-11 w-11 items-center justify-center border-2 border-foreground bg-surface text-foreground shadow-[3px_3px_0_#151515] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0_#151515]"
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
                <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                  <div className="comic-burst mb-7 flex h-36 w-36 -rotate-6 flex-col items-center justify-center border-2 border-foreground text-foreground shadow-[5px_5px_0_#d21f38]">
                    <ShoppingBag className="h-8 w-8" aria-hidden="true" />
                    <span className="mt-1 font-display text-xl leading-none">PLOT TWIST!</span>
                  </div>
                  <span className="comic-caption -rotate-2">No issues in the bag</span>
                  <h3 className="mt-5 max-w-xs font-display text-3xl leading-tight text-foreground">YOUR NEXT FAVORITE IS OUT THERE.</h3>
                  <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">Explore the latest drops and add a little universe to your everyday.</p>
                  <Link to="/shop" onClick={closeCart} className="btn-primary mt-7">
                    <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                    Browse the collection
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <p className="mt-5 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted"><Sparkles className="h-3.5 w-3.5 text-secondary" /> New chapters added often</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {hasPreorderItems && (
                    <div className="comic-panel flex items-start gap-2 border-primary bg-primary/5 px-4 py-3 text-xs text-foreground">
                      <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      Your cart includes a pre-order item. It will be fulfilled on a
                      different timeline than in-stock items.
                    </div>
                  )}
                  {stockMessage && (
                    <p role="status" className="comic-caption max-w-full !whitespace-normal bg-warning/80 text-left !tracking-normal">{stockMessage}</p>
                  )}
                  {items.map((item, index) => {
                    const product = products.find((p) => p.id === item.productId);
                    const version = findVersionForVersionSizeId(product, item.versionSizeId);
                    const preorderMessage = version ? getPreorderMessage(version) : null;
                    return (
                    <article key={item.versionSizeId} className="comic-panel relative flex gap-3 p-3 sm:gap-4 sm:p-4">
                      <span className="absolute -right-1.5 -top-2 z-10 border-2 border-foreground bg-warning px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-foreground shadow-[2px_2px_0_#d21f38]">Issue {String(index + 1).padStart(2, '0')}</span>
                      <Link
                        to={`/product/${item.slug}`}
                        onClick={closeCart}
                        className="h-20 w-20 flex-shrink-0 overflow-hidden border-2 border-foreground bg-background shadow-[2px_2px_0_#2563eb]"
                      >
                        <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                      </Link>

                      <div className="flex flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            to={`/product/${item.slug}`}
                            onClick={closeCart}
                            className="pr-1 font-display text-base leading-tight tracking-wide text-foreground transition-colors hover:text-primary"
                          >
                            {item.name}
                          </Link>
                          <button
                            onClick={() => removeItem(item.versionSizeId)}
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center border-2 border-foreground bg-surface text-muted transition-colors hover:bg-primary hover:text-white"
                            aria-label={`Remove ${item.name} from cart`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="text-xs text-muted">Size: {item.size}</p>
                        {preorderMessage && (
                          <div className="mt-1 flex items-center gap-1.5">
                              <span className="inline-flex items-center border-2 border-foreground bg-warning px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-foreground">
                              Pre-Order
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {preorderMessage}
                            </span>
                          </div>
                        )}
                        <p className="mt-1 font-display text-lg text-primary">{formatPrice(item.price)}</p>

                        <div className="mt-auto flex items-center gap-3 pt-2">
                          <button
                            onClick={() =>
                              updateQuantity(item.versionSizeId, item.quantity - 1)
                            }
                            className="flex h-8 w-8 items-center justify-center border-2 border-foreground bg-surface text-foreground shadow-[2px_2px_0_#151515] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="min-w-8 text-center font-display text-lg tabular-nums text-foreground">{item.quantity}</span>
                          <button
                            onClick={() =>
                              updateQuantity(item.versionSizeId, item.quantity + 1)
                            }
                            className="flex h-8 w-8 items-center justify-center border-2 border-foreground bg-surface text-foreground shadow-[2px_2px_0_#151515] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </article>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t-4 border-foreground bg-surface/95 p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-widest text-muted">
                    Panel total · {totalItems} {totalItems === 1 ? 'item' : 'items'}
                  </span>
                  <span className="border-2 border-foreground bg-warning px-3 py-1 font-display text-2xl text-foreground shadow-[3px_3px_0_#d21f38]">{formatPrice(totalPrice)}</span>
                </div>
                <Link to="/checkout" onClick={closeCart} className="btn-primary w-full">
                  Proceed to Checkout
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
                  No payment is collected online yet — we'll confirm delivery with you directly.
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
