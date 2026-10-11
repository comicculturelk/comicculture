import { supabaseAdmin } from '../lib/supabaseAdmin';

export type StoreAdminRole = 'owner' | 'admin';

export interface StoreAdmin {
  user_id: string;
  email: string;
  role: StoreAdminRole;
  is_active: boolean;
  created_at: string;
}

export interface AdminActivity {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
}

export async function getStoreAdminRole(): Promise<StoreAdminRole | null> {
  const { data, error } = await supabaseAdmin.rpc('get_store_admin_role');
  if (error) throw new Error(error.message);
  return data === 'owner' || data === 'admin' ? data : null;
}

export async function listStoreAdmins(): Promise<StoreAdmin[]> {
  const { data, error } = await supabaseAdmin.rpc('admin_list_staff');
  if (error) throw new Error(error.message);
  return (data ?? []) as StoreAdmin[];
}

export async function upsertStoreAdmin(email: string, role: StoreAdminRole): Promise<void> {
  const { error } = await supabaseAdmin.rpc('admin_upsert_staff', {
    p_email: email.trim().toLowerCase(),
    p_role: role,
  });
  if (error) throw new Error(error.message);
}

export async function setStoreAdminActive(userId: string, active: boolean): Promise<void> {
  const { error } = await supabaseAdmin.rpc('admin_set_staff_active', {
    p_user_id: userId,
    p_active: active,
  });
  if (error) throw new Error(error.message);
}

export async function listAdminActivity(from: number, to: number): Promise<AdminActivity[]> {
  const { data, error } = await supabaseAdmin
    .from('admin_activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminActivity[];
}
