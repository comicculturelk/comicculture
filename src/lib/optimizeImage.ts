const MAX_IMAGE_EDGE = 1600;
const WEBP_QUALITY = 0.84;
const WEBP_COMPRESSIBLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/bmp']);

/**
 * Shrinks large JPEG/PNG/BMP uploads before they reach Storage. Animated and
 * vector formats are kept intact, and an original is kept if WebP is larger.
 */
export async function optimizeImageForStorage(file: File): Promise<File> {
  if (!WEBP_COMPRESSIBLE_TYPES.has(file.type) || typeof createImageBitmap === 'undefined') {
    return file;
  }

  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY);
    });

    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${baseName}.webp`, {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } catch {
    // Do not block product or collection editing if a browser cannot decode a
    // particular image. The original will still upload with its real extension.
    return file;
  } finally {
    bitmap?.close();
  }
}

/** Downloads and prepares one existing public image when an admin requests it. */
export async function optimizeExistingImage(url: string): Promise<{ file: File; savedBytes: number } | null> {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`Could not download image (${response.status}).`);

  const blob = await response.blob();
  const pathname = new URL(url).pathname;
  const fileName = decodeURIComponent(pathname.slice(pathname.lastIndexOf('/') + 1)) || 'image';
  const file = new File([blob], fileName, { type: blob.type, lastModified: Date.now() });
  const optimized = await optimizeImageForStorage(file);

  if (optimized === file || optimized.size >= file.size) return null;
  return { file: optimized, savedBytes: file.size - optimized.size };
}

export function formatImageBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
