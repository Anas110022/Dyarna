# ديارنا (Dyarna) — Full Product & Technical Specification
### منصة عقارية لسوريا — بيع، إيجار، وأراضي
**For:** Claude Code (or any dev team) to build the real, working, cross-platform app
**Design reference:** matches the approved HTML mockups (v13) exactly — colors, copy, and screen flow below are final, not placeholders.

---

## 1. Product Summary

Dyarna is a mobile-first real estate marketplace for Syria. Users can list houses, apartments, and land for **sale or rent**, browse/filter listings, message sellers in-app or via WhatsApp, and manage their own account. The core value proposition is **trust**: every listing requires verified contact info, a confirmed map pin, complete specs, and an owner-written description — important for a growing market where fraudulent listings are a real risk.

- **Primary language:** Arabic (RTL). **Secondary:** English (LTR), toggle in login and account settings.
- **Currency:** USD only, displayed as `$` (no SYP conversion — confirmed final decision).
- **Platforms:** iOS + Android (recommend React Native / Expo for one shared codebase). Web version optional later.

---

## 2. Brand & Design System

### Colors (exact hex, do not substitute)
| Token | Hex | Usage |
|---|---|---|
| `pine` (primary) | `#0B2B21` | headers, primary buttons, dark screens (auth) |
| `pine-2` | `#0E3327` | gradients, dark section backgrounds |
| `pine-3` | `#1B4E39` | accents, gradients |
| `gold` (accent) | `#C9A85F` | CTAs on dark bg, badges, active states |
| `gold-soft` | `#E4D6AC` | text on dark bg, secondary gold |
| `ivory` (bg) | `#F7F4EC` | app background |
| `ivory-2` | `#EFE9D8` | card/pill inactive backgrounds |
| `ink` (text) | `#16211B` | primary text |
| `ink-soft` | `#5B6960` | secondary text |
| WhatsApp green | `#2BAA5E` | WhatsApp contact button only |

### Typography
- **Headings/Display:** Cairo (700–900 weight)
- **Body:** Tajawal (300–500 weight)
- Both fonts must support Arabic + Latin.

### Logo
- Gold eagle with 3 stars (provided separately as brand asset), on pine-green background for splash/auth screens.

### Layout rules
- App is **RTL by default** (Arabic). All icons, back arrows, and layout mirror correctly in RTL. English mode flips to LTR.
- **Bottom tab bar — 6 visual slots, matching the reference app's structure, but only some are functional in V1:**
  **حسابي (Account) · الإعلانات (Listings — this is the map-first Home screen, §4 screen 01) · المشاريع (Projects) · الحجوزات (Bookings) · الشات (Chats) · الخدمات (Services)**
  In V1, build **حسابي, الإعلانات, الشات** as fully functional (per §4). **المشاريع** and **الخدمات** are V2/V3 features (§10) — render their tab icons/labels now for visual and structural consistency with the reference app, but tapping them in V1 should show a simple "قريبًا" (coming soon) placeholder screen rather than a broken/missing route. Do not build their real functionality yet.
  Note: the "+ إضافة" (post-listing) action is **not** its own tab in this version — it's reached via the "＋ إضافة" button in the map screen's bottom summary bar (§4 screen 01) and via the Account screen. If this creates a discoverability problem in testing, revisit adding it as a 7th tab or replacing a lower-priority tab — flag this as an open UX question, not a fixed decision.
- "Saved/Favorites" is NOT a bottom tab — accessible from the heart icon on listing cards and from a stat on the Account screen.

---

## 3. Data Model

### User
```
id, full_name, phone (nullable), email (nullable), password_hash (if email signup),
auth_method: "phone" | "email",
is_verified: bool,               // identity verification badge
avatar_url,
created_at
```
- A user must have **either** phone OR email (at least one), not necessarily both.
- Phone signup → OTP only, no password.
- Email signup → requires full_name + email + password, then 4-digit email verification code.

### Listing
```
id, owner_id (FK User),
listing_type: "sale" | "rent" | "land",
category: "house" | "apartment" | "land" | "commercial",
title, description (required, free text, min length enforced — see §5),
price_usd (integer, required),
city, area/neighborhood, lat, lng (required — map pin must be placed, not just typed address),
photos: array of image URLs (min 3 required, no max),
ownership_doc_url (optional — "طابو"/deed upload),
contact_phone (required, shown to buyers, verified against account),

// Conditional fields by category — see §5 for full field list per type
specs: { ... },

status: "pending_review" | "published" | "rejected" | "archived",
is_verified_listing: bool,       // "✓ عقار موثّق" badge — set after admin/auto review
view_count, saved_count,
created_at, updated_at
```

