import { useEffect, useState, type FormEvent } from 'react';
import {
  createProduct,
  updateProduct,
  createProductVersion,
  updateProductVersion,
  deleteProductVersion,
  createProductVersionSize,
  updateProductVersionSize,
  deleteProductVersionSize,
  hasOrderHistory,
  fetchProductBySlug,
  isSlugTaken,
  isSkuTaken,
  generateSku,
  PRODUCT_TYPES,
  PRODUCT_TYPE_LABELS,
  type Product,
  type ProductInput,
  type ProductType,
  type ProductVersion,
  type ProductVersionInput,
  type ProductVersionSize,
  type SizeGuideRow,
} from '../../data/products';
import { adjustStock } from '../../data/inventory';
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

// --- Curated Material/Fit/Color options for the version form below ---
// These stay plain strings on ProductVersion/ProductVersionInput (no DB or
// type change) — the dropdowns just constrain new entry to a sane list
// while OptionSelect (below) keeps any existing free-text value intact.
const MATERIAL_OPTIONS = [
  'Cotton',
  'Cotton Jersey',
  'Polyester Jersey',
  'Fleece',
  'French Terry',
  'Other',
] as const;

const FIT_OPTIONS = ['Regular', 'Relaxed', 'Oversized', 'Slim'] as const;

const COLOR_OPTIONS = [
  'Black',
  'White',
  'Red',
  'Blue',
  'Green',
  'Yellow',
  'Orange',
  'Purple',
  'Grey',
  'Brown',
  'Pink',
  'Multicolor',
  'Other',
] as const;

/**
 * A <select> backed by a curated option list that never silently loses an
 * existing value. If `value` is non-empty and isn't one of `options` (e.g.
 * a free-text material/fit/color saved before these dropdowns existed), it
 * is injected as an extra selected option instead of being dropped/changed
 * — so opening the edit form for an old version keeps showing (and, unless
 * the admin explicitly picks something else, keeps saving) exactly what
 * was there before. An empty value shows the placeholder, matching the
 * previous behavior where a blank field saved as null.
 */
function OptionSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: readonly string[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const hasCustomValue = value !== '' && !options.includes(value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass()}>
      <option value="">{placeholder}</option>
      {hasCustomValue && <option value={value}>{value}</option>}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

// --- New (unsaved) version/size draft state ---
// These represent versions/sizes being added in this editing session, via
// createProductVersion / createProductVersionSize on submit. Local-only
// ids (localId) key React state before a real DB id exists.

// SKU is deliberately NOT part of this draft shape: for a size that doesn't
// exist in the DB yet, the SKU is always derived from (product slug, version
// name, size) via generateSku() at render time (for the preview shown to the
// admin) and again at submit time — never stored/typed here — so it can
// never go stale if the version name changes after sizes were added.
interface DraftSize {
  localId: string;
  size: string;
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
  /** Size Guide measurements, keyed by DraftSize.localId. Rows are always derived from `sizes`. */
  guide: Record<string, SizeMeasurements>;
}

// --- Size Guide ---
// Measurements are stored per size *identity* (existing size id / draft size
// localId), never as a separate list of sizes — the guide's rows are always
// derived from the version's actual sizes, so it can't drift from them.
interface SizeMeasurements {
  chest: string;
  length: string;
  sleeve: string;
}

const EMPTY_MEASUREMENTS: SizeMeasurements = { chest: '', length: '', sleeve: '' };

/** A size that currently exists (or will exist after save) on a version. */
interface GuideSize {
  key: string;
  size: string;
}

/** Sizes a saved version will have after this save: existing minus deleted, plus newly added. */
function guideSizesForExisting(
  version: ProductVersion,
  deletedSizeIds: Set<string>,
  newSizes: DraftSize[]
): GuideSize[] {
  return [
    ...version.sizes
      .filter((s) => !deletedSizeIds.has(s.id))
      .map((s) => ({ key: s.id, size: s.size })),
    ...newSizes
      .filter((s) => s.size.trim())
      .map((s) => ({ key: s.localId, size: s.size.trim().toUpperCase() })),
  ];
}

function guideSizesForDraft(sizes: DraftSize[]): GuideSize[] {
  return sizes
    .filter((s) => s.size.trim())
    .map((s) => ({ key: s.localId, size: s.size.trim().toUpperCase() }));
}

/** Builds the rows to save: only current sizes, skipping ones with no measurements. null when none. */
function buildSizeGuide(
  sizes: GuideSize[],
  guide: Record<string, SizeMeasurements>
): SizeGuideRow[] | null {
  const rows: SizeGuideRow[] = [];
  for (const { key, size } of sizes) {
    const m = guide[key] ?? EMPTY_MEASUREMENTS;
    const row = {
      size,
      chest: m.chest.trim(),
      length: m.length.trim(),
      sleeve: m.sleeve.trim(),
    };
    if (row.chest || row.length || row.sleeve) rows.push(row);
  }
  return rows.length > 0 ? rows : null;
}

function sameSizeGuide(a: SizeGuideRow[] | null, b: SizeGuideRow[] | null | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b && b.length > 0 ? b : null);
}

