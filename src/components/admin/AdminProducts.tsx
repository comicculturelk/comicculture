import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  fetchProducts,
  deleteProduct,
  duplicateProduct,
  type Product,
} from '../../data/products';
import ProductForm from './ProductForm';
import ProductListItem from './ProductListItem';

type View = 'list' | 'create' | 'edit';

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [view, setView] = useState<View>('list');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadProducts = () => {
    setLoading(true);
    fetchProducts()
      .then(setProducts)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load products'))
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

      {!loading && products.length === 0 && (
        <p className="text-muted">No products yet. Add your first one to get started.</p>
      )}

      <div className="space-y-3">
        {products.map((product) => (
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
    </div>
  );
}
