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

// The one piece the app never had: a shared type SIZE scale. Font family
// (above) was already centralized; every screen still picked its own
// fontSize by feel, which is the actual source of the app's inconsistent,
// oversized-feeling typography — not the tokens, which never existed to
// enforce anything. New shared components (AppHeader, PrimaryButton,
// SectionTitle, etc.) read from this; screens can migrate to it
// incrementally without needing every fontSize in the app changed at once.
export const fontSizes = {
  screenTitle: 21, // headerTitle on a pushed screen ("الصور (٦)", "تعديل الملف الشخصي"...)
  sectionTitle: 17, // in-page section headings ("كل التفاصيل", "الوحدات"...)
  body: 15, // primary readable text — descriptions, list rows, form values
  bodySmall: 13, // supporting/secondary text — labels, meta rows, captions
  caption: 12, // timestamps, fine print
  button: 16, // primary/secondary button labels
} as const;

export type FontSizeToken = keyof typeof fontSizes;
