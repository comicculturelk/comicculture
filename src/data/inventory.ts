import { supabaseAdmin } from '../lib/supabaseAdmin';

export type MovementType = 'sale' | 'restock' | 'adjustment' | 'cancellation';
export type AdjustmentReason = 'damaged' | 'missing' | 'giveaway' | 'correction' | 'other';

export const ADJUSTMENT_REASONS: AdjustmentReason[] = [
  'damaged',
  'missing',
  'giveaway',
  'correction',
  'other',
];

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  size: string;
  changeType: MovementType;
  quantityChange: number;
  resultingStock: number;
  reason: string | null;
  note: string | null;
  createdAt: string;
}

interface InventoryMovementRow {
  id: string;
  product_id: string;
  product_name: string;
  size: string;
  change_type: MovementType;
  quantity_change: number;
  resulting_stock: number;
  reason: string | null;
  note: string | null;
  created_at: string;
}

function mapRow(row: InventoryMovementRow): InventoryMovement {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    size: row.size,
    changeType: row.change_type,
    quantityChange: row.quantity_change,
    resultingStock: row.resulting_stock,
    reason: row.reason,
    note: row.note,
    createdAt: row.created_at,
  };
}

export interface FetchMovementsOptions {
  changeType?: MovementType;
  productId?: string;
  limit?: number;
}

export async function fetchInventoryMovements(
  options: FetchMovementsOptions = {}
): Promise<InventoryMovement[]> {
  let query = supabaseAdmin
    .from('inventory_movements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 100);

  if (options.changeType) query = query.eq('change_type', options.changeType);
  if (options.productId) query = query.eq('product_id', options.productId);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load inventory history: ${error.message}`);
  }

  return (data ?? []).map(mapRow);
}

/** Add supplier stock for a product-version-size. Admin only (RLS-enforced via RPC grant). */
export async function restockProduct(
  versionSizeId: string,
  quantity: number,
  note?: string
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('restock_product', {
    p_version_size_id: versionSizeId,
    p_quantity: quantity,
    p_note: note ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/** Record a manual stock adjustment (damaged, missing, giveaway, correction, other) for a product-version-size. */
export async function adjustStock(
  versionSizeId: string,
  quantityChange: number,
  reason: AdjustmentReason,
  note?: string
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('adjust_stock', {
    p_version_size_id: versionSizeId,
    p_quantity_change: quantityChange,
    p_reason: reason,
    p_note: note ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
}
