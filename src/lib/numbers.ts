import type { Locale } from '@/src/i18n';

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

// Listing counts are decorative UI numbers (not user-entered data), so the
// spec allows Arabic-Indic digits for them in the Arabic locale.
export function formatCount(value: number, locale: Locale): string {
  const western = value.toLocaleString('en-US');
  if (locale !== 'ar') return western;
  return western.replace(/\d/g, (d) => ARABIC_INDIC_DIGITS[Number(d)]);
}

// Prices are "actual data" — always Western digits per the spec, regardless
// of locale.
export function formatPrice(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

// Compact price for map pins, e.g. $60,000 -> "$60K", $1,200,000 -> "$1.2M".
export function formatCompactPrice(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `$${trimTrailingZero(millions)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1000;
    return `$${trimTrailingZero(thousands)}K`;
  }
  return `$${value}`;
}

function trimTrailingZero(value: number): string {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}
