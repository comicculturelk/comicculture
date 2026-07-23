import { useState, type FormEvent } from 'react';
import {
  createProduct,
  updateProduct,
  isSlugTaken,
  isSkuTaken,
  type Product,
  type ProductInput,
} from '../../data/products';
import { slugify } from '../../lib/slug';
import ImageManager from './ImageManager';

interface ProductFormProps {
  mode: 'create' | 'edit';
  product?: Product;
  onSaved: (product: Product) => void;
  onCancel: () => void;
}

function fieldLabelClass() {
  return 'text-xs uppercase tracking-wide text-muted';
}

function inputClass() {
  return 'w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary';
}

export default function ProductForm({ mode, product, onSaved, onCancel }: ProductFormProps) {
  const [name, setName] = useState(product?.name ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [skuTouched, setSkuTouched] = useState(mode === 'edit');
  const [collection, setCollection] = useState(product?.collection ?? '');
  const [tagline, setTagline] = useState(product?.tagline ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [lore, setLore] = useState(product?.lore ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [material, setMaterial] = useState(product?.material ?? '');
  const [fit, setFit] = useState(product?.fit ?? '');
  const [careInstructions, setCareInstructions] = useState(
    (product?.careInstructions ?? []).join('\n')
  );
  const [sizes, setSizes] = useState<string[]>(product?.sizes ?? []);
  const [sizeInput, setSizeInput] = useState('');
  const [stock, setStock] = useState<Record<string, number>>(product?.stock ?? {});
  const [images, setImages] = useState<string[]>(
    product?.images && product.images.length > 0
      ? product.images
      : product?.image
        ? [product.image]
        : []
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) {
      const nextSlug = slugify(value);
      setSlug(nextSlug);
      if (!skuTouched) setSku(nextSlug ? `CC-${nextSlug.toUpperCase()}` : '');
    }
  };

  const addSize = () => {
    const value = sizeInput.trim().toUpperCase();
    if (value && !sizes.includes(value)) {
      setSizes([...sizes, value]);
      setStock((prev) => ({ ...prev, [value]: prev[value] ?? 0 }));
    }
    setSizeInput('');
  };

  const removeSize = (size: string) => {
    setSizes(sizes.filter((s) => s !== size));
    setStock((prev) => {
      const next = { ...prev };
      delete next[size];
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError('Name is required.');
    if (!slug.trim()) return setError('Slug is required.');
    if (!sku.trim()) return setError('SKU is required.');
    if (!collection.trim()) return setError('Collection is required.');
    const priceValue = Number(price);
    if (!priceValue || priceValue <= 0) return setError('Enter a valid price.');
    if (sizes.length === 0) return setError('Add at least one size.');
    if (images.length === 0) return setError('Upload at least one product image.');

    setSubmitting(true);
    try {
      const excludeId = mode === 'edit' ? product?.id : undefined;
      const [slugAlreadyTaken, skuAlreadyTaken] = await Promise.all([
        isSlugTaken(slug.trim(), excludeId),
        isSkuTaken(sku.trim(), excludeId),
      ]);
      if (slugAlreadyTaken) {
        setError('This slug is already in use by another product.');
        setSubmitting(false);
        return;
      }
      if (skuAlreadyTaken) {
        setError('This SKU is already in use by another product.');
        setSubmitting(false);
        return;
      }

      const input: ProductInput = {
        name: name.trim(),
        slug: slug.trim(),
        sku: sku.trim(),
        collection: collection.trim(),
        tagline: tagline.trim(),
        description: description.trim(),
        lore: lore.trim(),
        price: priceValue,
        sizes,
        images,
        featured,
        material: material.trim() || undefined,
        fit: fit.trim() || undefined,
        careInstructions: careInstructions
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        stock,
      };

      const saved =
        mode === 'create' ? await createProduct(input) : await updateProduct(product!.id, input);

      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass space-y-6 rounded-2xl p-6">
      <h2 className="font-display text-xl tracking-wide text-foreground">
        {mode === 'create' ? 'New Product' : 'Edit Product'}
      </h2>

      {error && <p className="text-sm text-primary">{error}</p>}

      {/* Core details */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Name</span>
          <input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className={inputClass()}
            placeholder="Web-Slinger Classic Red"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Slug</span>
          <input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            className={inputClass()}
            placeholder="web-slinger-classic-red"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>SKU</span>
          <input
            value={sku}
            onChange={(e) => {
              setSkuTouched(true);
              setSku(e.target.value.toUpperCase());
            }}
            className={inputClass()}
            placeholder="CC-WEB-SLINGER-CLASSIC-RED"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Collection</span>
          <input
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            className={inputClass()}
            placeholder="Web-Slinger Saga"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Price (Rs.)</span>
          <input
            type="number"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClass()}
            placeholder="4500"
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={fieldLabelClass()}>Tagline</span>
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            className={inputClass()}
            placeholder="Short one-line hook shown on product cards"
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={fieldLabelClass()}>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={inputClass()}
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={fieldLabelClass()}>Lore</span>
          <textarea
            value={lore}
            onChange={(e) => setLore(e.target.value)}
            rows={3}
            className={inputClass()}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Material</span>
          <input
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            className={inputClass()}
            placeholder="Premium breathable polyester mesh"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Fit</span>
          <input
            value={fit}
            onChange={(e) => setFit(e.target.value)}
            className={inputClass()}
            placeholder="True to size, athletic fit"
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={fieldLabelClass()}>Care Instructions (one per line)</span>
          <textarea
            value={careInstructions}
            onChange={(e) => setCareInstructions(e.target.value)}
            rows={4}
            className={inputClass()}
            placeholder={'Machine wash cold with like colors\nDo not bleach'}
          />
        </label>

        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-sm text-foreground">Featured product</span>
        </label>
      </div>

      {/* Sizes + stock */}
      <div className="space-y-3 border-t border-border pt-6">
        <span className={fieldLabelClass()}>Sizes & Stock</span>
        <div className="flex flex-wrap items-center gap-2">
          {sizes.map((size) => (
            <span
              key={size}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/20 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-primary"
            >
              {size}
              <button
                type="button"
                onClick={() => removeSize(size)}
                className="text-primary/70 hover:text-primary"
                aria-label={`Remove size ${size}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={sizeInput}
            onChange={(e) => setSizeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSize();
              }
            }}
            placeholder="Add size, press Enter"
            className="w-40 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary"
          />
        </div>

        {sizes.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {sizes.map((size) => (
              <label key={size} className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide text-muted">
                  Stock · {size}
                </span>
                <input
                  type="number"
                  min="0"
                  value={stock[size] ?? 0}
                  onChange={(e) =>
                    setStock((prev) => ({ ...prev, [size]: Number(e.target.value) }))
                  }
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Images */}
      <div className="border-t border-border pt-6">
        <ImageManager slug={slug} images={images} onChange={setImages} disabled={submitting} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 border-t border-border pt-6">
        <button type="submit" disabled={submitting} className="btn-primary px-6 py-2.5 text-sm">
          {submitting ? 'Saving...' : mode === 'create' ? 'Create Product' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-border px-6 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