function emptyDraftSize(): DraftSize {
  return { localId: crypto.randomUUID(), size: '', price: '', stock: '0' };
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
    guide: {},
  };
}

/**
 * Editable metadata for a version that already exists in the database —
 * reuses DraftVersion's field shape (minus localId/isActive/sizes) since
 * the editable fields and their string-based form representation are
 * identical to a draft version's.
 */
type ExistingVersionEdit = Pick<
  DraftVersion,
  | 'versionName'
  | 'productType'
  | 'material'
  | 'fit'
  | 'color'
  | 'careInstructions'
  | 'isPreorder'
  | 'preorderDays'
> & {
  /** Size Guide measurements keyed by existing size id (or new-size localId). */
  guide: Record<string, SizeMeasurements>;
};

function existingVersionEditFrom(version: ProductVersion): ExistingVersionEdit {
  const guide: Record<string, SizeMeasurements> = {};
  for (const s of version.sizes) {
    const row = version.sizeGuide?.find((r) => r.size === s.size);
    if (row) guide[s.id] = { chest: row.chest, length: row.length, sleeve: row.sleeve };
  }
  return {
    guide,
    versionName: version.versionName,
    productType: version.productType,
    material: version.material ?? '',
    fit: version.fit ?? '',
    color: version.color ?? '',
    careInstructions: (version.careInstructions ?? []).join('\n'),
    isPreorder: version.isPreorder,
    preorderDays: version.preorderDays ? String(version.preorderDays) : '',
  };
}

/**
 * Editable SKU/price for a size that already exists in the database.
 * Deliberately excludes stock — stock keeps going through the separate
 * stockEdits/adjustStock() path above, never through this one or through
 * updateProductVersionSize() (whose input type already excludes stock at
 * the type level in products.ts).
 */
interface ExistingSizeEdit {
  sku: string;
  price: string;
}

function existingSizeEditFrom(size: ProductVersionSize): ExistingSizeEdit {
  return { sku: size.sku, price: String(size.price) };
}

/**
 * Whether an edit actually differs from the version as loaded — used to
 * skip calling updateProductVersion() for versions the admin didn't touch.
 * `images`, `isActive`, and `sortOrder` aren't part of this comparison
 * since Step 1 doesn't expose editing them; they're carried through
 * unchanged in existingVersionEditToInput() below regardless.
 */
function existingVersionEditChanged(version: ProductVersion, edit: ExistingVersionEdit): boolean {
  const nextCare = edit.careInstructions
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const currentCare = version.careInstructions ?? [];
  const careChanged =
    nextCare.length !== currentCare.length ||
    nextCare.some((line, i) => line !== currentCare[i]);
  const nextPreorderDays = edit.isPreorder ? Number(edit.preorderDays) : null;

  return (
    edit.versionName.trim() !== version.versionName ||
    edit.productType !== version.productType ||
    edit.material.trim() !== (version.material ?? '') ||
    edit.fit.trim() !== (version.fit ?? '') ||
    edit.color.trim() !== (version.color ?? '') ||
    careChanged ||
    edit.isPreorder !== version.isPreorder ||
    nextPreorderDays !== (version.preorderDays ?? null)
  );
}

/**
 * Builds the full ProductVersionInput updateProductVersion() expects.
 * updateProductVersion() overwrites every field it's given (it has no
 * partial-update mode), so images/isActive/sortOrder — none of which
 * Step 1 exposes for editing — are carried through from the version as
 * loaded rather than omitted, or they'd silently reset to their defaults
 * (images: null, isActive: true, sortOrder: 0).
 */
function existingVersionEditToInput(
  version: ProductVersion,
  edit: ExistingVersionEdit,
  sizeGuide: SizeGuideRow[] | null
): ProductVersionInput {
  return {
    versionName: edit.versionName.trim(),
    productType: edit.productType,
    material: edit.material.trim() || undefined,
    fit: edit.fit.trim() || undefined,
    color: edit.color.trim() || undefined,
    images: version.images,
    careInstructions: edit.careInstructions
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    isPreorder: edit.isPreorder,
    preorderDays: edit.isPreorder ? Number(edit.preorderDays) : null,
    isActive: version.isActive,
    sortOrder: version.sortOrder,
    sizeGuide,
  };
}

/**
 * Editable size/SKU/price/stock row for a size draft (a size not yet saved
 * to the database). Shared by DraftVersionCard (sizes for a brand-new
 * version) and ExistingVersionCard (new sizes being added to a version that
 * already exists) — the fields and validation shape are identical either
 * way, only what happens on submit differs.
 */