### Conversation / Message
```
Conversation: id, listing_id (FK), buyer_id, seller_id, last_message_at
Message: id, conversation_id, sender_id, text, sent_at, read_at
```
- Every conversation is anchored to exactly one listing (shown as a pinned card at the top of the chat).

### Report
```
id, listing_id, reporter_id, reason, created_at, status
```

### SavedListing (favorites)
```
user_id, listing_id, saved_at
```

---

## 4. Screen-by-Screen Spec

> Numbering matches the design mockup file for reference during handoff.

### 00-PRE — First-launch Intro (shown once, before Auth)
A 3-slide swipeable onboarding sequence, shown the very first time the app is opened on a device (before any account exists) — never shown again after the user reaches the auth screen once, even if they don't finish signing up (store a local "has seen intro" flag, not tied to login state).

- **Skip** link, top-left (RTL: top-right visually), visible on every slide — jumps straight to the Auth Landing screen.
- **Slide 1** (ivory background): house/search icon illustration, headline "دوّر على بيتك القادم بسهولة", subtext about browsing houses/apartments/land for sale or rent on one map.
- **Slide 2** (ivory background): shield/checkmark icon illustration, headline "كل إعلان موثّق وواضح" only, no subtext line — this slide directly communicates the platform's core trust positioning (§6) through the headline alone.
- **Slide 3** (dark pine background, visually distinct as the final/CTA slide): plus-in-circle icon illustration, headline "عندك عقار؟ انشره بدقايق", subtext about the quick post-listing flow. Button reads **"ابدأ الآن"** (not "التالي") and navigates to Auth Landing (§4 screen 00).
- Pagination dots at the bottom of each slide (active dot is an elongated pill, inactive dots are small circles) indicate position; swiping left/right between slides should also work, not just the button.

### 00 — Onboarding / Auth (5 screen states, all share one visual template: dark pine background, gold eagle logo, "ديارنا" wordmark, AR/EN toggle)

**Shared elements on every auth screen:**
- Language toggle top: `عربي` / `English`
- Two-tab segmented control: **حساب جديد (Sign up)** ↔ **تسجيل الدخول (Sign in)**
- Below that, method toggle: **📱 رقم الجوال** ↔ **✉️ البريد الإلكتروني**
- Footer: "بالمتابعة أنت توافق على شروط الاستخدام وسياسة الخصوصية الخاصة بديارنا"

**State A — Sign up / Phone:**
- Fields: `الاسم الكامل` (text), `رقم الهاتف` (with `+963` prefix, numeric)
- CTA: "إرسال رمز التحقق وإنشاء حساب" → goes to OTP screen

**State B — Sign up / Email:**
- Fields: `الاسم الكامل`, `البريد الإلكتروني`, `كلمة المرور`
- CTA: "إرسال رمز التحقق وإنشاء حساب" → sends email verification code → OTP screen

**State C — Sign in / Phone:**
- Field: `رقم الهاتف` only
- CTA: "إرسال رمز التحقق" → OTP screen → logs in existing account

**State D — Sign in / Email:**
- Fields: `البريد الإلكتروني`, `كلمة المرور`
- Link: "نسيت كلمة المرور؟" (forgot password flow — standard reset-by-email)
- CTA: "تسجيل الدخول" → **no OTP needed**, logs in directly

**OTP screen** (phone or email signup/signin that requires a code):
- 4 separate digit boxes, auto-advance
- Text: "تم إرسال رمز مكوّن من 4 أرقام إلى [phone/email]"
- Resend link disabled for 30s countdown, shown as "إعادة الإرسال خلال 00:XX"
- CTA: "تأكيد ومتابعة"
- Logic: backend checks if phone/email already exists → if yes, this OTP completes a **login**; if no, completes **signup** and creates the account. This must be transparent — no separate "which flow am I in" confusion for the user.

---

