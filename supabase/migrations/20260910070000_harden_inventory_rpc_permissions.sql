-- Remove anonymous access to inventory mutation RPCs.
revoke execute on function public.adjust_stock(uuid, integer, text, text) from anon;

revoke execute on function public.restock_product(uuid, integer, text) from anon;

-- restore_stock_on_cancel is trigger-only.
-- It should never be directly callable as an RPC.
revoke execute on function public.restore_stock_on_cancel() from public;
revoke execute on function public.restore_stock_on_cancel() from anon;
revoke execute on function public.restore_stock_on_cancel() from authenticated;
