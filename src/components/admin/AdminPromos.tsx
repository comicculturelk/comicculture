import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { formatPrice } from '../../data/products';

interface PromoCode {
  id: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  minimum_subtotal: number;
  max_redemptions: number | null;
  usage_count: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary';

export default function AdminPromos() {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [minimumSubtotal, setMinimumSubtotal] = useState('0');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadPromos = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabaseAdmin
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false });
    if (loadError) setError('Could not load promo codes. Please refresh and try again.');
    else {
      setPromos((data ?? []) as PromoCode[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadPromos(); }, [loadPromos]);

  const createPromo = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const value = Number(discountValue);
    const minimum = Number(minimumSubtotal);
    const limit = maxRedemptions.trim() ? Number(maxRedemptions) : null;
    if (!/^[A-Z0-9_-]{3,32}$/.test(code.trim().toUpperCase())) {
      setError('Use 3–32 letters, numbers, hyphens, or underscores for the code.');
      return;
    }
    if (!Number.isFinite(value) || value <= 0 || (discountType === 'percent' && value > 100)) {
      setError(discountType === 'percent' ? 'Enter a discount from 1 to 100%.' : 'Enter a positive discount amount.');
      return;
    }
    if (!Number.isFinite(minimum) || minimum < 0 || (limit !== null && (!Number.isInteger(limit) || limit < 1))) {
      setError('Check the minimum order and redemption limit.');
      return;
    }
    const starts = startsAt ? new Date(startsAt) : null;
    const expires = expiresAt ? new Date(expiresAt) : null;
    if (starts && expires && expires <= starts) {
      setError('The expiry time must be later than the start time.');
      return;
    }

    setSaving(true);
    const payload = {
      code: code.trim().toUpperCase(),
      discount_type: discountType,
      discount_value: value,
      minimum_subtotal: minimum,
      max_redemptions: limit,
      starts_at: starts?.toISOString() ?? null,
      expires_at: expires?.toISOString() ?? null,
    };
    const result = editingId
      ? await supabaseAdmin.from('promo_codes').update(payload).eq('id', editingId)
      : await supabaseAdmin.from('promo_codes').insert(payload);
    const saveError = result.error;
    if (saveError) setError(saveError.code === '23505' ? 'That promo code already exists.' : 'Could not save the promo code.');
    else {
      setNotice(editingId ? 'Promo code updated. Existing redemptions remain unchanged.' : 'Promo code created.');
      setEditingId(null);
      setCode('');
      setDiscountValue('');
      setMaxRedemptions('');
      setStartsAt('');
      setExpiresAt('');
      await loadPromos();
    }
    setSaving(false);
  };

  const editPromo = (promo: PromoCode) => {
    if (promo.usage_count > 0) return;
    setEditingId(promo.id);
    setCode(promo.code);
    setDiscountType(promo.discount_type);
    setDiscountValue(String(promo.discount_value));
    setMinimumSubtotal(String(promo.minimum_subtotal));
    setMaxRedemptions(promo.max_redemptions == null ? '' : String(promo.max_redemptions));
    setStartsAt(promo.starts_at ? new Date(promo.starts_at).toISOString().slice(0, 16) : '');
    setExpiresAt(promo.expires_at ? new Date(promo.expires_at).toISOString().slice(0, 16) : '');
    setNotice('Editing unused promo. Used promo terms are locked to preserve redemption history.');
    setError(null);
  };

  const togglePromo = async (promo: PromoCode) => {
    setError(null);
    const { error: updateError } = await supabaseAdmin
      .from('promo_codes')
      .update({ is_active: !promo.is_active })
      .eq('id', promo.id);
    if (updateError) setError('Could not update this promo code.');
    else setPromos((current) => current.map((row) => row.id === promo.id ? { ...row, is_active: !promo.is_active } : row));
  };

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-xl tracking-wide text-foreground">PROMO CODES</h2>
        <p className="mt-1 text-sm text-muted-foreground">Discounts are recalculated and redeemed atomically when the order is placed.</p>
      </div>

      <form onSubmit={createPromo} className="glass grid grid-cols-1 gap-4 rounded-2xl p-5 md:grid-cols-2">
        <label className="text-xs text-muted-foreground">Code
          <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={32} required className={`${inputClass} mt-1`} placeholder="FAN10" />
        </label>
        <div className="grid grid-cols-[1fr_1fr] gap-3">
          <label className="text-xs text-muted-foreground">Discount type
            <select value={discountType} onChange={(event) => setDiscountType(event.target.value as 'percent' | 'fixed')} className={`${inputClass} mt-1`}>
              <option value="percent">Percent</option><option value="fixed">Fixed LKR</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Discount value
            <input type="number" min="0.01" max={discountType === 'percent' ? 100 : undefined} step="0.01" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} required className={`${inputClass} mt-1`} />
          </label>
        </div>
        <label className="text-xs text-muted-foreground">Minimum subtotal (LKR)
          <input type="number" min="0" step="1" value={minimumSubtotal} onChange={(event) => setMinimumSubtotal(event.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-muted-foreground">Maximum redemptions (blank for unlimited)
          <input type="number" min="1" step="1" value={maxRedemptions} onChange={(event) => setMaxRedemptions(event.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-muted-foreground">Starts at (optional)
          <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-muted-foreground">Expires at (optional)
          <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className={`${inputClass} mt-1`} />
        </label>
        {error && <p role="alert" className="text-sm text-primary md:col-span-2">{error}</p>}
        {notice && <p role="status" className="text-sm text-green-400 md:col-span-2">{notice}</p>}
        <div className="flex gap-2 md:col-span-2"><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : editingId ? 'Save promo changes' : 'Create promo code'}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setCode(''); setDiscountValue(''); setMinimumSubtotal('0'); setMaxRedemptions(''); setStartsAt(''); setExpiresAt(''); }} className="btn-outline">Cancel edit</button>}</div>
      </form>

      {loading ? <p className="text-sm text-muted-foreground">Loading promo codes…</p> : promos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No promo codes yet.</p>
      ) : (
        <div className="space-y-3">
          {promos.map((promo) => (
            <article key={promo.id} className="glass flex flex-wrap items-center justify-between gap-4 rounded-xl p-4">
              <div>
                <p className="font-semibold tracking-wide text-foreground">{promo.code}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {promo.discount_type === 'percent' ? `${promo.discount_value}% off` : `${formatPrice(promo.discount_value)} off`}
                  {promo.minimum_subtotal > 0 ? ` · min. ${formatPrice(promo.minimum_subtotal)}` : ''}
                  {' · '}{promo.usage_count}{promo.max_redemptions ? ` / ${promo.max_redemptions}` : ''} used
                </p>
                {(promo.starts_at || promo.expires_at) && <p className="mt-1 text-xs text-muted">{promo.starts_at ? `Starts ${new Date(promo.starts_at).toLocaleString()}` : 'Available now'}{promo.expires_at ? ` · Expires ${new Date(promo.expires_at).toLocaleString()}` : ''}</p>}
              </div>
              <div className="flex gap-2"><button type="button" disabled={saving || promo.usage_count > 0} title={promo.usage_count > 0 ? 'Terms lock after first redemption' : 'Edit promo terms'} onClick={() => editPromo(promo)} className="btn-outline text-xs disabled:opacity-40">Edit</button><button type="button" onClick={() => void togglePromo(promo)} className="btn-outline text-xs">{promo.is_active ? 'Deactivate' : 'Activate'}</button></div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
