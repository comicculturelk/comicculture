import { Search, X } from 'lucide-react';

interface ProductFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  sizes: string[];
  selectedSize: string | null;
  onSizeChange: (size: string | null) => void;
  priceBounds: { min: number; max: number };
  priceLimit: number;
  onPriceLimitChange: (value: number) => void;
  featuredOnly: boolean;
  onFeaturedChange: (value: boolean) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
}

export default function ProductFilters({
  search,
  onSearchChange,
  sizes,
  selectedSize,
  onSizeChange,
  priceBounds,
  priceLimit,
  onPriceLimitChange,
  featuredOnly,
  onFeaturedChange,
  onReset,
  hasActiveFilters,
}: ProductFiltersProps) {
  return (
    <div className="mb-10 space-y-5">
      {/* Search */}
      <div className="relative mx-auto max-w-md">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search jerseys..."
          className="w-full rounded-full border border-border bg-surface py-2.5 pl-11 pr-4 text-sm text-foreground placeholder:text-muted transition-colors duration-200 focus:border-primary/50 focus:outline-none"
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* Size chips */}
        {sizes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {sizes.map((size) => {
              const isActive = selectedSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => onSizeChange(isActive ? null : size)}
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors duration-200 ${
                    isActive
                      ? 'border-primary/30 bg-primary/20 text-primary'
                      : 'border-border bg-surface text-muted hover:text-foreground'
                  }`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        )}

        {/* Featured toggle */}
        <button
          type="button"
          onClick={() => onFeaturedChange(!featuredOnly)}
          className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors duration-200 ${
            featuredOnly
              ? 'border-primary/30 bg-primary/20 text-primary'
              : 'border-border bg-surface text-muted hover:text-foreground'
          }`}
        >
          Featured
        </button>

        {/* Price range */}
        {priceBounds.max > priceBounds.min && (
          <div className="flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Up to Rs. {priceLimit}
            </span>
            <input
              type="range"
              min={priceBounds.min}
              max={priceBounds.max}
              value={priceLimit}
              onChange={(e) => onPriceLimitChange(Number(e.target.value))}
              className="h-1 w-28 cursor-pointer accent-primary"
            />
          </div>
        )}

        {/* Reset */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted transition-colors duration-200 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
