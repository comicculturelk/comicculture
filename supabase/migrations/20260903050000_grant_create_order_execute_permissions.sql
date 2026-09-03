-- Codifies EXECUTE permissions on create_order() (12-parameter signature,
-- see 20260903030000_harden_create_order_payment_status_search_path.sql
-- and 20260903040000_create_order_validate_payment_method.sql) that were
-- applied manually in the Supabase SQL editor but never captured in a
-- migration file.
--
-- Confirmed target state:
--   PUBLIC        -> no EXECUTE
--   authenticated -> no EXECUTE
--   anon          -> EXECUTE (storefront checkout calls this RPC directly)
--   service_role  -> EXECUTE (server-side/admin tooling)
--
-- This migration only changes grants — it does not alter the function
-- body, RLS policies, tables, columns, constraints, pricing, payment
-- logic, or stock logic.
--
-- Run this in the Supabase SQL editor (or via CLI migration).

REVOKE EXECUTE ON FUNCTION create_order(text, text, text, text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_order(text, text, text, text, text, text, text, text, text, text, text, jsonb) FROM authenticated;

GRANT EXECUTE ON FUNCTION create_order(text, text, text, text, text, text, text, text, text, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION create_order(text, text, text, text, text, text, text, text, text, text, text, jsonb) TO service_role;
