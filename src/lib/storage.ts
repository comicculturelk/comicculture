import { supabase } from './supabase';

export interface UploadResult {
  path: string;
  publicUrl: string;
}

/**
 * Uploads a file to a Supabase Storage bucket and returns its path + public URL.
 * Generic by design — reusable by any future admin feature that needs file
 * storage (product images, homepage banners, etc.), not just products.
 */
export async function uploadFile(bucket: string, path: string, file: File): Promise<UploadResult> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
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
