const SYRIA_COUNTRY_CODE = '+963';

// Syrian mobile numbers: 9 digits after the country code, starting with 9.
const LOCAL_NUMBER_PATTERN = /^9\d{8}$/;

export function normalizeSyrianLocalNumber(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+/, '');
}

export function isValidSyrianLocalNumber(raw: string): boolean {
  return LOCAL_NUMBER_PATTERN.test(normalizeSyrianLocalNumber(raw));
}

export function toE164(raw: string): string {
  return `${SYRIA_COUNTRY_CODE}${normalizeSyrianLocalNumber(raw)}`;
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}
