import { useEffect, useState, type FormEvent } from 'react';
import {
  createProduct,
  updateProduct,
  createProductVersion,
  createProductVersionSize,
  updateProductStock,
  fetchProductBySlug,
  isSlugTaken,
  isSkuTaken,
  PRODUCT_TYPES,
  PRODUCT_TYPE_LABELS,
  type Product,
  type ProductInput,
  type ProductType,
  type ProductVersion,
  type ProductVersionInput,
} from '../../data/products';
import { fetchCollections, type Collection } from '../../data/collections';
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

// --- New (unsaved) version/size draft state ---
// These represent versions/sizes being added in this editing session, via
// createProductVersion / createProductVersionSize on submit. Local-only
// ids (localId) key React state before a real DB id exists.

interface DraftSize {
  localId: string;
  size: string;
  sku: string;
  price: string;
  stock: string;
}

interface DraftVersion {
  localId: string;
  versionName: string;
  productType: ProductType;
  material: string;
  fit: string;
  color: string;
  careInstructions: string; // one line per instruction, joined with \n
  isPreorder: boolean;
  preorderDays: string;
  isActive: boolean;
  sizes: DraftSize[];
}

function emptyDraftSize(): DraftSize {
  return { localId: crypto.randomUUID(), size: '', sku: '', price: '', stock: '0' };
}

function emptyDraftVersion(): DraftVersion {
  return {
    localId: crypto.randomUUID(),
    versionName: '',
    productType: 'regular_tshirt',
    material: '',
    fit: '',
    color: '',
    careInstructions: '',
    isPreorder: false,
    preorderDays: '14',
    isActive: true,
    sizes: [emptyDraftSize()],
  };
}

/**
 * Read-only summary of a version that already exists in the database.
 * Only stock is editable here — updating a version's own fields (type,
 * material, fit, color, pre-order, care instructions) or an existing
 * size's SKU/price has no backing write function in data/products.ts yet
 * (see report). Add a new version below for other changes.
 */