### 01 — Home / Explore — **map-first (redesigned)**
This is the app's default landing screen and primary discovery surface — deliberately modeled after how mature real-estate apps (e.g. the reference Gulf app reviewed during design) lead with an interactive map, not a card feed.

- **Rent/Sale segmented toggle**, pinned at the top: **للإيجار (for rent)** / **للبيع (for sale)** — this is the first decision the user makes, before anything else loads.
- **Category filter chips**, horizontally scrollable, directly below the toggle: الكل / شقة / فيلا / بيت / أرض / مكتب / محل تجاري / عمارة. Selecting a category live-filters the pins on the map.
- **Full-screen interactive map** as the main content — every published listing matching the current toggle + category selection renders as a price-label pin at its real lat/lng (per the mandatory map-pin requirement in §4 screen 04). **All pins are visually identical** — same pine-green pill shape, price text only. No color variants, no star/checkmark badges on the map itself; verification status and any future "featured" status are shown on the Listing Detail screen (§4 screen 02), not on the map pin. Keep the map deliberately uncluttered.
- Map controls: recenter-on-my-location button, and a saved/favorites shortcut button (both floating, bottom corners).
- **Bottom summary bar** (floating over the map, above the tab bar): a "☰ قائمة" toggle to switch to the list view (reuses the existing Search/List screen, §4 screen 03), a live count ("٤٧ من ١٬٢٠٤ إعلان"), and a "＋ إضافة" shortcut straight into the post-listing flow.
- **Tapping a pin (exact behavior, per mockup screen "٠١ب"):** the map dims slightly (semi-transparent pine overlay), the tapped pin highlights (scales up, gold background) so the user can see which listing the sheet refers to, and a bottom-sheet card slides up showing: a "✕" dismiss button (top-right of the sheet), the listing's main photo, title, location (pin icon + text), a compact spec row (bed/bath/area icons — only the fields relevant to that listing's category, per the §5 field matrix), the price in `$`, and a full-width "عرض التفاصيل كاملة" button that navigates to the full Listing Detail screen. Dismissing the sheet (✕, or tapping the dimmed map background) returns to the normal, undimmed map state at the same pan/zoom position — never reset the map view on dismiss.
- Bottom tab bar as defined in §2.

**Note for Claude Code:** the previous spec revision described a card-feed Home screen with a "Featured Properties" row and a "Browse by category" icon grid. That version is **superseded** by the map-first design above — do not build both; the map-first version above is final.

### 02 — Listing Details (house/apartment template)
- Full-bleed photo header with back + heart buttons, page indicator ("١ / ١٨"), "✓ عقار موثّق" badge
- **Thumbnail gallery strip** directly below hero photo — shows ALL uploaded photos (not just one), horizontally scrollable, last thumbnail shows "+N" overlay if more exist than fit
- Title, location (pin icon + text)
- Price in `$` only (no SYP)
- **"كل التفاصيل" grid** (2–3 columns): bedrooms, bathrooms, area (m²), floor, year built, deed/ownership type — icons + labels
- Status tags: e.g. "سليم بالكامل", "مفروشة جزئيًا"
- **Description paragraph — this is the owner's free-text field from posting, rendered verbatim.** Not app-generated boilerplate.
- **Location map** — static/interactive map card showing the exact pinned location + surrounding streets, with address label overlay
- **"المعلن" (poster) card** — avatar, full name, verified-identity badge. This must always be visible; a listing can never be anonymous.
- Two contact buttons side by side: **مراسلة بالتطبيق** (opens in-app chat, outline style) and **واتساب** (green `#2BAA5E`, deep-links to `wa.me/<contact_phone>` with a prefilled message referencing the listing)
- Below buttons: **"🚩 الإبلاغ عن هذا الإعلان"** link → opens report reason picker

### 03 — Search & Filters
- Search bar + filter icon
- Quick type chips: الكل / بيع / إيجار / أرض
- Price range dual slider (USD)
- Bedrooms / bathrooms quick counts (house/apartment only — hidden for land)
- Results count + sort dropdown ("الأحدث أولًا" etc.)
- Result list: photo thumb, title, location, price

### 04 — Post a Listing (multi-step form, 4 steps)
This is the highest-trust screen in the app — **every rule below is a hard validation requirement, not a suggestion.**

**Step 1:** Listing type (بيع / إيجار / أرض) → determines which spec fields appear in later steps (see §5).

