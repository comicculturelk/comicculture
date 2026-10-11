import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, Instagram } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CustomerReview {
  id: string;
  customer_name: string;
  location: string | null;
  review_text: string;
  product_name: string | null;
  rating: number;
}

export default function Reviews() {
  const [reviews, setReviews] = useState<CustomerReview[]>([]);

  useEffect(() => {
    let active = true;
    void supabase
      .from('customer_reviews')
      .select('id, customer_name, location, review_text, product_name, rating')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(12)
      .then(({ data, error }) => {
        if (!active || error) return;
        setReviews((data ?? []) as CustomerReview[]);
      });
    return () => { active = false; };
  }, []);

  return (
    <section id="community" className="relative py-24 lg:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-web-pattern opacity-10" />
      </div>
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-block border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            COLLECTOR NOTES
          </span>
          <h2 className="mt-6 font-display text-4xl md:text-5xl lg:text-6xl text-foreground tracking-wide">
            THE READER <span className="text-gradient-red">ARCHIVE</span>
          </h2>
          <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">
            Letters, notes, and sightings from collectors currently living in the universe.
          </p>
        </motion.div>

        {reviews.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {reviews.map((review, index) => (
              <motion.article
                key={review.id}
                className="border border-border bg-surface p-6 sm:p-8"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-xs tracking-[0.25em] text-muted uppercase">
                    Letter №{String(index + 1).padStart(3, '0')}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
                    {review.rating}/5 Collector Rating
                  </span>
                </div>
                <p className="mt-5 text-lg text-foreground/80 leading-relaxed italic">“{review.review_text}”</p>
                <div className="mt-6 border-t border-dashed border-border pt-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div aria-hidden="true" className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-primary/30 bg-primary/5 font-display text-lg text-primary">
                        {review.customer_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-display text-base tracking-wide text-foreground">{review.customer_name}</p>
                        {review.location && <p className="text-xs text-muted">{review.location}</p>}
                      </div>
                    </div>
                    {review.product_name && (
                      <span className="text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Wearing<br /><span className="text-primary">{review.product_name}</span>
                      </span>
                    )}
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        )}

        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <a
            href="https://instagram.com/comicculture.lk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            <Instagram aria-hidden="true" className="h-4 w-4" />
            Join the conversation @ComicCulture.lk
          </a>
        </motion.div>
      </div>
    </section>
  );
}
