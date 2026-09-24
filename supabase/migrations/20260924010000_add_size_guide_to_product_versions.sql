-- Adds a version-specific Size Guide to product_versions.
--
-- Stage 1 of the Size Guide work: the customer-facing guide is currently a
-- single hardcoded SIZE_GUIDE constant in src/pages/Product.tsx, identical
-- for every product and every version. This column lets each version
-- (e.g. "Jersey" vs "Oversized — Black") carry its own set of measurements,
-- matching the version-level home of product_type/material/fit/color.
--
-- Shape (array of rows, one per size — display-ready strings, matching the
-- existing hardcoded values like `18"`, `7¼"`):
--   [{ "size": "S", "chest": "20\"", "length": "27\"", "sleeve": "7½\"" }, ...]
--
-- Nullable, no default: existing versions are left as NULL here and will
-- be backfilled with real measurements separately, outside this migration.
-- The CHECK constraint only guards the column's top-level shape (null or a
-- JSON array) — it intentionally does not validate row contents, keeping
-- this additive and safe against the current data.

alter table product_versions
  add column size_guide jsonb
    constraint product_versions_size_guide_is_array
      check (size_guide is null or jsonb_typeof(size_guide) = 'array');

comment on column product_versions.size_guide is
  'Optional array of { size, chest, length, sleeve } measurement rows (display-ready strings) specific to this version. NULL when not yet configured.';
