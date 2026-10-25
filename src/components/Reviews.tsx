import { useEffect, useState } from 'react';
import { Instagram, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CustomerReview { id: string; customer_name: string; location: string | null; review_text: string; product_name: string | null; rating: number }

export default function Reviews({ productName, compact = false }: { productName?: string; compact?: boolean }) {
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    let query = supabase.from('customer_reviews')
      .select('id, customer_name, location, review_text, product_name, rating')
      .eq('is_published', true);
    if (productName) query = query.eq('product_name', productName);
    void query.order('created_at', { ascending: false }).limit(12)
      .then(({ data, error }) => { if (active && !error) setReviews((data ?? []) as CustomerReview[]); });
    return () => { active = false; };
  }, [productName]);
  const matching = productName ? reviews.filter((review) => review.product_name?.trim().toLowerCase() === productName.trim().toLowerCase()) : reviews;
  if (!matching.length) return null;
  const shown = expanded ? matching : matching.slice(0, compact ? 1 : 2);
  return (
    <section id={compact ? undefined : 'community'} aria-label={compact ? 'Reviews of this design' : 'Customer reviews'} className={compact ? 'mt-6 border-t border-border pt-5' : 'border-t border-border py-10 sm:py-16'}>
      <div className={compact ? '' : 'mx-auto max-w-6xl px-4 sm:px-6'}>
        <h2 className={compact ? 'text-sm font-semibold' : 'font-display text-3xl sm:text-4xl'}>{compact ? 'What a customer says' : 'From the ComicCulture community'}</h2>
        {!compact && <p className="mt-2 text-sm text-muted">Real feedback on our designs, fit and packaging.</p>}
        <div className={compact ? 'mt-3' : 'mt-6 grid gap-4 sm:grid-cols-2'}>
          {shown.map((review) => <article key={review.id} className={compact ? 'text-sm' : 'rounded-xl border border-border bg-surface p-5'}>
            <p className="flex items-center gap-1 text-xs font-medium" aria-label={`${review.rating} out of 5 stars`}><Star aria-hidden="true" className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />{review.rating}/5 · Customer review</p>
            <p className="mt-3 text-sm leading-relaxed text-foreground">“{review.review_text}”</p>
            <p className="mt-4 text-xs font-semibold">{review.customer_name}<span className="font-normal text-muted">{review.location ? ` · ${review.location}` : ''}</span></p>
            {!compact && review.product_name && <p className="mt-1 text-xs text-muted">{review.product_name}</p>}
          </article>)}
        </div>
        {!compact && <div className="mt-5 flex flex-wrap items-center gap-4">
          {matching.length > 2 && <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="btn-outline">{expanded ? 'Show fewer reviews' : `Read all ${matching.length} reviews`}</button>}
          <a href="https://instagram.com/comicculture.lk" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted"><Instagram aria-hidden="true" className="h-4 w-4" />Visit our Instagram</a>
        </div>}
      </div>
    </section>
  );
}
