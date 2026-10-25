import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { fetchProducts, type Product } from '../../data/products';
import { useAdminForm } from '../../hooks/useAdminForm';

interface CustomerReview {
  id: string;
  customer_name: string;
  location: string | null;
  review_text: string;
  product_name: string | null;
  rating: number;
  is_published: boolean;
  created_at: string;
}

const inputClass = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary';

export default function AdminReviews() {
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [product, setProduct] = useState('');
  const [rating, setRating] = useState('5');
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsError, setProductsError] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { markDirty, markSaved, confirmDiscard, errorRef } = useAdminForm(saving || Boolean(togglingId));

  const loadReviews = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabaseAdmin
      .from('customer_reviews').select('*').order('created_at', { ascending: false });
    if (loadError) setError('Could not load reviews. Please refresh and try again.');
    else {
      setReviews((data ?? []) as CustomerReview[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadReviews(); }, [loadReviews]);
  useEffect(() => {
    let cancelled = false;
    fetchProducts().then((rows) => { if (!cancelled) setProducts(rows); }).catch(() => { if (!cancelled) setProductsError(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error, errorRef]);

  const addReview = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || togglingId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const payload = {
      customer_name: name.trim(),
      location: location.trim() || null,
      review_text: reviewText.trim(),
      product_name: product.trim() || null,
      rating: Number(rating),
    };
    const result = editingReviewId
      ? await supabaseAdmin.from('customer_reviews').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingReviewId).select('id').single()
      : await supabaseAdmin.from('customer_reviews').insert({ ...payload, is_published: false }).select('id').single();
    const saveError = result.error;
    if (saveError) setError('Could not save this review. Check the fields and try again.');
    else {
      markSaved();
      setEditingReviewId(null);
      setName(''); setLocation(''); setReviewText(''); setProduct(''); setRating('5');
      setNotice(editingReviewId ? 'Review updated. Its publication status is unchanged.' : 'Review saved as a draft. Publish it when you have permission to share it.');
      await loadReviews();
    }
    setSaving(false);
  };

  const editReview = (review: CustomerReview) => {
    if (!confirmDiscard()) return;
    markSaved();
    setEditingReviewId(review.id);
    setName(review.customer_name);
    setLocation(review.location ?? '');
    setReviewText(review.review_text);
    setProduct(review.product_name ?? '');
    setRating(String(review.rating));
    setNotice('Editing review content keeps its current draft or published state.');
    setError(null);
  };

  const togglePublished = async (review: CustomerReview) => {
    if (saving || togglingId) return;
    setError(null);
    setNotice(null);
    setTogglingId(review.id);
    const { error: updateError } = await supabaseAdmin.from('customer_reviews')
      .update({ is_published: !review.is_published }).eq('id', review.id).select('id').single();
    if (updateError) setError('Could not update this review.');
    else {
      setReviews((current) => current.map((item) => item.id === review.id
        ? { ...item, is_published: !review.is_published } : item));
      setNotice(review.is_published ? 'Review hidden from the storefront.' : 'Review published.');
    }
    setTogglingId(null);
  };

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-xl tracking-wide text-foreground">Customer reviews</h2>
        <p className="mt-1 text-sm text-muted-foreground">New reviews stay private drafts until you publish them. Share customer feedback only with their permission.</p>
      </div>

      <form onChangeCapture={markDirty} onSubmit={addReview} className="glass grid grid-cols-1 gap-4 rounded-2xl p-5 md:grid-cols-2">
        <label className="text-xs text-muted-foreground">Customer name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required className={inputClass} /></label>
        <label className="text-xs text-muted-foreground">Location (optional)<input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={100} className={inputClass} /></label>
        <label className="text-xs text-muted-foreground">Product (optional)<select value={product} onChange={(event) => setProduct(event.target.value)} className={inputClass}>
          <option value="">General store review</option>
          {product && !products.some((item) => item.name === product) && <option value={product}>{product} (saved name)</option>}
          {products.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
        </select>{productsError && <span role="status">Catalog could not load. Saved product association is preserved; refresh to select another product.</span>}</label>
        <label className="text-xs text-muted-foreground">Rating
          <select value={rating} onChange={(event) => setRating(event.target.value)} className={inputClass}>
            {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} / 5</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground md:col-span-2">Review
          <textarea value={reviewText} onChange={(event) => setReviewText(event.target.value)} minLength={10} maxLength={1500} rows={4} required className={inputClass} />
        </label>
        {error && <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-primary md:col-span-2">{error}</p>}
        {notice && <p role="status" className="text-sm text-green-400 md:col-span-2">{notice}</p>}
        <div className="flex gap-2 md:col-span-2"><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : editingReviewId ? 'Save review' : 'Save review draft'}</button>{editingReviewId && <button type="button" disabled={saving} onClick={() => { if (!confirmDiscard()) return; markSaved(); setEditingReviewId(null); setName(''); setLocation(''); setReviewText(''); setProduct(''); setRating('5'); }} className="btn-outline">Cancel edit</button>}</div>
      </form>

      {loading ? <p className="text-sm text-muted-foreground">Loading reviews…</p> : reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews yet.</p>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <article key={review.id} className="glass flex flex-wrap items-start justify-between gap-4 rounded-xl p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="font-semibold text-foreground">{review.customer_name}</p>
                  <span className="text-xs text-muted-foreground">{review.rating}/5{review.product_name ? ` · ${review.product_name}` : ''}</span>
                  <span className={`text-xs font-medium ${review.is_published ? 'text-green-400' : 'text-amber-400'}`}>{review.is_published ? 'Published' : 'Draft'}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{review.review_text}</p>
                <p className="mt-2 text-xs text-muted">{[review.location, new Date(review.created_at).toLocaleDateString()].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex shrink-0 gap-2"><button type="button" disabled={saving || Boolean(togglingId)} onClick={() => editReview(review)} className="btn-outline text-xs">Edit</button><button type="button" disabled={saving || Boolean(togglingId)} onClick={() => void togglePublished(review)} className="btn-outline text-xs">{review.is_published ? 'Hide review' : 'Publish review'}</button></div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
