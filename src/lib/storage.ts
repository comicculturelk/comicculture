import { supabase } from './supabase';

export interface PublicUploadResult {
  path: string;
  publicUrl: string;
}

export interface PrivateUploadResult {
  path: string;
}

export type UploadResult = PublicUploadResult | PrivateUploadResult;

/**
 * Uploads a file to a Supabase Storage bucket.
 * Generic by design — reusable by any feature that needs file storage
 * (product images, homepage banners, payment receipts, etc.), not just
 * products.
 *
 * `visibility` controls what's returned, and must match how the bucket is
 * actually configured in Supabase:
 * - 'public' (default): the bucket has a public read policy (e.g.
 *   `product-images`). Returns `{ path, publicUrl }`.
 * - 'private': the bucket has NO public read policy (e.g.
 *   `payment-receipts`, which can contain sensitive customer payment info).
 *   Returns only `{ path }` — never a public URL, since one wouldn't
 *   actually be readable. Use `getSignedUrl()` when a viewable URL is
 *   needed later (e.g. an admin reviewing a receipt).
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File,
  visibility: 'public'
): Promise<PublicUploadResult>;
export async function uploadFile(
  bucket: string,
  path: string,
  file: File,
  visibility: 'private'
): Promise<PrivateUploadResult>;
export async function uploadFile(
  bucket: string,
  path: string,
  file: File,
  visibility?: 'public' | 'private'
): Promise<PublicUploadResult>;
export async function uploadFile(
  bucket: string,
  path: string,
  file: File,
  visibility: 'public' | 'private' = 'public'
): Promise<UploadResult> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  if (visibility === 'private') {
    return { path };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

/**
 * Generates a temporary signed URL for a file in a private bucket
 * (e.g. `payment-receipts`, which — unlike `product-images` — has no public
 * read policy). Defaults to a 1 hour expiry, which is enough for an admin
 * to view a receipt while reviewing an order.
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 3600
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);

  if (error || !data) {
    throw new Error(`Failed to create signed URL: ${error?.message ?? 'unknown error'}`);
  }

  return data.signedUrl;
}

/** Deletes a file from a Supabase Storage bucket by its storage path. */
export async function deleteFile(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/** Extracts the storage path from a Supabase public URL for a given bucket, or null if it isn't one. */
export function getPathFromPublicUrl(bucket: string, url: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}
