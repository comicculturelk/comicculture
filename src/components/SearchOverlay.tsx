import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useProducts } from '../hooks/useProducts';
import { filterProducts } from '../data/products';

interface SearchOverlayProps {
  onClose: () => void;
}

const MAX_RESULTS = 6;

export default function SearchOverlay({ onClose }: SearchOverlayProps) {
  const { products, loading } = useProducts();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return filterProducts(products, { search: query }).slice(0, MAX_RESULTS);
  }, [products, query]);

  const showEmptyState = query.trim() !== '' && !loading && results.length === 0;

  return (
    <motion.div
      className="fixed inset-0 z-50"
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
        className="absolute left-0 right-0 top-0 mx-auto max-w-2xl px-6 pt-24 sm:pt-28"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="rounded-2xl border border-border bg-surface shadow-elevated">
          {/* Input row */}
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <Search className="h-5 w-5 shrink-0 text-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search jerseys, collections..."
              className="w-full bg-transparent text-base text-foreground placeholder:text-muted focus:outline-none"
            />
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:text-foreground"
              aria-label="Close search"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Results */}
          {query.trim() !== '' && (
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {loading && (
                <p className="px-3 py-6 text-center text-sm text-muted">Searching...</p>
              )}

              {showEmptyState && (
                <p className="px-3 py-6 text-center text-sm text-muted">
                  No jerseys found for "{query}".
                </p>
              )}

              {!loading &&
                results.map((product) => (
                  <Link
                    key={product.id}
                    to={`/product/${product.slug}`}
                    onClick={onClose}
                    className="flex items-center gap-4 rounded-xl p-3 transition-colors hover:bg-surface-hover"
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
                        {product.collection}
                      </p>
                    </div>
                    <span className="shrink-0 font-display text-sm text-foreground">
                      Rs. {product.price}
                    </span>
                  </Link>
                ))}

              {!loading && results.length === MAX_RESULTS && (
                <Link
                  to="/shop"
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
