import { useRef, useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { uploadCollectionCoverImage, deleteCollectionCoverImage } from '../../data/collections';

interface CollectionCoverUploadProps {
  /** Used to build a readable storage path (typically the collection's slug). */
  slugHint: string;
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

/**
 * Single-image cover upload for collections. Deliberately much simpler than
 * ImageManager.tsx (no multi-image list, reorder, or "primary" concept —
 * collections have exactly one cover image).
 */
export default function CollectionCoverUpload({
  slugHint,
  value,
  onChange,
  disabled,
}: CollectionCoverUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setError(null);
    setUploading(true);

    const previousUrl = value;

    try {
      // Upload the replacement first — the old image is only touched after
      // this succeeds, so a failed upload never leaves the form pointing at
      // an image that doesn't exist.
      const newUrl = await uploadCollectionCoverImage(slugHint, file);
      onChange(newUrl);

      if (previousUrl) {
        // Best-effort cleanup. The new image is already saved and usable at
        // this point, so a failure here shouldn't be treated as blocking —
        // it just leaves the old file orphaned in storage.
        deleteCollectionCoverImage(previousUrl).catch((err) => {
          console.error('Failed to delete previous cover image:', err);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!value) return;
    const url = value;
    setError(null);
    onChange(null);
    try {
      await deleteCollectionCoverImage(url);
    } catch (err) {
      // Field is already cleared for the admin; an orphaned storage file
      // isn't worth surfacing as a blocking error.
      console.error('Failed to delete cover image:', err);
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-xs uppercase tracking-wide text-muted">Cover Image</label>

      {value ? (
        <div className="group relative w-full max-w-xs overflow-hidden rounded-xl border border-border bg-background">
          <img src={value} alt="Collection cover" className="aspect-[3/4] w-full object-cover" />

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-background/80 p-2 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
            <button
              type="button"
              onClick={() => !disabled && !uploading && inputRef.current?.click()}
              disabled={disabled || uploading}
              className="rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled || uploading}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-red-400 disabled:opacity-50"
              aria-label="Remove cover image"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            </div>
          )}
        </div>
      ) : (
        <div
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (!disabled) handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`flex w-full max-w-xs cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors duration-200 ${
            dragActive
              ? 'border-primary bg-primary/5'
              : 'border-border bg-surface hover:border-foreground/30'
          } ${disabled || uploading ? 'pointer-events-none opacity-50' : ''}`}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          ) : (
            <Upload className="h-6 w-6 text-muted" />
          )}
          <p className="text-sm text-muted-foreground">
            {uploading ? 'Uploading...' : 'Drag & drop an image here, or click to browse'}
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {error && <p className="text-xs text-primary">{error}</p>}
    </div>
  );
}
