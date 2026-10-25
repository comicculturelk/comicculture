import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useProducts } from '../hooks/useProducts';
import { filterProducts, isProductAvailable, sortProducts } from '../data/products';
import { useDialog } from '../hooks/useDialog';
import { getProductPriceLabel } from '../lib/merchandising';

interface SearchOverlayProps {
  onClose: () => void;
}

const MAX_RESULTS = 6;

export default function SearchOverlay({ onClose }: SearchOverlayProps) {
  const { products, loading } = useProducts();
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useDialog(true, panelRef, onClose);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return filterProducts(sortProducts(products, 'recommended'), { search: query }).slice(0, MAX_RESULTS);
  }, [products, query]);

  const showEmptyState = query.trim() !== '' && !loading && results.length === 0;

  return (
    <motion.div
      className="fixed inset-0 z-[70]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-background/80 backdrop-blur-xl"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search ComicCulture"
        tabIndex={-1}
        className="search-panel absolute inset-x-0 top-0 mx-auto max-w-2xl px-3 pt-3 sm:px-6 sm:pt-24"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated">
          {/* Input row */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
            <Search className="h-5 w-5 shrink-0 text-muted" />
            <input
              ref={inputRef}
              type="search"
              aria-label="Search products and collections"
              enterKeyHint="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search designs, collections…"
              className="min-h-12 min-w-0 w-full px-3 bg-transparent text-base text-foreground placeholder:text-muted focus:outline-none"
            />
            <button
              onClick={onClose}
              className="icon-button shrink-0"
              aria-label="Close search"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {!query.trim() && <div className="p-5">
            <p className="text-sm text-muted">Find your next favourite design.</p>
            <Link to="/shop" onClick={onClose} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary">Browse all designs →</Link>
          </div>}
          <div className="sr-only" role="status" aria-live="polite">{query.trim() ? `${results.length}${results.length === MAX_RESULTS ? '+' : ''} ${results.length === 1 ? 'result' : 'results'}` : ''}</div>
          {/* Results */}
          {query.trim() !== '' && (
            <div className="search-results max-h-[65dvh] overflow-y-auto overscroll-contain p-2">
              {loading && (
                <p className="px-3 py-6 text-center text-sm text-muted">Searching...</p>
              )}

              {showEmptyState && (
                <div className="px-3 py-6 text-center text-sm text-muted">
                  <p>No products found for &quot;{query}&quot;.</p>
                  <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="btn-outline mt-4">Clear search</button>
                  <Link to="/shop" onClick={onClose} className="mt-3 block py-3 font-semibold text-primary">Browse available designs →</Link>
                </div>
              )}

              {!loading &&
                results.map((product) => (
                  <Link
                    key={product.id}
                    to={`/product/${product.slug}`}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-surface-hover"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-background">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm tracking-wide text-foreground">
                        {product.name}
                      </p>
                      <p className="truncate text-xs uppercase tracking-wide text-muted">
                        {product.collection}{!isProductAvailable(product) && <span className="ml-2 font-semibold text-foreground">· Sold out</span>}
                      </p>
                    </div>
                    <span className="shrink-0 font-display text-base text-foreground">
                      {getProductPriceLabel(product)}
                    </span>
                  </Link>
                ))}

              {!loading && results.length === MAX_RESULTS && (
                <Link
                  to={`/shop?search=${encodeURIComponent(query.trim())}`}
                  onClick={onClose}
                  className="block px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-primary transition-colors hover:text-foreground"
                >
                  View All in Shop
                </Link>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
