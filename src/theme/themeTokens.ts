import { colors as brand } from './colors';

// Real light/dark token sets — deliberately NOT a naive inversion. Two
// roles that share a hex value in the legacy `colors` object are split
// apart here because they behave differently under dark mode:
//   - "brand fill" (a button's own background, e.g. colors.pine with
//     colors.goldSoft text) is a deliberate brand choice that reads fine
//     in both themes, so it stays constant.
//   - "heading/body text painted directly on the page background" must
//     actually change between themes for contrast — pine-on-ivory (light)
//     cannot become pine-on-near-black (unreadable), so dark mode gets a
//     real, legible, brand-tinted light color for that role instead.
// The Dyarna green (pine) and gold accent are kept recognizable in both
// themes per the brand requirement — nothing here is a generic
// light-gray/dark-gray Material-style palette.

export type ThemeMode = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
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
  background: '#0E1611',
  surface: '#17211B',
  surfaceAlt: '#1E2B23',
  border: '#2A3B31',
  fieldBorder: '#3A4A40',
  headingText: '#DCEFE2',
  bodyText: '#EDEAE0',
  mutedText: '#93A69B',
  brandFill: brand.pine,
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
