// Exact hex values from the Dyarna design spec — do not substitute.
//
// Exception: `ivory`/`ivory2` were the spec's original warm cream/tan
// surface tones. Per explicit product direction, every light-theme
// background/card/border in the app now reads through these same two
// tokens (both the legacy `colors.ivory*` call sites across the app and
// ThemeContext's lightThemeColors, which derives background/surfaceAlt/
// border from these), so redefining them here is the single, central
// place that takes the yellow/cream tint out everywhere at once. Brand
// green (pine*) and gold accent (gold/goldSoft) are unchanged and still
// spec-exact. Dark theme is untouched — darkThemeColors in
// src/theme/themeTokens.ts is hand-authored with its own literal hex
// values, not derived from these.
//
// `fieldBorder` is the one new token added for the form-field visibility
// pass: every text input / dropdown trigger / textarea across the app
// pairs `ivory2` (fill) with this hairline border so fields read as
// distinct, tappable controls against a white page/card background,
// without the page background itself losing its clean white.
export const colors = {
  pine: '#0B2B21',
  pine2: '#0E3327',
  pine3: '#1B4E39',
  gold: '#C9A85F',
  goldSoft: '#E4D6AC',
  ivory: '#FFFFFF',
  ivory2: '#F0F1F0',
  fieldBorder: '#DDE0DB',
  ink: '#16211B',
  inkSoft: '#5B6960',
  whatsapp: '#2BAA5E',
  white: '#FFFFFF',
} as const;

export type ColorToken = keyof typeof colors;
