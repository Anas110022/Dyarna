# Dyarna — agent notes

Expo SDK 57 is new; if training knowledge feels stale, check
https://docs.expo.dev/versions/v57.0.0/ before assuming an older API shape.

## What this is

Dyarna is a mobile-first (React Native + Expo, iOS/Android only — no web
product target) real estate marketplace for Syria: list/browse houses,
apartments and land for sale or rent; RTL Arabic primary, English secondary.

- **Source of truth:** `docs/dyarna-app-specs.md` (full product spec) and
  `docs/dyarna-design-v21.html` (visual mockups, screen-by-screen). Read
  both before building a new screen — colors, copy, and flow there are
  final, not placeholders. If the two ever disagree, the HTML mockup wins
  for anything not spelled out in the spec text.
- **Backend:** Supabase (real project, not mocked) — client lives in
  `src/lib/supabase.ts`. `isSupabaseConfigured` is `false` until `.env` has
  real `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (copy
  from `.env.example`). Auth was wired to Supabase from the start; other
  domains (listings, chat) are still mock data until their build phase.

## Build phases (see docs/dyarna-app-specs.md §10 for the full roadmap)

1. Project foundation (this commit) — Expo+TS scaffold, theme tokens,
   fonts, i18n/RTL, navigation shell, Supabase client wiring.
2. Onboarding (3-slide intro) + real Auth (phone/email, OTP, Supabase).
3. Home — map-first screen + pin bottom-sheet preview.
4. Listing details + search/filters.
5. Post-listing wizard (4 steps, hard validation per spec §4/§5/§6).
6. Chats + Account/settings.

Placeholder screens still standing in for a later phase are marked with a
`ComingSoon` render and/or a `TEMPORARY` comment — replace them, don't build
around them.

## Conventions

- Path alias `@/*` → repo root (e.g. `@/src/theme`).
- Theme tokens only from `src/theme` (`colors`, `fonts`, `spacing`, `radii`)
  — hex values must match the spec exactly, never eyeball a color.
- i18n via `useI18n()` from `src/i18n` (`t('namespace.key')`); strings live
  in `src/i18n/locales/{ar,en}.json`. App boots RTL/Arabic by default
  (`I18nManager.forceRTL` runs on load); toggling to English at runtime
  needs a full app reload, not yet wired — see the note in `src/i18n/index.tsx`.
- Routing is Expo Router (file-based, `app/`). Groups: `(onboarding)`,
  `(auth)`, `(tabs)` — 6 tabs registered (`account`, `index`=listings,
  `projects`, `bookings`, `chats`, `services`); only account/listings/chats
  are real in V1, the other three are permanent `ComingSoon` placeholders
  per spec §2, not phase-1 stand-ins.
- `npm run lint` (eslint-config-expo) and `npx tsc --noEmit` should both be
  clean before considering a change done.
