import { useState, type FormEvent } from 'react';
import { formatPrice } from '../../data/products';
import { useAdminForm } from '../../hooks/useAdminForm';
import { useDeliveryFee } from '../../hooks/useDeliveryFee';
import { supabaseAdmin } from '../../lib/supabaseAdmin';

export default function AdminDeliverySettings() {
  const { fee, failed, refresh } = useDeliveryFee();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { markDirty, markSaved } = useAdminForm(saving);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || fee === null || draft === null) return;
    const input = draft.trim();
    setError(null);
    setSaved(null);
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(input)) {
      setError('Enter a non-negative amount up to Rs. 99,999,999.99 with up to two decimal places.');
      return;
    }

    setSaving(true);
    try {
      const { data, error: updateError } = await supabaseAdmin.from('delivery_settings')
        .update({ delivery_fee: Number(input) }).eq('id', 1).select('delivery_fee').single();
      if (updateError || typeof data?.delivery_fee !== 'number') throw new Error('Delivery fee update failed.');
      markSaved();
      setDraft(null);
      setSaved(data.delivery_fee);
      refresh();
    } catch {
      setError('Could not save the delivery fee. Check your connection and admin session, then try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass max-w-lg space-y-4 rounded-2xl p-5 sm:p-6">
      <h2 className="font-display text-2xl">Delivery settings</h2>
      {fee === null && !failed && <p role="status">Loading delivery fee…</p>}
      {failed && (
        <div className="space-y-2">
          <p role="alert">Could not load the delivery fee.</p>
          <button type="button" className="btn-outline" onClick={refresh}>Retry</button>
        </div>
      )}
      {fee !== null && (
        <form className="space-y-4" onSubmit={save}>
          <label className="block text-sm font-medium">
            Delivery fee (LKR)
            <input
              inputMode="decimal"
              value={draft ?? String(fee)}
              onChange={(event) => {
                setDraft(event.target.value);
                setSaved(null);
                setError(null);
                markDirty();
              }}
              disabled={saving}
              aria-describedby="delivery-fee-help"
              aria-invalid={!!error}
              className="mt-2 block w-full rounded-lg border border-border bg-surface px-3 py-2.5"
            />
          </label>
          <p id="delivery-fee-help" className="text-sm text-muted-foreground">Enter 0 for free delivery. Changes apply to new orders.</p>
          {error && <p role="alert" className="text-sm text-primary">{error}</p>}
          <button type="submit" className="btn-primary" disabled={saving || draft === null}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      )}
      {saved !== null && <p role="status" className="text-sm">Delivery fee saved. {saved === 0 ? 'Delivery is free.' : formatPrice(saved)}</p>}
    </section>
  );
}