**Step 2 — Photos, contact, location, description:**
- **Photo upload — no maximum limit.** Grid of thumbnails + "+" add button. Helper text: "صوّر كل غرفة، والمطبخ، والحمامات، والواجهة الخارجية". **Minimum 3 photos required to proceed.**
- **رقم التواصل الظاهر للزبائن*** — contact phone shown to buyers, pre-filled from account, editable, must be a valid Syrian number, shown with a verified checkmark once validated.
- **Optional:** "إرفاق سند الملكية" (ownership deed upload) — not required to publish, but boosts trust/verified badge likelihood.
- **أكّد الموقع على الخريطة*** — interactive map, user must drag a pin to the exact location (not just type an address). Store resulting lat/lng.
- **وصف العقار*** — required multi-line text area. Placeholder/helper: "اكتب وصفًا واضحًا للعقار: حالته، وأقرب المرافق إليه — مثل مدرسة، جامع، سوق، طريق رئيسي، أو أرض زراعية مجاورة إن وُجدت." Helper note under field: "هاي المعلومات هي اللي بتظهر لكل الزوار بصفحة الإعلان — اكتبها أنت بنفسك بدقة." **Enforce a minimum character count** (recommend ≥ 40 characters) so people can't skip it with one word.
- A green confirmation banner appears once all required fields on this step are valid: "كل الحقول الإلزامية مكتملة — جاهز للنشر بعد المراجعة"

**Step 3:** Category-specific structured specs (see §5 table) — area, rooms, floor, etc.

**Step 4:** Price (USD) + review/preview screen showing exactly how the listing will render, before final submit.

**On submit:** listing status = `pending_review`. Do not mark `is_verified_listing = true` automatically — see §6 Moderation.

### 05 — Saved / Favorites
- Filter chips: الكل / للبيع / للإيجار
- List of saved cards with filled heart icon to unsave
- Accessed via heart icon on cards or from Account screen stat — not a bottom tab

### 06 — Land Listing Details (category variant of §02)
Same template as §02, but the details grid is land-specific:
- المساحة (م²), نوع الأرض (سكنية/زراعية/تجارية), الواجهة (م), وصف الطريق ("مطلة على طريق عام"), نوع السند ("طابو أخضر" etc.), رخصة بناء متاحة (yes/no)
- Same poster card, same two contact buttons, same report link — **every category must show poster identity and both contact options, no exceptions.**

### 07 — Agent / Owner Profile + Schedule Visit
- Avatar, name, role/city, rating (★ average + review count), stats: properties sold, verified badge, avg response time
- "حجز موعد معاينة" — date chips (next few days) + time
- Buttons: رسالة (chat) / حجز معاينة (confirm booking)

### 08 — Chats (Conversation List)
- One row per conversation: other person's avatar + name, **which listing this conversation is about** (small subtitle line — critical, a user may have multiple simultaneous conversations about different properties), last message preview, timestamp, unread indicator dot
- Tapping opens §09