function SizeDraftRow({
  draft,
  productSlug,
  versionName,
  onChange,
  onRemove,
}: {
  draft: DraftSize;
  /** Current product slug — part of the auto-generated SKU. */
  productSlug: string;
  /** Current version name (live-edited value, not necessarily saved yet) — part of the auto-generated SKU. */
  versionName: string;
  onChange: (patch: Partial<DraftSize>) => void;
  onRemove: () => void;
}) {
  // Always derived, never typed — recomputes live as size/version/slug
  // change, so it can never go stale. The same generateSku() call is made
  // again at submit time in handleSubmit, using whatever was last shown here.
  const sku = generateSku(productSlug, versionName, draft.size);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:items-end">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-muted">Size</span>
        <input
          value={draft.size}
          onChange={(e) => onChange({ size: e.target.value.toUpperCase() })}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          placeholder="M"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-muted">SKU (auto)</span>
        <input
          value={sku}
          disabled
          readOnly
          title="Generated automatically from the product, version and size — not editable."
          className="cursor-not-allowed rounded-lg border border-dashed border-border bg-muted/30 px-2 py-1.5 text-sm text-muted-foreground outline-none"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-muted">Price (Rs.)</span>
        <input
          type="number"
          min="0"
          value={draft.price}
          onChange={(e) => onChange({ price: e.target.value })}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          placeholder="4500"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-muted">Stock</span>
        <input
          type="number"
          min="0"
          value={draft.stock}
          onChange={(e) => onChange({ stock: e.target.value })}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          placeholder="0"
        />
      </label>
      <button
        type="button"
        onClick={onRemove}
        className="justify-self-start rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-primary sm:justify-self-auto"
      >
        Remove
      </button>
    </div>
  );
}

/**
 * Size Guide editor. One row per size the version actually has — there is no
 * way to add a size here; sizes are managed in the size sections above/below.
 */
