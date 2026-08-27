# Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Settings → API: copy the **Project URL** and **anon public key** into a
   `.env` file at the repo root (copy `.env.example` and fill both values).
3. SQL Editor → paste and run `migrations/20260826000000_profiles.sql`.
   This creates the `profiles` table that every signed-up user gets a row
   in automatically — nothing else to configure for auth to work.
4. Auth setup (see the notes already in `.env.example`):
   - Confirm signup email template → send `{{ .Token }}` instead of the
     default magic link, so the app's OTP screen can verify it.
   - Authentication → Providers → Phone: enable a phone provider (e.g.
     Twilio) if you want real SMS OTP codes sent to Syrian numbers.

Listings, chat, and reports tables aren't created yet — those land with
their own build phases (post-listing wizard, chat) per `AGENTS.md`; the
Home screen still runs on mock data (`src/data/mockListings.ts`) until then.
