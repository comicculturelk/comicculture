import { supabase } from '../lib/supabase';

export type CollectionStatus = 'live' | 'soon';

export interface Collection {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  coverImage: string | null;
  status: CollectionStatus;
  sortOrder: number;
  createdAt: string;
}

// Shape of a row as it comes back from Supabase (snake_case column names)
interface CollectionRow {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  cover_image: string | null;
  status: string;
  sort_order: number;
  created_at: string;
}

function mapRowToCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    tagline: row.tagline,
    description: row.description,
    coverImage: row.cover_image,
    // status is `text` in the DB (not a Postgres enum), so it's narrowed
    // here at the app boundary rather than trusted as-is.
    status: row.status === 'soon' ? 'soon' : 'live',
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function fetchCollections(): Promise<Collection[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(`Failed to load collections: ${error.message}`);
  }

  return (data ?? []).map(mapRowToCollection);
}

export async function fetchCollectionBySlug(slug: string): Promise<Collection | null> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load collection: ${error.message}`);
  }

  return data ? mapRowToCollection(data) : null;
}

export async function fetchCollectionById(id: string): Promise<Collection | null> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load collection: ${error.message}`);
  }

  return data ? mapRowToCollection(data) : null;
}

// --- Admin: collection management (create / edit / delete) ---

/** Fields an admin can set when creating or editing a collection. */
export interface CollectionInput {
  name: string;
  slug: string;
  tagline?: string | null;
  description?: string | null;
  coverImage?: string | null;
  status?: CollectionStatus;
  sortOrder?: number;
}

function mapCollectionInputToRow(input: CollectionInput) {
  return {
    name: input.name,
    slug: input.slug,
    tagline: input.tagline ?? null,
    description: input.description ?? null,
    cover_image: input.coverImage ?? null,
    status: input.status ?? 'live',
    sort_order: input.sortOrder ?? 0,
  };
}

/** Whether a slug is already in use by another collection. */
export async function isCollectionSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  let query = supabase.from('collections').select('id').eq('slug', slug);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Failed to check slug: ${error.message}`);
  }
  return !!data;
}

export async function createCollection(input: CollectionInput): Promise<Collection> {
  const { data, error } = await supabase
    .from('collections')
    .insert(mapCollectionInputToRow(input))
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create collection: ${error.message}`);
  }
  return mapRowToCollection(data);
}

export async function updateCollection(id: string, input: CollectionInput): Promise<Collection> {
  const { data, error } = await supabase
    .from('collections')
    .update(mapCollectionInputToRow(input))
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update collection: ${error.message}`);
  }
  return mapRowToCollection(data);
}

/**
 * Deletes a collection row. Does not touch products referencing this
 * collection — `products.collection_id` is a nullable FK with no cascade
 * configured in the schema, so this is intentionally a plain delete.
 */
export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase.from('collections').delete().eq('id', id);
  if (error) {
    throw new Error(`Failed to delete collection: ${error.message}`);
  }
}
