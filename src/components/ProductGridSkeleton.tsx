interface ProductGridSkeletonProps {
  count?: number;
}

export default function ProductGridSkeleton({ count = 4 }: ProductGridSkeletonProps) {
  return (
    <div role="status" aria-label="Loading products" aria-busy="true" className="product-grid grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-xl border border-border bg-surface p-3 sm:p-4">
          <div className="aspect-[4/5] animate-pulse rounded-lg bg-slate-100" />
          <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-slate-100" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-100" />
          <div className="mt-5 h-4 w-1/3 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
