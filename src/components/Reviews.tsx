import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Instagram, Star } from 'lucide-react';
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
            CUSTOMER FEEDBACK
          </span>
          <h2 className="mt-6 font-display text-4xl md:text-5xl lg:text-6xl text-foreground tracking-wide">
            Customer <span className="text-gradient-red">reviews</span>
          </h2>
          <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">
            What customers say about their ComicCulture orders.
          </p>
        </motion.div>

        {reviews.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {reviews.map((review, index) => (
              <motion.article
                key={review.id}
                className="comic-panel p-6 sm:p-8"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-muted">
                    Customer review
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground" aria-label={`${review.rating} out of 5 stars`}>
                    <Star aria-hidden="true" className="h-4 w-4 fill-current text-amber-500" />
                    {review.rating}/5
                  </span>
                </div>
                <p className="mt-5 text-base leading-relaxed text-foreground/80">“{review.review_text}”</p>
                <div className="mt-6 border-t border-border pt-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div aria-hidden="true" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                        {review.customer_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{review.customer_name}</p>
                        {review.location && <p className="text-xs text-muted">{review.location}</p>}
                      </div>
                    </div>
                    {review.product_name && (
                      <span className="text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Product<br /><span className="text-primary">{review.product_name}</span>
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
