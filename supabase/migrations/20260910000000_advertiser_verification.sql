-- Dyarna: extends the existing identity-verification request into a real
-- advertiser-type classification (owner / broker / host), each requiring
-- its own real set of documents/details — the two-step "هل أنت؟" ->
-- "المتطلبات" flow now shown before a user's first real listing post.
--
-- Purely additive: no existing column, RLS policy, or trigger is removed
-- or renamed. A row with advertiser_type = null is the original generic
-- identity-verification submission (still exactly how /verify-account
-- works, untouched) — advertiser_type is only ever set by the new
-- post-listing flow.
--
-- Storage: reuses the existing private `verification-docs` bucket and its
-- existing "own folder only" RLS (20260903050000_account_v2.sql) — no
-- bucket/policy change needed, since any number of files can already live
-- under {user_id}/... there.
--
-- Run this after 20260909000000_reports_blocks.sql.

alter table public.verification_requests
  add column if not exists advertiser_type text check (advertiser_type in ('owner', 'broker', 'host')),
  -- A second real document, only meaningful for owner (الطابو الأخضر) and
  -- broker (صورة مقر/مكتب الشركة) — nullable, host needs only the existing
  -- doc_storage_path/document_type (الهوية الشخصية).
  add column if not exists secondary_doc_storage_path text,
  add column if not exists secondary_doc_type text check (secondary_doc_type in ('green_deed', 'office_photo')),
  -- Real broker-only fields (بيانات الشركة/المكتب) — free text, not a
  -- document, so no storage path is needed for these.
  add column if not exists company_name text,
  add column if not exists company_address text;
