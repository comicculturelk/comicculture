import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { STORE_CONFIG } from '../config/store';
import { formatPrice } from '../data/products';

export default function Delivery() {
  return <section className="comic-page mx-auto max-w-3xl px-4 pb-16 pt-24 sm:px-6">
    <SEO title="Delivery information | ComicCulture" description="Delivery fees, dispatch information and pre-order guidance for ComicCulture orders in Sri Lanka." canonical="https://comicculture.lk/delivery" />
    <Link to="/shop" className="inline-flex min-h-11 items-center text-sm text-muted">← Back to shop</Link>
    <h1 className="mt-4 font-display text-4xl">Delivery information</h1>
    <div className="mt-6 space-y-6 rounded-2xl border border-border bg-surface p-5 sm:p-8">
      <div><h2 className="text-lg font-semibold">Island-wide delivery · {formatPrice(STORE_CONFIG.deliveryFee)}</h2><p className="mt-2 text-sm leading-relaxed text-muted">Your final total is shown before you place your order, including delivery and any applied discount.</p></div>
      <div><h2 className="text-lg font-semibold">Dispatch and arrival</h2><p className="mt-2 text-sm leading-relaxed text-muted">{STORE_CONFIG.deliveryTiming} Estimates can vary with location, courier operations and public holidays. Contact us if you need to check timing before ordering.</p></div>
      <div><h2 className="text-lg font-semibold">Pre-order items</h2><p className="mt-2 text-sm leading-relaxed text-muted">Pre-orders follow the timeframe shown for the selected style. Check the product and checkout notices before placing your order.</p></div>
      <div><h2 className="text-lg font-semibold">After ordering</h2><p className="mt-2 text-sm leading-relaxed text-muted">Keep your order reference. Use it with your checkout email or phone number to track progress.</p><Link to="/track-order" className="inline-flex min-h-11 items-center font-medium text-primary">Track your order →</Link></div>
      <div className="flex flex-wrap gap-3 border-t border-border pt-5"><Link to="/contact" className="btn-primary">Ask about delivery</Link><Link to="/return-policy" className="btn-outline">Returns & exchanges</Link></div>
    </div>
  </section>;
}
