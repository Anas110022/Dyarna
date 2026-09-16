// Real Arabic month names, hand-written — never derived from
// `toLocaleDateString('ar-...')`. Hermes (React Native's JS engine) ships
// without full ICU data by default, so `Date#toLocaleDateString` with an
// 'ar-SY' locale silently falls back to English month names on-device even
// though it works correctly in a Node/browser dev environment — this file
// is the one real source of Arabic month names the booking UI uses so that
// never happens again.

import type { Locale } from '@/src/i18n';

const ARABIC_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const ENGLISH_MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// Real Eastern Arabic-Indic digits used throughout Syria — matches the
// digits Dyarna already renders elsewhere in its Arabic UI.
const EASTERN_ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

function toArabicDigits(value: number): string {
  return String(value).replace(/[0-9]/g, (d) => EASTERN_ARABIC_DIGITS[Number(d)]);
}

const ENGLISH_MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function monthYearLabel(date: Date, locale: Locale): string {
  const month = date.getMonth();
  const year = date.getFullYear();
  if (locale === 'ar') {
    return `${ARABIC_MONTHS[month]} ${toArabicDigits(year)}`;
  }
  return `${ENGLISH_MONTHS_LONG[month]} ${year}`;
}

// day + month name (+ year only if it's not the current year) — the real
// format used everywhere a single booking date is shown to the guest/owner.
export function formatDayMonth(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split('-').map(Number);
  const includeYear = y !== new Date().getFullYear();
  if (locale === 'ar') {
    return includeYear ? `${toArabicDigits(d)} ${ARABIC_MONTHS[m - 1]} ${toArabicDigits(y)}` : `${toArabicDigits(d)} ${ARABIC_MONTHS[m - 1]}`;
  }
  return includeYear ? `${d} ${ENGLISH_MONTHS_SHORT[m - 1]} ${y}` : `${d} ${ENGLISH_MONTHS_SHORT[m - 1]}`;
}

export function formatDateRange(checkInIso: string, checkOutIso: string, locale: Locale): string {
  const arrow = locale === 'ar' ? '←' : '→';
  return `${formatDayMonth(checkInIso, locale)}  ${arrow}  ${formatDayMonth(checkOutIso, locale)}`;
}
