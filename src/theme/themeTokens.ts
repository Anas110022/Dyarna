import { colors as brand } from './colors';

// Real light/dark token sets — deliberately NOT a naive inversion.
//
// Dark mode (redesigned): a graduated four-tier neutral scale, each step a
// real but modest lightness jump — background < surface < surfaceAlt <
// elevatedSurface — rather than the old two-tier near-black background/
// surface pair (#0E1611/#17211B, ~9 RGB units apart) that read as flat
// "black panels on a dark gray page" with almost no card/page separation.
//   - background: the page itself — the darkest tier.
//   - surface: a card/header/tab-bar sitting ON the page — one visible
//     step up.
//   - surfaceAlt: an interactive element sitting ON a card (a form field,
//     a chip) — a further step up, so it reads as "elevated and tappable"
//     rather than sunken to near-black. (Inverted from light mode, where
//     surfaceAlt is a muted inset tone below surface — dark UIs generally
//     signal "raised/interactive" with more lightness, not less.)
//   - elevatedSurface: a modal/bottom-sheet/dropdown floating above
//     everything else — the lightest neutral tier.
// `border`/`fieldBorder` are low-contrast on purpose: visible as a
// separator against any of the above without reading as a bright line.
//
// `brandFill` no longer stays pixel-identical between themes. In light
// mode it's colors.pine — already dark, so a pine-filled button/chip pops
// against the light page. Reusing that same near-black hex as a *fill* in
// dark mode made every filled chip/button/active-tab read as just another
// black rectangle, indistinguishable from the background it sat on — the
// actual root of the "everything is a black panel" complaint. Dark mode
// instead gets a real, visibly-green mid-tone fill, so the brand color
// still reads as green (not as one more shade of near-black) exactly
// where it's meant to stand out: active nav, primary actions, selected
// states. `onBrandFill` (colors.goldSoft) is unchanged — it already has
// enough contrast against this brighter fill.
//
// "heading/body text painted directly on the page background" must
// actually change between themes for contrast — pine-on-ivory (light)
// cannot become pine-on-near-black (unreadable) — so dark mode gets real,
// legible light colors for that role, graduated into a primary/secondary
// pair (bright vs. softer) rather than one flat near-white used everywhere.
// The Dyarna green (pine) and gold accent are still kept recognizable in
// both themes per the brand requirement — this is not a generic
// light-gray/dark-gray Material-style palette.

export type ThemeMode = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  elevatedSurface: string;
  border: string;
  fieldBorder: string;
  headingText: string;
  bodyText: string;
  mutedText: string;
  brandFill: string;
  onBrandFill: string;
  accentGold: string;
  success: string;
  danger: string;
  signOutText: string;
  white: string;
  statusBarStyle: 'light' | 'dark';
};

export const lightThemeColors: ThemeColors = {
  background: brand.ivory,
  surface: brand.white,
  surfaceAlt: brand.ivory2,
  // Light mode never needed a fourth tier — modals/sheets already read
  // fine as plain white (the same as `surface`), so this is a no-op alias
  // rather than a new visual value.
  elevatedSurface: brand.white,
  border: brand.ivory2,
  fieldBorder: brand.fieldBorder,
  headingText: brand.pine,
  bodyText: brand.ink,
  mutedText: brand.inkSoft,
  brandFill: brand.pine,
  onBrandFill: brand.goldSoft,
  accentGold: brand.gold,
  success: brand.whatsapp,
  danger: '#B5482C',
  signOutText: '#B0876B',
  white: brand.white,
  statusBarStyle: 'dark',
};

export const darkThemeColors: ThemeColors = {
  background: '#131916',
  surface: '#1B2320',
  surfaceAlt: '#212B26',
  elevatedSurface: '#26312B',
  border: '#303B34',
  fieldBorder: '#3C4A42',
  headingText: '#F0F2EF',
  bodyText: '#D5D9D4',
  mutedText: '#93A69B',
  brandFill: '#1E6B4A',
  onBrandFill: brand.goldSoft,
  accentGold: '#D4B876',
  success: '#35C374',
  danger: '#E0836A',
  signOutText: '#D3A688',
  white: brand.white,
  statusBarStyle: 'light',
};

export function getThemeColors(mode: ThemeMode): ThemeColors {
  return mode === 'dark' ? darkThemeColors : lightThemeColors;
}
