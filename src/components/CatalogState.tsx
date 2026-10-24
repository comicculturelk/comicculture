import { Search, RefreshCw } from 'lucide-react';

interface CatalogStateProps {
  error?: boolean;
  filtered?: boolean;
  onReset?: () => void;
}

export default function CatalogState({ error = false, filtered = false, onReset }: CatalogStateProps) {
  const Icon = error ? RefreshCw : Search;
  return (
    <div role={error ? 'alert' : 'status'} className="rounded-xl border border-border bg-surface px-5 py-10 text-center">
      <Icon aria-hidden="true" className="mx-auto mb-4 h-6 w-6 text-muted" />
      <h2 className="text-base font-semibold text-foreground">
        {error ? 'We couldn’t load the designs' : filtered ? 'No matching designs' : 'New designs are on their way'}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
        {error ? 'Check your connection and try again.' : filtered ? 'Try another search or clear your filters to see every design.' : 'Check back soon to explore the collection.'}
      </p>
      {error && <button type="button" onClick={() => window.location.reload()} className="btn-outline mt-5">Try again</button>}
      {filtered && onReset && <button type="button" onClick={onReset} className="btn-outline mt-5">Clear search & filters</button>}
    </div>
  );
}