function SizeGuideEditor({
  sizes,
  guide,
  onChange,
}: {
  sizes: GuideSize[];
  guide: Record<string, SizeMeasurements>;
  onChange: (key: string, patch: Partial<SizeMeasurements>) => void;
}) {
  const fields = ['chest', 'length', 'sleeve'] as const;
  return (
    <div className="space-y-2">
      <span className={fieldLabelClass()}>Size Guide</span>
      {sizes.length === 0 ? (
        <p className="text-xs text-muted">Add sizes to this version to fill in its size guide.</p>
      ) : (
        <div className="grid grid-cols-[3rem_repeat(3,minmax(0,1fr))] items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-muted">Size</span>
          {fields.map((f) => (
            <span key={f} className="text-[10px] uppercase tracking-wide text-muted">
              {f}
            </span>
          ))}
          {sizes.map(({ key, size }) => (
            <div key={key} className="contents">
              <span className="text-sm font-medium text-foreground">{size}</span>
              {fields.map((f) => (
                <input
                  key={f}
                  value={guide[key]?.[f] ?? ''}
                  onChange={(e) => onChange(key, { [f]: e.target.value })}
                  aria-label={`${size} ${f}`}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                  placeholder={f === 'sleeve' ? '7½"' : '20"'}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Editable card for a version that already exists in the database.
 * Version metadata (name, type, material, fit, color, pre-order, care
 * instructions) is editable here and saved via updateProductVersion() on
 * submit. Existing sizes' SKU/price are editable via
 * updateProductVersionSize(); stock stays on the separate adjustStock()
 * path. New sizes can also be added to this version — they're created via
 * createProductVersionSize() on submit rather than updating an existing row.
 * Existing sizes can be deleted immediately (not deferred to submit) via
 * deleteProductVersionSize(), after a hasOrderHistory() check blocks
 * deletion of any size with existing order/inventory references.
 */
function ExistingVersionCard({
  version,
  edit,
  productSlug,
  onEditChange,
  stockEdits,
  onStockChange,
  sizeEdits,
  onSizeEditChange,
  newSizes,
  onAddNewSize,
  onRemoveNewSize,
  onNewSizeChange,
  deletedSizeIds,
  deletingSizeId,
  onDeleteSize,
  deletingVersionId,
  onDeleteVersion,
}: {
  version: ProductVersion;
  edit: ExistingVersionEdit;
  /** Current product slug — threaded down to new-size rows for the auto-generated SKU preview. */
  productSlug: string;
  onEditChange: (patch: Partial<ExistingVersionEdit>) => void;
  stockEdits: Record<string, string>;
  onStockChange: (sizeId: string, value: string) => void;
  sizeEdits: Record<string, ExistingSizeEdit>;
  onSizeEditChange: (sizeId: string, patch: Partial<ExistingSizeEdit>) => void;
  newSizes: DraftSize[];
  onAddNewSize: () => void;
  onRemoveNewSize: (sizeLocalId: string) => void;
  onNewSizeChange: (sizeLocalId: string, patch: Partial<DraftSize>) => void;
  deletedSizeIds: Set<string>;
  deletingSizeId: string | null;
  onDeleteSize: (size: ProductVersionSize) => void;
  deletingVersionId: string | null;
  onDeleteVersion: (version: ProductVersion) => void;
}) {
  const isDeletingVersion = deletingVersionId === version.id;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-muted">
          {version.versionName || 'Version'}
        </span>
        <div className="flex items-center gap-3">
          {!version.isActive && (
            <span className="text-[11px] uppercase tracking-wide text-muted">Inactive</span>
          )}
          <button
            type="button"
            onClick={() => onDeleteVersion(version)}
            disabled={isDeletingVersion}
            className="text-xs text-muted-foreground hover:text-primary disabled:opacity-50"
          >
            {isDeletingVersion ? 'Deleting...' : 'Delete Version'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Version Name</span>
          <input
            value={edit.versionName}
            onChange={(e) => onEditChange({ versionName: e.target.value })}
            className={inputClass()}
            placeholder="Jersey"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Apparel Type</span>
          <select
            value={edit.productType}
            onChange={(e) => onEditChange({ productType: e.target.value as ProductType })}
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
          <OptionSelect
            value={edit.material}
            options={MATERIAL_OPTIONS}
            placeholder="Select material"
            onChange={(value) => onEditChange({ material: value })}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Fit</span>
          <OptionSelect
            value={edit.fit}
            options={FIT_OPTIONS}
            placeholder="Select fit"
            onChange={(value) => onEditChange({ fit: value })}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Color</span>
          <OptionSelect
            value={edit.color}
            options={COLOR_OPTIONS}
            placeholder="Select color"
            onChange={(value) => onEditChange({ color: value })}
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={fieldLabelClass()}>Care Instructions (one per line)</span>
          <textarea
            value={edit.careInstructions}
            onChange={(e) => onEditChange({ careInstructions: e.target.value })}
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
            checked={edit.isPreorder}
            onChange={(e) => {
              const checked = e.target.checked;
              onEditChange({
                isPreorder: checked,
                preorderDays:
                  checked && (!edit.preorderDays || Number(edit.preorderDays) <= 0)
                    ? '14'
                    : edit.preorderDays,
              });
            }}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-sm text-foreground">Available for pre-order</span>
        </label>

        {edit.isPreorder && (
          <label className="flex flex-col gap-1.5 sm:w-48">
            <span className={fieldLabelClass()}>Pre-order delivery period (days)</span>
            <input
              type="number"
              min="1"
              value={edit.preorderDays}
              onChange={(e) => onEditChange({ preorderDays: e.target.value })}
              className={inputClass()}
              placeholder="14"
            />
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {version.sizes
          .filter((size) => !deletedSizeIds.has(size.id))
          .map((size) => {
            const sizeEdit = sizeEdits[size.id];
            const isDeleting = deletingSizeId === size.id;
            return (
              <div key={size.id} className="rounded-lg border border-border bg-background p-2">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted">{size.size}</p>
                  <button
                    type="button"
                    onClick={() => onDeleteSize(size)}
                    disabled={isDeleting}
                    className="text-[10px] text-muted-foreground hover:text-primary disabled:opacity-50"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
                <label className="mt-1 flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted">SKU</span>
                  <input
                    value={sizeEdit?.sku ?? size.sku}
                    onChange={(e) =>
                      onSizeEditChange(size.id, { sku: e.target.value.toUpperCase() })
                    }
                    className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
                  />
                </label>
                <label className="mt-1 flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted">
                    Price (Rs.)
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={sizeEdit?.price ?? String(size.price)}
                    onChange={(e) => onSizeEditChange(size.id, { price: e.target.value })}
                    className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
                  />
                </label>
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
            );
          })}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className={fieldLabelClass()}>Add Size</span>
          <button
            type="button"
            onClick={onAddNewSize}
            className="text-xs font-medium text-primary hover:underline"
          >
            + Add Size
          </button>
        </div>
        <div className="space-y-2">
          {newSizes.map((s) => (
            <SizeDraftRow
              key={s.localId}
              draft={s}
              productSlug={productSlug}
              versionName={edit.versionName}
              onChange={(patch) => onNewSizeChange(s.localId, patch)}
              onRemove={() => onRemoveNewSize(s.localId)}
            />
          ))}
        </div>
      </div>

      <SizeGuideEditor
        sizes={guideSizesForExisting(version, deletedSizeIds, newSizes)}
        guide={edit.guide}
        onChange={(key, patch) =>
          onEditChange({ guide: { ...edit.guide, [key]: { ...(edit.guide[key] ?? EMPTY_MEASUREMENTS), ...patch } } })
        }
      />
    </div>
  );
}

/** Editable card for a brand-new version being added in this session. */
function DraftVersionCard({
  version,
  index,
  productSlug,
  onChange,
  onRemove,
  onAddSize,
  onRemoveSize,
  onSizeChange,
  removable,
}: {
  version: DraftVersion;
  index: number;
  /** Current product slug — threaded down to size rows for the auto-generated SKU preview. */
  productSlug: string;
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
          <OptionSelect
            value={version.material}
            options={MATERIAL_OPTIONS}
            placeholder="Select material"
            onChange={(value) => onChange({ material: value })}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Fit</span>
          <OptionSelect
            value={version.fit}
            options={FIT_OPTIONS}
            placeholder="Select fit"
            onChange={(value) => onChange({ fit: value })}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Color</span>
          <OptionSelect
            value={version.color}
            options={COLOR_OPTIONS}
            placeholder="Select color"
            onChange={(value) => onChange({ color: value })}
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
            <SizeDraftRow
              key={s.localId}
              draft={s}
              productSlug={productSlug}
              versionName={version.versionName}
              onChange={(patch) => onSizeChange(s.localId, patch)}
              onRemove={() => onRemoveSize(s.localId)}
            />
          ))}
        </div>
      </div>

      <SizeGuideEditor
        sizes={guideSizesForDraft(version.sizes)}
        guide={version.guide}
        onChange={(key, patch) =>
          onChange({ guide: { ...version.guide, [key]: { ...(version.guide[key] ?? EMPTY_MEASUREMENTS), ...patch } } })
        }
      />
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

  // --- Existing versions (edit mode) — metadata is editable via
  // updateProductVersion(); stock stays on its separate adjustStock() path.
  const [versionEdits, setVersionEdits] = useState<Record<string, ExistingVersionEdit>>(() => {
    const map: Record<string, ExistingVersionEdit> = {};
    product?.versions.forEach((v) => {
      map[v.id] = existingVersionEditFrom(v);
    });
    return map;
  });

  const [stockEdits, setStockEdits] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    product?.versions.forEach((v) => v.sizes.forEach((s) => { map[s.id] = String(s.stock); }));
    return map;
  });

  // --- Existing sizes (edit mode) — SKU/price editable via
  // updateProductVersionSize(); stock stays on the stockEdits/adjustStock() path above.
  const [sizeEdits, setSizeEdits] = useState<Record<string, ExistingSizeEdit>>(() => {
    const map: Record<string, ExistingSizeEdit> = {};
    product?.versions.forEach((v) =>
      v.sizes.forEach((s) => {
        map[s.id] = existingSizeEditFrom(s);
      })
    );
    return map;
  });

  // --- New versions being added in this editing session ---
  const [draftVersions, setDraftVersions] = useState<DraftVersion[]>(
    mode === 'create' ? [emptyDraftVersion()] : []
  );

  // --- New sizes being added to an existing (already-saved) version, keyed
  // by that version's id. Each entry is created via createProductVersionSize()
  // on submit — never updateProductVersionSize(), since there's no existing
  // row to update.
  const [newExistingSizes, setNewExistingSizes] = useState<Record<string, DraftSize[]>>({});

  // --- Existing sizes deleted this session. Deletion happens immediately
  // (via deleteProductVersionSize()), not deferred to submit — this set is
  // purely a render-time overlay so a deleted size disappears from the UI
  // without needing to refetch/reload the product.
  const [deletedSizeIds, setDeletedSizeIds] = useState<Set<string>>(new Set());
  const [deletingSizeId, setDeletingSizeId] = useState<string | null>(null);

  // --- Existing versions deleted this session — same immediate-delete/
  // render-overlay pattern as deletedSizeIds above.
  const [deletedVersionIds, setDeletedVersionIds] = useState<Set<string>>(new Set());
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null);

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

  const addNewSizeToVersion = (versionId: string) => {
    setNewExistingSizes((prev) => ({
      ...prev,
      [versionId]: [...(prev[versionId] ?? []), emptyDraftSize()],
    }));
  };

  const removeNewSizeFromVersion = (versionId: string, sizeLocalId: string) => {
    setNewExistingSizes((prev) => ({
      ...prev,
      [versionId]: (prev[versionId] ?? []).filter((s) => s.localId !== sizeLocalId),
    }));
  };

  const updateNewSizeForVersion = (
    versionId: string,
    sizeLocalId: string,
    patch: Partial<DraftSize>
  ) => {
    setNewExistingSizes((prev) => ({
      ...prev,
      [versionId]: (prev[versionId] ?? []).map((s) =>
        s.localId === sizeLocalId ? { ...s, ...patch } : s
      ),
    }));
  };

  /**
   * Deletes an existing (already-saved) size, immediately — not deferred to
   * submit. Order/inventory history is checked via hasOrderHistory() first
   * so a blocked size is never even offered a confirmation dialog; the
   * deleteProductVersionSize() call itself still has its own FK-violation
   * error message as a fallback in case history is created between the
   * check and the delete.
   */
  const handleDeleteSize = async (size: ProductVersionSize, versionName: string) => {
    setError(null);
    setDeletingSizeId(size.id);
    try {
      const hasHistory = await hasOrderHistory(size.id);
      if (hasHistory) {
        setError(
          `Size "${size.size}" in "${versionName}" cannot be deleted because it has existing order or inventory history. Set its stock to 0 instead.`
        );
        return;
      }
      if (!window.confirm(`Delete size "${size.size}" from "${versionName}"? This cannot be undone.`)) {
        return;
      }
      await deleteProductVersionSize(size.id);
      setDeletedSizeIds((prev) => new Set(prev).add(size.id));
      setSizeEdits((prev) => {
        const { [size.id]: _removed, ...rest } = prev;
        return rest;
      });
      setStockEdits((prev) => {
        const { [size.id]: _removed, ...rest } = prev;
        return rest;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete size');
    } finally {
      setDeletingSizeId(null);
    }
  };

  /**
   * Deletes an existing (already-saved) version, immediately — not deferred
   * to submit. Every size on the version is checked for order/inventory
   * history first (deleteProductVersion() would cascade-delete sizes, so
   * this must be at least as strict as the per-size check); a version with
   * no sizes has nothing to check and is safe to delete once confirmed.
   */
  const handleDeleteVersion = async (version: ProductVersion) => {
    setError(null);
    setDeletingVersionId(version.id);
    try {
      const historyChecks = await Promise.all(version.sizes.map((s) => hasOrderHistory(s.id)));
      if (historyChecks.some(Boolean)) {
        setError(
          `Version "${version.versionName}" cannot be deleted because one or more of its sizes has existing order or inventory history. Deactivate it instead.`
        );
        return;
      }
      if (
        !window.confirm(
          `Delete version "${version.versionName}" and all of its sizes? This cannot be undone.`
        )
      ) {
        return;
      }
      await deleteProductVersion(version.id);

      setDeletedVersionIds((prev) => new Set(prev).add(version.id));

      const sizeIds = new Set(version.sizes.map((s) => s.id));
      setVersionEdits((prev) => {
        const { [version.id]: _removed, ...rest } = prev;
        return rest;
      });
      setNewExistingSizes((prev) => {
        const { [version.id]: _removed, ...rest } = prev;
        return rest;
      });
      setSizeEdits((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([id]) => !sizeIds.has(id)))
      );
      setStockEdits((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([id]) => !sizeIds.has(id)))
      );
      // These sizes no longer exist at all, so they don't need to keep
      // occupying the "deleted this session" overlay either.
      setDeletedSizeIds((prev) => {
        const next = new Set(prev);
        sizeIds.forEach((id) => next.delete(id));
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete version');
    } finally {
      setDeletingVersionId(null);
    }
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
      (v) => v.versionName.trim() || v.sizes.some((s) => s.size.trim() || s.price.trim())
    );

    if (mode === 'create' && versionsToCreate.length === 0) {
      return setError('Add at least one product version.');
    }

    for (const v of versionsToCreate) {
      if (!v.versionName.trim()) {
        return setError('Each version needs a name (e.g. "Jersey", "Oversized — Black").');
      }
      const validSizes = v.sizes.filter((s) => s.size.trim() || s.price.trim());
      if (validSizes.length === 0) {
        return setError(`Add at least one size for "${v.versionName.trim()}".`);
      }
      for (const s of validSizes) {
        if (!s.size.trim()) {
          return setError(`Enter a size label for "${v.versionName.trim()}".`);
        }
        // SKU is auto-generated from product/version/size — no manual-entry
        // check needed here; see generateSku() in src/data/products.ts.
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

    if (mode === 'edit' && product) {
      for (const v of product.versions) {
        const edit = versionEdits[v.id];
        if (!edit) continue;
        if (!edit.versionName.trim()) {
          return setError('Each existing version needs a name.');
        }
        if (edit.isPreorder) {
          const days = Number(edit.preorderDays);
          if (!days || days <= 0) {
            return setError(
              `Enter a valid pre-order delivery period for "${edit.versionName.trim()}".`
            );
          }
        }
      }
    }

    // Existing sizes whose SKU or price the admin actually changed this
    // session — only these trigger validation/updateProductVersionSize()
    // calls below; sizes with no edit, or whose edit matches the loaded
    // data exactly, are left untouched.
    const changedExistingSizes: Array<{
      id: string;
      versionName: string;
      size: string;
      sku: string;
      price: number;
      skuChanged: boolean;
    }> = [];
    if (mode === 'edit' && product) {
      for (const v of product.versions) {
        for (const s of v.sizes) {
          const sizeEdit = sizeEdits[s.id];
          if (!sizeEdit) continue;
          const trimmedSku = sizeEdit.sku.trim();
          const priceValue = Number(sizeEdit.price);
          const skuChanged = trimmedSku !== s.sku;
          const priceChanged = Number.isFinite(priceValue) && priceValue !== s.price;
          if (!skuChanged && !priceChanged) continue;
          if (!trimmedSku) {
            return setError(`Enter a SKU for size "${s.size}" in "${v.versionName}".`);
          }
          if (!Number.isFinite(priceValue) || priceValue < 0) {
            return setError(`Enter a valid price for size "${s.size}" in "${v.versionName}".`);
          }
          changedExistingSizes.push({
            id: s.id,
            versionName: v.versionName,
            size: s.size,
            sku: trimmedSku,
            price: priceValue,
            skuChanged,
          });
        }
      }
    }

    // New sizes being added to an existing (already-saved) version this
    // session — each becomes a createProductVersionSize() call on submit,
    // never updateProductVersionSize(), since there's no existing row.
    const newExistingSizesFlat: Array<{
      versionId: string;
      versionName: string;
      size: string;
      sku: string;
      price: number;
      stock: number;
    }> = [];
    if (mode === 'edit' && product) {
      for (const v of product.versions) {
        const drafts = (newExistingSizes[v.id] ?? []).filter(
          (s) => s.size.trim() || s.price.trim()
        );
        const sizeLabels = v.sizes
          .filter((sz) => !deletedSizeIds.has(sz.id))
          .map((sz) => sz.size);
        // This version's name as it will actually be saved this submit —
        // the live edit if the admin renamed it this session, else its
        // current saved name — so the generated SKU always matches.
        const effectiveVersionName = (versionEdits[v.id]?.versionName ?? v.versionName).trim();
        for (const s of drafts) {
          const size = s.size.trim().toUpperCase();
          if (!size) {
            return setError(`Enter a size label for the new size in "${v.versionName}".`);
          }
          // SKU is auto-generated from product/version/size — no manual-entry
          // check needed here; see generateSku() in src/data/products.ts.
          const priceValue = Number(s.price);
          if (!priceValue || priceValue <= 0) {
            return setError(
              `Enter a valid price for the new size "${size}" in "${v.versionName}".`
            );
          }
          const stockValue = s.stock.trim() ? Number(s.stock) : 0;
          if (!Number.isFinite(stockValue) || stockValue < 0) {
            return setError(
              `Enter a valid stock quantity for the new size "${size}" in "${v.versionName}".`
            );
          }
          if (sizeLabels.includes(size)) {
            return setError(`Size "${size}" already exists on "${v.versionName}".`);
          }
          sizeLabels.push(size);
          newExistingSizesFlat.push({
            versionId: v.id,
            versionName: v.versionName,
            size,
            sku: generateSku(slug.trim(), effectiveVersionName, size),
            price: priceValue,
            stock: stockValue,
          });
        }
      }
    }

    const newSkus = versionsToCreate.flatMap((v) =>
      v.sizes
        .filter((s) => s.size.trim())
        .map((s) => generateSku(slug.trim(), v.versionName.trim(), s.size.trim().toUpperCase()))
    );
    const allNewSkus = [...newSkus, ...newExistingSizesFlat.map((s) => s.sku)];
    const allSubmittedSkus = [...allNewSkus, ...changedExistingSizes.map((s) => s.sku)];
    if (new Set(allSubmittedSkus).size !== allSubmittedSkus.length) {
      return setError('Duplicate SKU entered — each size needs a unique SKU.');
    }

    setSubmitting(true);
    try {
      const excludeId = mode === 'edit' ? product?.id : undefined;
      // Only query isSkuTaken for existing sizes whose SKU actually
      // changed — an unchanged SKU can't have become newly "taken" by
      // itself, so there's nothing to check.
      const skuChecksNeeded = changedExistingSizes.filter((s) => s.skuChanged);
      const [slugAlreadyTaken, skuConflicts, existingSkuConflicts] = await Promise.all([
        isSlugTaken(slug.trim(), excludeId),
        Promise.all(allNewSkus.map((sku) => isSkuTaken(sku))),
        Promise.all(skuChecksNeeded.map((s) => isSkuTaken(s.sku, s.id))),
      ]);
      if (slugAlreadyTaken) {
        setError('This slug is already in use by another product.');
        setSubmitting(false);
        return;
      }
      if (skuConflicts.some(Boolean) || existingSkuConflicts.some(Boolean)) {
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
      // The UI still collects an absolute target ("set stock to X"), but the
      // mutation itself now goes through adjustStock() as a delta — this
      // locks the row, clamps at 0 server-side, and records an
      // inventory_movements entry, instead of the old unconditional
      // overwrite via updateProductStock(). The comparison base is still
      // whatever was loaded when the form opened (see note above
      // handleSubmit's stock loop) — adjustStock's row lock protects the
      // eventual write, not this stale read.
      if (mode === 'edit' && product) {
        for (const version of product.versions) {
          for (const size of version.sizes) {
            const edited = stockEdits[size.id];
            if (edited == null) continue;
            const parsed = Number(edited);
            if (!Number.isFinite(parsed)) continue;
            const nextStock = Math.max(0, parsed);
            const quantityChange = nextStock - size.stock;
            if (quantityChange === 0) continue;
            await adjustStock(
              size.id,
              quantityChange,
              'correction',
              `Stock corrected via product editor (${size.stock} → ${nextStock})`
            );
          }
        }
      }

      // Persist metadata edits made to existing versions (edit mode only).
      // Only versions whose edit actually differs from the loaded data
      // trigger a call, so untouched versions never hit the database.
      if (mode === 'edit' && product) {
        for (const version of product.versions) {
          const edit = versionEdits[version.id];
          if (!edit) continue;
          // Rebuilt from the sizes that still exist, so rows for sizes deleted
          // this session (or already gone) are dropped rather than kept stale.
          const sizeGuide = buildSizeGuide(
            guideSizesForExisting(version, deletedSizeIds, newExistingSizes[version.id] ?? []),
            edit.guide
          );
          if (
            existingVersionEditChanged(version, edit) ||
            !sameSizeGuide(sizeGuide, version.sizeGuide)
          ) {
            await updateProductVersion(
              version.id,
              existingVersionEditToInput(version, edit, sizeGuide)
            );
          }
        }
      }

      // Persist SKU/price edits made to existing sizes (edit mode only).
      // Stock is intentionally excluded — it was already handled above via
      // adjustStock(), and updateProductVersionSize()'s input type omits
      // stock entirely so it can't be touched from this call.
      for (const s of changedExistingSizes) {
        await updateProductVersionSize(s.id, { size: s.size, sku: s.sku, price: s.price });
      }

      // Create new sizes added to an existing version this session. These
      // are brand-new rows (never seen by the database before), so they
      // always go through createProductVersionSize(), never an update.
      for (const s of newExistingSizesFlat) {
        await createProductVersionSize(s.versionId, {
          size: s.size,
          sku: s.sku,
          price: s.price,
          stock: s.stock,
        });
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
          sizeGuide: buildSizeGuide(guideSizesForDraft(v.sizes), v.guide),
        };
        const newVersion = await createProductVersion(savedProduct.id, versionInput);

        for (const s of v.sizes.filter((size) => size.size.trim())) {
          const size = s.size.trim().toUpperCase();
          await createProductVersionSize(newVersion.id, {
            size,
            sku: generateSku(slug.trim(), v.versionName.trim(), size),
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

  const visibleVersions = product?.versions.filter((v) => !deletedVersionIds.has(v.id)) ?? [];

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
      {mode === 'edit' && product && visibleVersions.length > 0 && (
        <div className="space-y-4 border-t border-border pt-6">
          <span className={fieldLabelClass()}>Existing Versions</span>
          <div className="space-y-3">
            {visibleVersions.map((v) => (
              <ExistingVersionCard
                key={v.id}
                version={v}
                edit={versionEdits[v.id]}
                productSlug={slug.trim()}
                onEditChange={(patch) =>
                  setVersionEdits((prev) => ({
                    ...prev,
                    [v.id]: { ...prev[v.id], ...patch },
                  }))
                }
                stockEdits={stockEdits}
                onStockChange={(sizeId, value) =>
                  setStockEdits((prev) => ({ ...prev, [sizeId]: value }))
                }
                sizeEdits={sizeEdits}
                onSizeEditChange={(sizeId, patch) =>
                  setSizeEdits((prev) => ({
                    ...prev,
                    [sizeId]: { ...prev[sizeId], ...patch },
                  }))
                }
                newSizes={newExistingSizes[v.id] ?? []}
                onAddNewSize={() => addNewSizeToVersion(v.id)}
                onRemoveNewSize={(sizeLocalId) => removeNewSizeFromVersion(v.id, sizeLocalId)}
                onNewSizeChange={(sizeLocalId, patch) =>
                  updateNewSizeForVersion(v.id, sizeLocalId, patch)
                }
                deletedSizeIds={deletedSizeIds}
                deletingSizeId={deletingSizeId}
                onDeleteSize={(size) => handleDeleteSize(size, v.versionName)}
                deletingVersionId={deletingVersionId}
                onDeleteVersion={handleDeleteVersion}
              />
            ))}
          </div>
          <p className="text-xs text-muted">
            Use "Add Size" above to add a new size, or "Delete" on a size to remove it. Sizes with
            existing order or inventory history can't be deleted — set their stock to 0 instead.
            "Delete Version" removes a whole version and its sizes, but only when none of its
            sizes has order or inventory history — deactivate it instead if it does. Existing
            sizes can't be renamed here — add a new version below for a different apparel
            offering.
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
              productSlug={slug.trim()}
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
