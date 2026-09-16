import { COUNTRY_CODES, DEFAULT_COUNTRY, type CountryCode } from '@/src/lib/countryCodes';

export function normalizeLocalNumber(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+/, '');
}

export function isValidLocalNumber(raw: string, country: CountryCode): boolean {
  const digits = normalizeLocalNumber(raw);
  return digits.length >= country.nsnMinLength && digits.length <= country.nsnMaxLength;
}

export function toE164(raw: string, country: CountryCode): string {
  return `+${country.dialCode}${normalizeLocalNumber(raw)}`;
}

// Splits a stored E.164 number (e.g. "+9665XXXXXXXX") back into its country
// + local digits for editing. Matches the longest known dial code first so
// e.g. +966... isn't mistaken for a shorter prefix.
export function splitE164(e164: string): { country: CountryCode; local: string } {
  const digits = e164.replace(/^\+/, '');
  const match = [...COUNTRY_CODES].sort((a, b) => b.dialCode.length - a.dialCode.length).find((c) => digits.startsWith(c.dialCode));
  const country = match ?? DEFAULT_COUNTRY;
  return { country, local: digits.slice(country.dialCode.length) };
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}
