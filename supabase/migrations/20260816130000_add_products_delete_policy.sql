-- Fix: products had no DELETE policy under RLS, so admin deletes were
-- silently matching zero rows (no error) instead of removing the row —
-- the delete "succeeded" from the client's point of view but nothing
-- was actually deleted. This does not modify or remove any existing
-- products policies.

create policy "Authenticated users can delete products"
  on products
  for delete
  to authenticated
  using (true);
