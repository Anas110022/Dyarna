// Headings/display use Cairo (700-900), body text uses Tajawal (300-500).
// Keys match the font names loaded via useFonts in app/_layout.tsx.
export const fonts = {
  headingBold: 'Cairo_700Bold',
  headingExtraBold: 'Cairo_800ExtraBold',
  headingBlack: 'Cairo_900Black',
  bodyLight: 'Tajawal_300Light',
  bodyRegular: 'Tajawal_400Regular',
  bodyMedium: 'Tajawal_500Medium',
} as const;

export type FontToken = keyof typeof fonts;
