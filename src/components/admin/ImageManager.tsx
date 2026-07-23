import { useRef, useState } from 'react';
import { Upload, X, Star, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { uploadProductImage, deleteProductImage } from '../../data/products';

interface ImageManagerProps {
  /** Used as the Storage folder key for uploads. */
  slug: string;
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
}

/**
 * Drag-and-drop + click-to-upload image manager with preview, reorder,
 * primary selection, and remove. Backed by Supabase Storage via
 * `uploadProductImage`/`deleteProductImage` in data/products.ts.
 */
export default function ImageManager({ slug, images, onChange, disabled }: ImageManagerProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!slug.trim()) {
      setError('Enter a product name first, so images have somewhere to be filed.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadProductImage(slug, file);
        uploaded.push(url);
      }
      onChange([...images, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async (index: number) => {
    const url = images[index];
    setError(null);
    try {
      await deleteProductImage(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete image');
      return;
    }
    onChange(images.filter((_, i) => i !== index));
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const handleSetPrimary = (index: number) => {
    if (index === 0) return;
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.unshift(item);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <label className="text-xs uppercase tracking-wide text-muted">Product Images</label>

      {/* Drop zone */}
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors duration-200 ${
          dragActive
            ? 'border-primary bg-primary/5'
            : 'border-border bg-surface hover:border-foreground/30'
        } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        ) : (
          <Upload className="h-6 w-6 text-muted" />
        )}
        <p className="text-sm text-muted-foreground">
          {uploading ? 'Uploading...' : 'Drag & drop images here, or click to browse'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && <p className="text-xs text-primary">{error}</p>}

      {/* Previews */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((url, index) => (
            <div
              key={url}
              className="group relative overflow-hidden rounded-xl border border-border bg-background"
            >
              <img
                src={url}
                alt={`Product image ${index + 1}`}
                className="aspect-square w-full object-cover"
              />

              {index === 0 && (
                <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  <Star className="h-2.5 w-2.5" />
                  Primary
                </span>
              )}

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-background/80 p-1 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  aria-label="Move left"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {index !== 0 && (
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(index)}
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-primary"
                    aria-label="Set as primary"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleMove(index, 1)}
                  disabled={index === images.length - 1}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  aria-label="Move right"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-red-400"
                  aria-label="Remove image"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
