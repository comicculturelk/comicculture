begin;

-- Keep the no-client-access design explicit for one-time notification secrets.
comment on table public.order_notification_state is
  'Private Edge Function state; intentionally has RLS enabled with no client policies.';

-- Cover the promo-code FK for deletion checks and promo redemption queries.
create index if not exists promo_redemptions_promo_code_id_idx
  on public.promo_redemptions(promo_code_id);

-- Merge public and administrator reads into one policy to avoid overlapping
-- permissive SELECT policies while still hiding every unpublished review.
drop policy if exists "ComicCulture admin manages customer reviews" on public.customer_reviews;
drop policy if exists "Published customer reviews are public" on public.customer_reviews;
create policy "Published reviews and admin review access"
  on public.customer_reviews for select to anon, authenticated
  using (
    is_published
    or (select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid
  );
create policy "ComicCulture admin inserts customer reviews"
  on public.customer_reviews for insert to authenticated
  with check ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
create policy "ComicCulture admin updates customer reviews"
  on public.customer_reviews for update to authenticated
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid)
  with check ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
create policy "ComicCulture admin deletes customer reviews"
  on public.customer_reviews for delete to authenticated
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);

commit;
