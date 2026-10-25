import { Link } from 'react-router-dom';
import { Truck, Wallet, RefreshCw } from 'lucide-react';
import { STORE_CONFIG } from '../config/store';
import { formatPrice } from '../data/products';

export default function BrandStory() {
  return (
    <section aria-label="Shopping with ComicCulture" className="border-y border-border bg-surface">
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 sm:grid-cols-3 sm:px-6">
        <Link to="/delivery" className="flex min-h-11 items-center gap-3 text-sm"><Truck aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" /><span><strong className="block font-semibold">Island-wide delivery · {formatPrice(STORE_CONFIG.deliveryFee)}</strong><span className="text-xs text-muted">See delivery details</span></span></Link>
        <div className="flex min-h-11 items-center gap-3 text-sm"><Wallet aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" /><span><strong className="block font-semibold">COD or bank transfer</strong><span className="text-xs text-muted">Choose at checkout</span></span></div>
        <Link to="/return-policy" className="flex min-h-11 items-center gap-3 text-sm"><RefreshCw aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" /><span><strong className="block font-semibold">Size exchange support</strong><span className="text-xs text-muted">Stock dependent · Read the policy</span></span></Link>
      </div>
    </section>
  );
}
