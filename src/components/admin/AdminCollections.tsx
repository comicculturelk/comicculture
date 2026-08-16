import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Pencil } from 'lucide-react';
import {
  fetchCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  isCollectionSlugTaken,
  type Collection,
  type CollectionInput,
  type CollectionStatus,
} from '../../data/collections';
import { slugify } from '../../lib/slug';
import ConfirmAction from './ConfirmAction';

type View = 'list' | 'create' | 'edit';

function fieldLabelClass() {
  return 'text-xs uppercase tracking-wide text-muted';
}

function inputClass() {
  return 'w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary';
}

export default function AdminCollections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [view, setView] = useState<View>('list');
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadCollections = () => {
    setLoading(true);
    fetchCollections()
      .then(setCollections)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load collections'))
      .finally(() => setLoading(false));
  };

  useEffect(loadCollections, []);

  const flashSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleCreate = () => {
    setEditingCollection(null);
    setView('create');
  };

  const handleEdit = (collection: Collection) => {
    setEditingCollection(collection);
    setView('edit');
  };

  const handleSaved = (collection: Collection) => {
    setView('list');
    setEditingCollection(null);
    flashSuccess(
      view === 'create' ? `"${collection.name}" created.` : `"${collection.name}" updated.`
    );
    loadCollections();
  };

  const handleCancel = () => {
    setView('list');
    setEditingCollection(null);
  };

  const handleDelete = async (collection: Collection) => {
    setDeletingId(collection.id);
    setError(null);
    try {
      await deleteCollection(collection.id);
      flashSuccess(`"${collection.name}" deleted.`);
      loadCollections();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete collection');
    } finally {
      setDeletingId(null);
    }
  };

  if (view === 'create' || view === 'edit') {
    return (
      <CollectionForm
        mode={view}
        collection={editingCollection ?? undefined}
        onSaved={handleSaved}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-foreground tracking-wide">Collections</h2>
        <button
          type="button"
          onClick={handleCreate}
          className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Plus className="h-4 w-4" />
          Add Collection
        </button>
      </div>

      {successMessage && (
        <p className="rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-2 text-sm text-green-400">
          {successMessage}
        </p>
      )}
      {error && <p className="text-sm text-primary">{error}</p>}
      {loading && <p className="text-muted-foreground">Loading collections...</p>}

      {!loading && collections.length === 0 && (
        <p className="text-muted">No collections yet. Add your first one to get started.</p>
      )}

      <div className="space-y-3">
        {collections.map((collection) => (
          <div
            key={collection.id}
            className="glass flex flex-wrap items-center gap-4 rounded-2xl p-4"
          >
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-background">
              {collection.coverImage && (
                <img
                  src={collection.coverImage}
                  alt={collection.name}
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            <div className="min-w-[160px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-base text-foreground tracking-wide">
                  {collection.name}
                </p>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    collection.status === 'live'
                      ? 'border-green-500/40 bg-green-500/20 text-green-400'
                      : 'border-yellow-500/40 bg-yellow-500/20 text-yellow-400'
                  }`}
                >
                  {collection.status}
                </span>
              </div>
              <p className="text-xs uppercase tracking-wide text-muted">/{collection.slug}</p>
            </div>

            <p className="text-xs text-muted-foreground">Sort order: {collection.sortOrder}</p>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleEdit(collection)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <ConfirmAction
                label="Delete"
                onConfirm={() => handleDelete(collection)}
                disabled={deletingId === collection.id}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface CollectionFormProps {
  mode: 'create' | 'edit';
  collection?: Collection;
  onSaved: (collection: Collection) => void;
  onCancel: () => void;
}

function CollectionForm({ mode, collection, onSaved, onCancel }: CollectionFormProps) {
  const [name, setName] = useState(collection?.name ?? '');
  const [slug, setSlug] = useState(collection?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  const [tagline, setTagline] = useState(collection?.tagline ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');
  const [coverImage, setCoverImage] = useState(collection?.coverImage ?? '');
  const [status, setStatus] = useState<CollectionStatus>(collection?.status ?? 'live');
  const [sortOrder, setSortOrder] = useState(
    collection ? String(collection.sortOrder) : '0'
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError('Name is required.');
    if (!slug.trim()) return setError('Slug is required.');
    const sortOrderValue = Number(sortOrder);
    if (Number.isNaN(sortOrderValue)) return setError('Enter a valid sort order.');

    setSubmitting(true);
    try {
      const excludeId = mode === 'edit' ? collection?.id : undefined;
      const slugAlreadyTaken = await isCollectionSlugTaken(slug.trim(), excludeId);
      if (slugAlreadyTaken) {
        setError('This slug is already in use by another collection.');
        setSubmitting(false);
        return;
      }

      const input: CollectionInput = {
        name: name.trim(),
        slug: slug.trim(),
        tagline: tagline.trim() || null,
        description: description.trim() || null,
        coverImage: coverImage.trim() || null,
        status,
        sortOrder: sortOrderValue,
      };

      const saved =
        mode === 'create'
          ? await createCollection(input)
          : await updateCollection(collection!.id, input);

      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save collection');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass space-y-6 rounded-2xl p-6">
      <h2 className="font-display text-xl tracking-wide text-foreground">
        {mode === 'create' ? 'New Collection' : 'Edit Collection'}
      </h2>

      {error && <p className="text-sm text-primary">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Name</span>
          <input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className={inputClass()}
            placeholder="Web-Slinger Saga"
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
            placeholder="web-slinger-saga"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CollectionStatus)}
            className={inputClass()}
          >
            <option value="live">Live</option>
            <option value="soon">Coming soon</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass()}>Sort Order</span>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className={inputClass()}
            placeholder="0"
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={fieldLabelClass()}>Tagline</span>
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            className={inputClass()}
            placeholder="Short one-line hook shown on the collection page"
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
          <span className={fieldLabelClass()}>Cover Image URL</span>
          <input
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            className={inputClass()}
            placeholder="https://..."
          />
        </label>
      </div>

      <div className="flex items-center gap-3 border-t border-border pt-6">
        <button type="submit" disabled={submitting} className="btn-primary px-6 py-2.5 text-sm">
          {submitting ? 'Saving...' : mode === 'create' ? 'Create Collection' : 'Save Changes'}
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