function ExistingVersionCard({
  version,
  stockEdits,
  onStockChange,
}: {
  version: ProductVersion;
  stockEdits: Record<string, string>;
  onStockChange: (sizeId: string, value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-sm tracking-wide text-foreground">{version.versionName}</p>
        <span className="text-[11px] uppercase tracking-wide text-muted">
          {PRODUCT_TYPE_LABELS[version.productType]}
          {!version.isActive ? ' · Inactive' : ''}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
        {version.material && <p>Material: {version.material}</p>}
        {version.fit && <p>Fit: {version.fit}</p>}
        {version.color && <p>Color: {version.color}</p>}
        {version.isPreorder && (
          <p>Pre-order: {version.preorderDays ? `${version.preorderDays} days` : 'Yes'}</p>
        )}
      </div>

      {version.careInstructions && version.careInstructions.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-xs text-muted">
          {version.careInstructions.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {version.sizes.map((size) => (
          <div key={size.id} className="rounded-lg border border-border bg-background p-2">
            <p className="text-[11px] uppercase tracking-wide text-muted">
              {size.size} · {size.sku}
            </p>
            <p className="text-xs text-muted-foreground">Rs. {size.price}</p>
            <label className="mt-1 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted">Stock</span>
              <input
                type="number"
                min="0"
                value={stockEdits[size.id] ?? String(size.stock)}
                onChange={(e) => onStockChange(size.id, e.target.value)}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Editable card for a brand-new version being added in this session. */
function DraftVersionCard({
  version,
  index,
  onChange,
  onRemove,
  onAddSize,
  onRemoveSize,
  onSizeChange,
  removable,
}: {
  version: DraftVersion;
  index: number;
  onChange: (patch: Partial<DraftVersion>) => void;
  onRemove: () => void;
  onAddSize: () => void;
  onRemoveSize: (sizeLocalId: string) => void;
  onSizeChange: (sizeLocalId: string, patch: Partial<DraftSize>) => void;
  removable: boolean;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted">Version {index + 1}</span>
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-muted-foreground hover:text-primary"
          >
            Remove
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Version Name</span>
          <input
            value={version.versionName}
            onChange={(e) => onChange({ versionName: e.target.value })}
            className={inputClass()}
            placeholder="Jersey"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Apparel Type</span>
          <select
            value={version.productType}
            onChange={(e) => onChange({ productType: e.target.value as ProductType })}
            className={inputClass()}
          >
            {PRODUCT_TYPES.map((type) => (
              <option key={type} value={type}>
                {PRODUCT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Material</span>
          <input
            value={version.material}
            onChange={(e) => onChange({ material: e.target.value })}
            className={inputClass()}
            placeholder="Premium breathable polyester mesh"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Fit</span>
          <input
            value={version.fit}
            onChange={(e) => onChange({ fit: e.target.value })}
            className={inputClass()}
            placeholder="True to size, athletic fit"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Color</span>
          <input
            value={version.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className={inputClass()}
            placeholder="Black"
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={version.isActive}
            onChange={(e) => onChange({ isActive: e.target.checked })}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-sm text-foreground">Active</span>
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={fieldLabelClass()}>Care Instructions (one per line)</span>
          <textarea
            value={version.careInstructions}
            onChange={(e) => onChange({ careInstructions: e.target.value })}
            rows={3}
            className={inputClass()}
            placeholder={'Machine wash cold with like colors\nDo not bleach'}
          />
        </label>
      </div>

      <div className="space-y-3">
        <span className={fieldLabelClass()}>Pre-Order</span>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={version.isPreorder}
            onChange={(e) => {
              const checked = e.target.checked;
              onChange({
                isPreorder: checked,
                preorderDays:
                  checked && (!version.preorderDays || Number(version.preorderDays) <= 0)
                    ? '14'
                    : version.preorderDays,
              });
            }}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-sm text-foreground">Available for pre-order</span>
        </label>

        {version.isPreorder && (
          <label className="flex flex-col gap-1.5 sm:w-48">
            <span className={fieldLabelClass()}>Pre-order delivery period (days)</span>
            <input
              type="number"
              min="1"
              value={version.preorderDays}
              onChange={(e) => onChange({ preorderDays: e.target.value })}
              className={inputClass()}
              placeholder="14"
            />
          </label>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className={fieldLabelClass()}>Sizes</span>
          <button
            type="button"
            onClick={onAddSize}
            className="text-xs font-medium text-primary hover:underline"
          >
            + Add Size
          </button>
        </div>

        <div className="space-y-2">
          {version.sizes.map((s) => (
            <div key={s.localId} className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:items-end">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted">Size</span>
                <input
                  value={s.size}
                  onChange={(e) =>
                    onSizeChange(s.localId, { size: e.target.value.toUpperCase() })
                  }
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                  placeholder="M"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted">SKU</span>
                <input
                  value={s.sku}
                  onChange={(e) => onSizeChange(s.localId, { sku: e.target.value.toUpperCase() })}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                  placeholder="CC-JERSEY-M"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted">
                  Price (Rs.)
                </span>
                <input
                  type="number"
                  min="0"
                  value={s.price}
                  onChange={(e) => onSizeChange(s.localId, { price: e.target.value })}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                  placeholder="4500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted">Stock</span>
                <input
                  type="number"
                  min="0"
                  value={s.stock}
                  onChange={(e) => onSizeChange(s.localId, { stock: e.target.value })}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                  placeholder="0"
                />
              </label>
              <button
                type="button"
                onClick={() => onRemoveSize(s.localId)}
                className="justify-self-start rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-primary sm:justify-self-auto"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProductForm({ mode, product, onSaved, onCancel }: ProductFormProps) {
  // --- Product (design/story) fields ---
  const [name, setName] = useState(product?.name ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  const [collectionId, setCollectionId] = useState(product?.collectionId ?? '');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [tagline, setTagline] = useState(product?.tagline ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [lore, setLore] = useState(product?.lore ?? '');
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [images, setImages] = useState<string[]>(
    product?.images && product.images.length > 0
      ? product.images
      : product?.image
        ? [product.image]
        : []
  );

  // --- Existing versions (edit mode) — stock is the only editable field ---
  const [stockEdits, setStockEdits] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    product?.versions.forEach((v) => v.sizes.forEach((s) => { map[s.id] = String(s.stock); }));
    return map;
  });

  // --- New versions being added in this editing session ---
  const [draftVersions, setDraftVersions] = useState<DraftVersion[]>(
    mode === 'create' ? [emptyDraftVersion()] : []
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCollectionsLoading(true);
    fetchCollections()
      .then((data) => {
        if (!cancelled) setCollections(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setCollectionsError(e instanceof Error ? e.message : 'Failed to load collections');
        }
      })
      .finally(() => {
        if (!cancelled) setCollectionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const updateDraftVersion = (localId: string, patch: Partial<DraftVersion>) => {
    setDraftVersions((prev) =>
      prev.map((v) => (v.localId === localId ? { ...v, ...patch } : v))
    );
  };

  const addDraftVersion = () => {
    setDraftVersions((prev) => [...prev, emptyDraftVersion()]);
  };

  const removeDraftVersion = (localId: string) => {
    setDraftVersions((prev) => prev.filter((v) => v.localId !== localId));
  };

  const addDraftSize = (versionLocalId: string) => {
    setDraftVersions((prev) =>
      prev.map((v) =>
        v.localId === versionLocalId ? { ...v, sizes: [...v.sizes, emptyDraftSize()] } : v
      )
    );
  };

  const removeDraftSize = (versionLocalId: string, sizeLocalId: string) => {
    setDraftVersions((prev) =>
      prev.map((v) =>
        v.localId === versionLocalId
          ? { ...v, sizes: v.sizes.filter((s) => s.localId !== sizeLocalId) }
          : v
      )
    );
  };

  const updateDraftSize = (
    versionLocalId: string,
    sizeLocalId: string,
    patch: Partial<DraftSize>
  ) => {
    setDraftVersions((prev) =>
      prev.map((v) =>
        v.localId === versionLocalId
          ? {
              ...v,
              sizes: v.sizes.map((s) => (s.localId === sizeLocalId ? { ...s, ...patch } : s)),
            }
          : v
      )
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError('Name is required.');
    if (!slug.trim()) return setError('Slug is required.');
    if (!collectionId) return setError('Select a collection.');
    if (images.length === 0) return setError('Upload at least one product image.');

    // Only versions the admin actually touched this session get created —
    // an untouched blank draft (the default one in create mode) is ignored
    // rather than erroring, so an admin can still delete it and add their
    // own without a false "required" flag on a version they never opened.
    const versionsToCreate = draftVersions.filter(
      (v) =>
        v.versionName.trim() ||
        v.sizes.some((s) => s.size.trim() || s.sku.trim() || s.price.trim())
    );

    if (mode === 'create' && versionsToCreate.length === 0) {
      return setError('Add at least one product version.');
    }

    for (const v of versionsToCreate) {
      if (!v.versionName.trim()) {
        return setError('Each version needs a name (e.g. "Jersey", "Oversized — Black").');
      }
      const validSizes = v.sizes.filter(
        (s) => s.size.trim() || s.sku.trim() || s.price.trim()
      );
      if (validSizes.length === 0) {
        return setError(`Add at least one size for "${v.versionName.trim()}".`);
      }
      for (const s of validSizes) {
        if (!s.size.trim()) {
          return setError(`Enter a size label for "${v.versionName.trim()}".`);
        }
        if (!s.sku.trim()) {
          return setError(
            `Enter a SKU for size "${s.size.trim()}" in "${v.versionName.trim()}".`
          );
        }
        const priceValue = Number(s.price);
        if (!priceValue || priceValue <= 0) {
          return setError(
            `Enter a valid price for size "${s.size.trim()}" in "${v.versionName.trim()}".`
          );
        }
      }
      if (v.isPreorder) {
        const days = Number(v.preorderDays);
        if (!days || days <= 0) {
          return setError(
            `Enter a valid pre-order delivery period for "${v.versionName.trim()}".`
          );
        }
      }
    }

    const newSkus = versionsToCreate.flatMap((v) =>
      v.sizes.filter((s) => s.sku.trim()).map((s) => s.sku.trim())
    );
    if (new Set(newSkus).size !== newSkus.length) {
      return setError('Duplicate SKU entered — each size needs a unique SKU.');
    }

    setSubmitting(true);
    try {
      const excludeId = mode === 'edit' ? product?.id : undefined;
      const [slugAlreadyTaken, skuConflicts] = await Promise.all([
        isSlugTaken(slug.trim(), excludeId),
        Promise.all(newSkus.map((sku) => isSkuTaken(sku))),
      ]);
      if (slugAlreadyTaken) {
        setError('This slug is already in use by another product.');
        setSubmitting(false);
        return;
      }
      if (skuConflicts.some(Boolean)) {
        setError('One of the SKUs entered is already in use.');
        setSubmitting(false);
        return;
      }

      const productInput: ProductInput = {
        name: name.trim(),
        slug: slug.trim(),
        collectionId,
        tagline: tagline.trim(),
        description: description.trim(),
        lore: lore.trim(),
        images,
        featured,
      };

      const savedProduct =
        mode === 'create'
          ? await createProduct(productInput)
          : await updateProduct(product!.id, productInput);

      // Persist stock edits made to existing version-sizes (edit mode only).
      if (mode === 'edit' && product) {
        for (const version of product.versions) {
          for (const size of version.sizes) {
            const edited = stockEdits[size.id];
            if (edited == null) continue;
            const nextStock = Number(edited);
            if (Number.isFinite(nextStock) && nextStock !== size.stock) {
              await updateProductStock(size.id, Math.max(0, nextStock));
            }
          }
        }
      }

      // Create any new versions (and their sizes) added during this session.
      for (const v of versionsToCreate) {
        const preorderDaysValue = Number(v.preorderDays);
        const versionInput: ProductVersionInput = {
          versionName: v.versionName.trim(),
          productType: v.productType,
          material: v.material.trim() || undefined,
          fit: v.fit.trim() || undefined,
          color: v.color.trim() || undefined,
          careInstructions: v.careInstructions
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          isPreorder: v.isPreorder,
          preorderDays: v.isPreorder ? preorderDaysValue : null,
          isActive: v.isActive,
          sortOrder: (product?.versions.length ?? 0) + draftVersions.indexOf(v),
        };
        const newVersion = await createProductVersion(savedProduct.id, versionInput);

        for (const s of v.sizes.filter((size) => size.size.trim())) {
          await createProductVersionSize(newVersion.id, {
            size: s.size.trim().toUpperCase(),
            sku: s.sku.trim(),
            price: Number(s.price),
            stock: Number(s.stock) || 0,
          });
        }
      }

      const finalProduct = (await fetchProductBySlug(savedProduct.slug)) ?? savedProduct;
      onSaved(finalProduct);
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

      {/* Core product (design/story) details */}
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
          <span className={fieldLabelClass()}>Collection</span>
          <select
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
            disabled={collectionsLoading || collections.length === 0}
            className={inputClass()}
          >
            <option value="" disabled>
              {collectionsLoading
                ? 'Loading collections...'
                : collections.length === 0
                  ? 'No collections yet'
                  : 'Select a collection'}
            </option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {collectionsError && (
            <span className="text-xs text-primary">{collectionsError}</span>
          )}
          {!collectionsLoading && collections.length === 0 && !collectionsError && (
            <span className="text-xs text-muted">
              Create a collection first under Admin → Collections.
            </span>
          )}
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-sm text-foreground">Featured product</span>
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
      </div>

      {/* Images */}
      <div className="border-t border-border pt-6">
        <ImageManager slug={slug} images={images} onChange={setImages} disabled={submitting} />
      </div>

      {/* Existing versions (edit mode only) */}
      {mode === 'edit' && product && product.versions.length > 0 && (
        <div className="space-y-4 border-t border-border pt-6">
          <span className={fieldLabelClass()}>Existing Versions</span>
          <div className="space-y-3">
            {product.versions.map((v) => (
              <ExistingVersionCard
                key={v.id}
                version={v}
                stockEdits={stockEdits}
                onStockChange={(sizeId, value) =>
                  setStockEdits((prev) => ({ ...prev, [sizeId]: value }))
                }
              />
            ))}
          </div>
          <p className="text-xs text-muted">
            Editing a version's own details (type, material, fit, color, pre-order, care
            instructions) or an existing size's SKU/price isn't supported from this form yet —
            only stock quantities can be adjusted above. Add a new version below for other
            changes.
          </p>
        </div>
      )}

      {/* New versions being added this session */}
      <div className="space-y-4 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <span className={fieldLabelClass()}>
            {mode === 'create' ? 'Version' : 'Add New Version'}
          </span>
          <button
            type="button"
            onClick={addDraftVersion}
            className="text-xs font-medium text-primary hover:underline"
          >
            + Add Version
          </button>
        </div>

        {draftVersions.length === 0 && (
          <p className="text-xs text-muted">No new versions added.</p>
        )}

        <div className="space-y-4">
          {draftVersions.map((v, i) => (
            <DraftVersionCard
              key={v.localId}
              version={v}
              index={i}
              onChange={(patch) => updateDraftVersion(v.localId, patch)}
              onRemove={() => removeDraftVersion(v.localId)}
              onAddSize={() => addDraftSize(v.localId)}
              onRemoveSize={(sizeLocalId) => removeDraftSize(v.localId, sizeLocalId)}
              onSizeChange={(sizeLocalId, patch) => updateDraftSize(v.localId, sizeLocalId, patch)}
              removable={mode === 'edit' || draftVersions.length > 1}
            />
          ))}
        </div>
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
