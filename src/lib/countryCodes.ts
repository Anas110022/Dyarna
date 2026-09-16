// Real, fixed set of 10 supported countries for phone numbers across Dyarna
// (signup, profile contact number, listing contact number). Deliberately
// not a generic "all countries" list — only these 10, per spec. National
// significant number (NSN) length ranges are the real, standard lengths
// for each country's numbering plan (mobile), used for input length and
// basic validation — not a claim of full carrier-prefix-level validation.
export type CountryCode = {
  iso: string;
  flag: string;
  nameAr: string;
  dialCode: string; // no leading +
  nsnMinLength: number;
  nsnMaxLength: number;
};

export const COUNTRY_CODES: CountryCode[] = [
  { iso: 'SY', flag: '🇸🇾', nameAr: 'سوريا', dialCode: '963', nsnMinLength: 9, nsnMaxLength: 9 },
  { iso: 'SA', flag: '🇸🇦', nameAr: 'السعودية', dialCode: '966', nsnMinLength: 9, nsnMaxLength: 9 },
  { iso: 'AE', flag: '🇦🇪', nameAr: 'الإمارات', dialCode: '971', nsnMinLength: 9, nsnMaxLength: 9 },
  { iso: 'KW', flag: '🇰🇼', nameAr: 'الكويت', dialCode: '965', nsnMinLength: 8, nsnMaxLength: 8 },
  { iso: 'OM', flag: '🇴🇲', nameAr: 'سلطنة عمان', dialCode: '968', nsnMinLength: 8, nsnMaxLength: 8 },
  { iso: 'QA', flag: '🇶🇦', nameAr: 'قطر', dialCode: '974', nsnMinLength: 8, nsnMaxLength: 8 },
  { iso: 'BH', flag: '🇧🇭', nameAr: 'البحرين', dialCode: '973', nsnMinLength: 8, nsnMaxLength: 8 },
  { iso: 'IQ', flag: '🇮🇶', nameAr: 'العراق', dialCode: '964', nsnMinLength: 10, nsnMaxLength: 10 },
  { iso: 'JO', flag: '🇯🇴', nameAr: 'الأردن', dialCode: '962', nsnMinLength: 9, nsnMaxLength: 9 },
  { iso: 'LB', flag: '🇱🇧', nameAr: 'لبنان', dialCode: '961', nsnMinLength: 7, nsnMaxLength: 8 },
];

export const DEFAULT_COUNTRY: CountryCode = COUNTRY_CODES[0];

export function findCountryByIso(iso: string): CountryCode {
  return COUNTRY_CODES.find((c) => c.iso === iso) ?? DEFAULT_COUNTRY;
}
