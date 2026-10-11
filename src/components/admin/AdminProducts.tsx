import { useEffect, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import {
  fetchProducts,
  deleteProduct,
  duplicateProduct,
  type Product,
} from '../../data/products';
import { fetchCollections, type Collection } from '../../data/collections';
import ProductForm from './ProductForm';
import ProductListItem from './ProductListItem';

type View = 'list' | 'create' | 'edit';

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [view, setView] = useState<View>('list');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadProducts = () => {
    setLoading(true);
    setError(null);
    Promise.all([fetchProducts(), fetchCollections()])
      .then(([nextProducts, nextCollections]) => {
        setProducts(nextProducts);
        setCollections(nextCollections);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load products and collections'))
      .finally(() => setLoading(false));
  };

  useEffect(loadProducts, []);

  const flashSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleCreate = () => {
    setEditingProduct(null);
    setView('create');
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setView('edit');
  };

  const handleSaved = (product: Product) => {
    setView('list');
    setEditingProduct(null);
    flashSuccess(view === 'create' ? `"${product.name}" created.` : `"${product.name}" updated.`);
    loadProducts();
  };

  const handleCancel = () => {
    setView('list');
    setEditingProduct(null);
  };

  const handleDuplicate = async (product: Product) => {
    setDuplicatingId(product.id);
    setError(null);
    try {
      const copy = await duplicateProduct(product);
      flashSuccess(`"${copy.name}" created from duplicate.`);
      loadProducts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to duplicate product');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async (product: Product) => {
    setDeletingId(product.id);
    setError(null);
    try {
      await deleteProduct(product);
      flashSuccess(`"${product.name}" deleted.`);
      loadProducts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete product');
    } finally {
      setDeletingId(null);
    }
  };

  const collectionIds = new Set(collections.map((collection) => collection.id));
  const collectionsByName = new Map<string, string[]>();
  collections.forEach((collection) => {
    const key = collection.name.trim().toLocaleLowerCase();
    collectionsByName.set(key, [...(collectionsByName.get(key) ?? []), collection.id]);
  });
  const productsByCollection = new Map<string, Product[]>();
  const unassignedProducts: Product[] = [];
  products.forEach((product) => {
    const matchingNames = collectionsByName.get(product.collection.trim().toLocaleLowerCase()) ?? [];
    const collectionId = product.collectionId && collectionIds.has(product.collectionId)
      ? product.collectionId
      : matchingNames.length === 1
        ? matchingNames[0]
        : null;
    if (!collectionId) {
      unassignedProducts.push(product);
      return;
    }
    productsByCollection.set(collectionId, [...(productsByCollection.get(collectionId) ?? []), product]);
  });

  const toggleCollection = (collectionId: string) => {
    setExpandedCollections((current) => {
      const next = new Set(current);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
  };

  const renderProducts = (items: Product[]) => (
    <div className="space-y-3">
      {items.map((product) => (
        <ProductListItem
          key={product.id}
          product={product}
          onEdit={() => handleEdit(product)}
          onDuplicate={() => handleDuplicate(product)}
          onDelete={() => handleDelete(product)}
          duplicating={duplicatingId === product.id}
          deleting={deletingId === product.id}
        />
      ))}
    </div>
  );

  if (view === 'create' || view === 'edit') {
    return (
      <ProductForm
        mode={view}
        product={editingProduct ?? undefined}
        onSaved={handleSaved}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-foreground tracking-wide">Products</h2>
        <button
          type="button"
          onClick={handleCreate}
          className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </button>
      </div>

      {successMessage && (
        <p className="rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-2 text-sm text-green-400">
          {successMessage}
        </p>
      )}
      {error && <p className="text-sm text-primary">{error}</p>}
      {loading && <p className="text-muted-foreground">Loading products...</p>}

      {!loading && products.length === 0 && collections.length === 0 && (
        <p className="text-muted">No products yet. Add your first one to get started.</p>
      )}

      {!loading && (collections.length > 0 || products.length > 0) && (
        <div className="space-y-5">
          {collections.map((collection) => {
            const collectionProducts = productsByCollection.get(collection.id) ?? [];
            const expanded = expandedCollections.has(collection.id);
            const panelId = `admin-products-${collection.id}`;
            return (
              <section key={collection.id} className="admin-collection-group">
                <button
                  type="button"
                  className="admin-collection-toggle"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => toggleCollection(collection.id)}
                >
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block font-display text-lg tracking-wide">{collection.name}</span>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {collectionProducts.length} product{collectionProducts.length === 1 ? '' : 's'}
                    </span>
                  </span>
                  <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {expanded && (
                  <div id={panelId} className="admin-collection-content">
                    {collectionProducts.length > 0
                      ? renderProducts(collectionProducts)
                      : <p className="text-sm text-muted-foreground">No products in this collection yet.</p>}
                  </div>
                )}
              </section>
            );
          })}

          {unassignedProducts.length > 0 && (
            <section className="admin-collection-group">
              <button
                type="button"
                className="admin-collection-toggle"
                aria-expanded={expandedCollections.has('unassigned')}
                aria-controls="admin-products-unassigned"
                onClick={() => toggleCollection('unassigned')}
              >
                <span className="min-w-0 flex-1 text-left">
                  <span className="block font-display text-lg tracking-wide">Unassigned / legacy</span>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {unassignedProducts.length} product{unassignedProducts.length === 1 ? '' : 's'}
                  </span>
                </span>
                <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${expandedCollections.has('unassigned') ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {expandedCollections.has('unassigned') && (
                <div id="admin-products-unassigned" className="admin-collection-content">
                  {renderProducts(unassignedProducts)}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