### 09 — Chat Detail
- Header: back button, other person's avatar/name, "online now" status if available, phone icon (quick call)
- **Pinned listing card** at the top of the thread at all times (photo thumb, title, location, price) — reinforces context
- Standard message bubbles (own messages right-aligned in pine/gold, other person's left-aligned in ivory)
- Text input + send button
- Should support a report/block action from within the chat (menu, not shown in mockup but required — add a "⋮" overflow menu with "الإبلاغ عن هذا المستخدم" / "حظر")

### 10 — Account / Settings
- Profile header: avatar, name, phone, "✓ حساب موثّق" badge
- Quick stats row: عقاراتي (my listings count) / المفضلة (saved count) / الرسائل (messages count) — tappable
- **الحساب section:** تعديل الملف الشخصي, عقاراتي المنشورة (manage/edit/archive own listings), الإشعارات (toggle)
- **التفضيلات section:** اللغة (عربي/English switch), العملة المعروضة (currently fixed to USD $, shown as read-only for now)
- **الدعم والمعلومات section:** الدعم الفني, الشروط والأحكام, سياسة الخصوصية
- تسجيل الخروج (sign out) at the bottom

---

## 5. Category-Specific Field Matrix

| Field | House | Apartment | Land | Rent (any type) |
|---|:---:|:---:|:---:|:---:|
| المساحة (m²) | ✓ | ✓ | ✓ | ✓ |
| عدد الغرف | ✓ | ✓ | — | ✓ (if applicable) |
| عدد الحمامات | ✓ | ✓ | — | ✓ (if applicable) |
| الطابق | — | ✓ | — | ✓ (if apartment) |
| سنة البناء | ✓ | ✓ | — | ✓ (if applicable) |
| نوع السند (طابو أخضر, إفراغ, etc.) | ✓ | ✓ | ✓ | — |
| نوع الأرض (سكنية/زراعية/تجارية) | — | — | ✓ | — |
| الواجهة (م) | — | — | ✓ | — |
| وصف الطريق / الوصول | — | — | ✓ | — |
| رخصة بناء متاحة | — | — | ✓ | — |
| حالة العقار (سليم/يحتاج ترميم) | ✓ | ✓ | — | ✓ |
| مفروشة بالكامل/جزئيًا/غير مفروشة | — | — | — | ✓ |
| مدة العقد (سنة، ٦ أشهر...) | — | — | — | ✓ |
| الدفعة المقدمة | — | — | — | ✓ |
| **وصف حر (نص المعلن)** | ✓ required | ✓ required | ✓ required | ✓ required |
| **صور (≥3)** | ✓ required | ✓ required | ✓ required | ✓ required |
| **موقع مثبّت على خريطة** | ✓ required | ✓ required | ✓ required | ✓ required |
| **رقم تواصل موثّق** | ✓ required | ✓ required | ✓ required | ✓ required |

---

## 6. Trust & Moderation Rules (core differentiator — implement carefully)

1. **No anonymous listings.** Poster's real name + avatar + verified-identity badge must render on every single listing detail screen, every category, no exceptions.
2. **Mandatory fields block publish.** The app must not allow a listing to reach `published` status without: ≥3 photos, confirmed map pin (lat/lng), category-required specs, price, and a description meeting the minimum length.
3. **New listings start as `pending_review`**, not instantly public. Recommend: manual admin review for the first 3 months of the platform's life (small volume, high fraud risk in an early-stage market), transitioning to automated checks (duplicate photo detection, phone number reuse patterns, price-per-m² outlier flagging) plus spot-checks as volume grows. This was discussed with the founder as a phased trust strategy — build an admin review queue as part of MVP, even if simple.
4. **Report flow** must be reachable from every listing detail screen and from within any chat. Reports should notify an admin queue, not just silently log.
5. **WhatsApp deep link** must never be the *only* contact option — in-app chat must always be offered alongside it, so conversation history/reporting stays possible even if the user prefers WhatsApp for the actual conversation.

---

## 7. Localization Notes

- All UI strings ship in Arabic (formal/MSA register — avoid regional colloquialisms in interface copy; this was explicitly corrected during design review) and English.
- RTL mirroring must be tested on every screen, not just assumed from `dir="rtl"` — icons like back-arrows, chevrons, and the send-button arrow must flip direction.
- Numbers: Arabic-Indic digits (٠١٢...) are used decoratively in the design mockups for step counters; **actual data (prices, phone numbers, OTP codes) should use standard Western digits** for compatibility with input keyboards and screen readers — do not force Arabic-Indic numerals on user-entered data.

---

## 8. Suggested Tech Stack (recommendation, not mandatory)

- **App:** React Native + Expo (single codebase for iOS/Android, matches the web mockup's component structure closely, easiest for a solo founder to iterate on with Claude Code)
- **Backend:** Supabase or Firebase (auth, Postgres/Firestore, storage for photos, realtime for chat) — avoids standing up custom infra for MVP
- **SMS OTP:** Twilio Verify (or a Syria-compatible SMS gateway — confirm delivery coverage for `+963` numbers specifically, some global SMS providers have gaps in Syria; this needs a real check before committing)
- **Maps:** Mapbox or Google Maps SDK — confirm map tile coverage/quality for Syrian cities before choosing
- **Push notifications:** Expo Notifications / Firebase Cloud Messaging (for new messages, price changes on saved listings)

---

## 9. Out of Scope for MVP (explicitly deferred, do not build yet)

- In-app payments / transaction handling (this is a listings marketplace, not a payment processor)
- SYP currency display (USD-only confirmed)
- Multi-agency/brokerage accounts (single individual user accounts only for now)

---

## 10. Full Feature Roadmap (V1 / V2 / V3) — complete vision, staged for buildability

After reviewing a mature Gulf real-estate app in depth, the founder wants Dyarna's **full ambition captured now**, even though it gets built in stages. This section is the complete feature inventory — nothing here is "rejected," everything is scheduled into a release.

### V1 — MVP (Phases 1–6 of the dev plan, current build target)
Everything already specified in §4 of this document: auth, home feed, search (list + map view), listing details, post-listing wizard, saved listings, chats, account settings, notifications screen, my-listings management. This is the release that proves the trust model works with real users.

### V2 — Engagement & Discovery Expansion
Features that make the app stickier and more useful once there's a real user base, still no monetization required:

- **Bookings tab** (new 6th bottom tab): a dedicated tab listing all of the user's scheduled property viewings (both as a buyer who booked a visit, and as a seller managing visit requests on their own listings) — formalizes what's currently just a "Schedule a Visit" action on the Agent Profile screen (§4 screen 07) into its own persistent, manageable list. This is a genuinely high-value addition the reference app validates well.
- **Saved searches with alerts** (already added in the previous gap-analysis pass — kept here for continuity): save a filter combination, get notified on new matches.
- **"My neighborhoods" / area watchlist:** follow specific neighborhoods (not just individual listings) to get a feed of all new activity there — useful for buyers early in their search who don't have a specific listing yet.
- **Market insights ("Average listing prices")**: aggregate price-per-m² by city/neighborhood from real platform data, shown as a simple browsable tool. Needs meaningful listing volume to not be misleading — gate this behind a minimum data threshold, don't launch with fake/sparse numbers.
- **Legal documents / help library**: static, editorially-written guide content — types of Syrian property deeds, what to check before buying, how the verification badge works. High trust value, low engineering cost (it's just content, not a data feature).
- **Blog / content section**: same rationale as above — cheap to build, reinforces trust positioning, gives the app something to share on social media for marketing.

### V3 — Monetization & Professional Tools
Once V1+V2 prove the platform works and has real usage, these features let Dyarna generate revenue and serve power users (agents/brokers), mirroring the reference app's "Services" tab:

- **Wallet / balance system**: prerequisite for everything below — an in-app balance a user can top up and spend.
- **Featured / boosted listings ("Ads of the day" equivalent):** sellers pay to have their listing shown higher in search/map results for a period. This is the most standard, least controversial real-estate monetization feature and should likely be the *first* V3 feature built.
- **Broker/agent subscriptions:** a paid tier for professional agents (higher listing limits, analytics, priority support) — equivalent to the reference app's "Broker subscriptions" and "AQAR+".
- **Selling & leasing commission tools:** deal-tracking and commission calculation for agents closing deals through the platform — only worth building once there's a critical mass of agents actually transacting through Dyarna, not before.
- **Exclusive marketing services:** paid promotional placements (banners, homepage features) — an ads-sales product, needs a sales/ops process behind it, not just an engineering task.
- **Developer / off-plan project listings ("Projects" tab):** a structurally different content type (a project with many units, floor plans, delivery dates) rather than a single listing — a legitimate future expansion once Dyarna wants to serve developers/agencies, not just individual owners. Needs its own data model (`project`, `project_unit`) distinct from `listings`.

### Explicitly not planned (government/market-specific, no Syria equivalent)
- **Ejar-style contract registration:** tied to Saudi Arabia's REGA regulatory system specifically. If Syria ever establishes an equivalent official rental-registration system, revisit; there is nothing to integrate with today.
- **Government-issued "Verify account" tiers** beyond what Dyarna can independently confirm (phone/email + admin review) — the reference app's identity verification likely hooks into Saudi national ID systems (Absher-style), which has no Syrian equivalent Dyarna can access. Dyarna's verification badge (§6) is platform-level trust, not government-level identity verification, and should be described to users as such rather than overclaiming.

### How to use this roadmap
Treat V1 as the only in-progress work right now (per the approved dev plan, §5). V2 and V3 exist so nothing discussed gets lost or forgotten — when V1 ships and gets real usage, come back to this section to plan the next build phase, rather than re-deriving the feature list from scratch.



---

*This document reflects every decision made during the design phase with the founder. If Claude Code (or a developer) has a question not answered here, treat the HTML mockup file as the visual source of truth for anything not specified in text.*
