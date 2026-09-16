# Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Settings → API: copy the **Project URL** and **anon public key** into a
   `.env` file at the repo root (copy `.env.example` and fill both values).
3. SQL Editor → paste and run `migrations/20260826000000_profiles.sql`.
   This creates the `profiles` table that every signed-up user gets a row
   in automatically — nothing else to configure for auth to work.
4. SQL Editor → paste and run `migrations/20260902000000_listings.sql`.
   This creates `governorates` (seeded with Syria's real 14 governorates),
   `listings`, `listing_photos`, their RLS policies and trust-rule triggers,
   and a public `listing-photos` Storage bucket with folder-scoped upload
   policies. Nothing else to configure for the schema itself to work.
5. Auth setup (see the notes already in `.env.example`):
   - Confirm signup email template → send `{{ .Token }}` instead of the
     default magic link, so the app's OTP screen can verify it.
   - Authentication → Providers → Phone: enable a phone provider (e.g.
     Twilio) if you want real SMS OTP codes sent to Syrian numbers.
6. Publishing a listing (`status = 'published'` or `is_verified_listing =
   true`) is blocked by RLS/trigger for normal users on purpose (§6 —
   manual review before anything goes live). Until an admin tool exists,
   do this from the SQL Editor (runs as a privileged role, not RLS-limited)
   or with the `service_role` key — never the anon/public key.

Chat and reports tables aren't created yet — those land with their own
build phase per `AGENTS.md`. The post-listing wizard that writes real rows
into `listings` also isn't built yet (Phase 5); the Home screen still runs
on mock data (`src/data/mockListings.ts`) until it is — that mock data is
UI scaffolding only, not seeded into the database by any migration.
