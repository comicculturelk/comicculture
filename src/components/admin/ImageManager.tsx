import { useEffect, useRef, useState } from 'react';
import { Upload, X, Star, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { uploadProductImage, deleteProductImage } from '../../data/products';
import { formatImageBytes, optimizeExistingImage } from '../../lib/optimizeImage';

interface ImageManagerProps {
  /** Used as the Storage folder key for uploads. */
  slug: string;
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Drag-and-drop + click-to-upload image manager with preview, reorder,
 * primary selection, and remove. Backed by Supabase Storage via
 * `uploadProductImage`/`deleteProductImage` in data/products.ts.
 */
export default function ImageManager({ slug, images, onChange, disabled, onBusyChange }: ImageManagerProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [optimizingIndex, setOptimizingIndex] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { onBusyChange?.(uploading || optimizingIndex !== null); }, [uploading, optimizingIndex, onBusyChange]);

  const handleFiles = async (files: FileList | null) => {
    if (disabled || uploading || optimizingIndex !== null || !files || files.length === 0) return;
    if (!slug.trim()) {
      setError('Enter a product name first, so images have somewhere to be filed.');
      return;
    }
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const uploaded: string[] = [];
      try {
        for (const file of Array.from(files)) {
          const url = await uploadProductImage(slug, file);
          uploaded.push(url);
        }
      } catch (err) {
        // These URLs have not been attached to a saved product yet, so
        // rolling back this incomplete batch cannot break existing records.
        await Promise.allSettled(uploaded.map((url) => deleteProductImage(url)));
        throw err;
      }
      onChange([...images, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleOptimizeExisting = async (index: number, url: string) => {
    setOptimizingIndex(index);
    setError(null);
    setNotice(null);
    try {
      const result = await optimizeExistingImage(url);
      if (!result) {
        setNotice(`Image ${index + 1} is already optimized or uses a format we keep unchanged.`);
        return;
      }

      const optimizedUrl = await uploadProductImage(slug, result.file);
      const nextImages = [...images];
      nextImages[index] = optimizedUrl;
      onChange(nextImages);
      setNotice(`Image ${index + 1} is ${formatImageBytes(result.savedBytes)} smaller. Save the product to apply it.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not optimize this image');
    } finally {
      setOptimizingIndex(null);
    }
  };

  const handleRemove = async (index: number) => {
    setError(null);
    // Removal is staged in the form. The file must stay available until
    // the admin saves the new product image list.
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
      <p className="-mt-2 text-xs text-muted-foreground">
        JPEG and PNG photos are resized to 1600px and compressed to WebP before upload. GIF and SVG files stay unchanged.
      </p>
      <p className="-mt-3 text-xs text-muted-foreground">
        For an existing image, use Optimize on only the large files. It downloads that image once; save the product to switch to the optimized copy. The original file is kept.
      </p>

      {/* Drop zone */}
      <div
        onClick={() => !disabled && !uploading && optimizingIndex === null && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (!disabled && !uploading && optimizingIndex === null) handleFiles(e.dataTransfer.files);
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
      {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}

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

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-background/90 p-1 backdrop-blur-sm opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => void handleOptimizeExisting(index, url)}
                  disabled={disabled || uploading || optimizingIndex !== null}
                  className="rounded px-1.5 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                  aria-label={`Optimize image ${index + 1}`}
                >
                  {optimizingIndex === index ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Optimize'}
                </button>
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
