begin;

create table public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (length(trim(customer_name)) between 1 and 100),
  location text check (location is null or length(trim(location)) <= 100),
  review_text text not null check (length(trim(review_text)) between 10 and 1500),
  product_name text check (product_name is null or length(trim(product_name)) <= 150),
  rating smallint not null default 5 check (rating between 1 and 5),
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.customer_reviews enable row level security;
create policy "Published customer reviews are public"
  on public.customer_reviews for select to anon, authenticated
  using (is_published);
create policy "ComicCulture admin manages customer reviews"
  on public.customer_reviews for all to authenticated
  using ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid)
  with check ((select auth.uid()) = 'f7150d0b-91b4-48ad-aa2d-cbff052d7a2b'::uuid);
create index customer_reviews_published_created_at_idx
  on public.customer_reviews(is_published, created_at desc);

insert into public.customer_reviews(customer_name, location, review_text, product_name, rating, is_published)
values
  ('Vidhoosh Thangaraj', 'Kandy, Sri Lanka', 'The tshirt looks way more awesome rather than seeing it on the picture. And fits perfectly. Both the tshirt and your packaging is just 🔥. Will order more in the future. Do let me know when your Avengers drop launches', 'The Classic Red', 5, true),
  ('Shankesh', 'Colombo, Sri Lanka', 'Yoooo, Just got the package. Love It, Love The Design, Love the packaging, Love the cards included in it as well... Would definitely come back for the other design soon.. Amazing Delivery as well. Thank You', 'The Upgraded Black', 5, true),
  ('Thesanya', 'Makola, Sri Lanka', 'Hello I got the shirt!! Rlly happy with the shirt and it looks fire. Definitely coming back for more Thank you so much', 'The Upgraded Black', 5, true),
  ('Winston Reginold', 'Colombo, Sri Lanka', 'Received the package and the design is so cool ill recommend this page to my friends definitely ✨️🤌and the package box looks so cool ✨️🤌🤍', 'The Symbiotic Suit', 5, true);

commit;
