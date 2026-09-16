import AsyncStorage from '@react-native-async-storage/async-storage';

// Every listing in Supabase only ever stores a real price_usd — there is no
// real SYP value anywhere in the schema, and no exchange-rate source wired
// up yet. So this only persists the user's *display preference*; it
// deliberately never converts or invents a SYP number. When a real
// exchange-rate source is added later, this is the one place price
// rendering should read from.
export type CurrencyCode = 'USD' | 'SYP';

const CURRENCY_STORAGE_KEY = 'dyarna.currency';

export async function getStoredCurrency(): Promise<CurrencyCode> {
  const stored = await AsyncStorage.getItem(CURRENCY_STORAGE_KEY);
  return stored === 'SYP' ? 'SYP' : 'USD';
}

export async function setStoredCurrency(currency: CurrencyCode): Promise<void> {
  await AsyncStorage.setItem(CURRENCY_STORAGE_KEY, currency);
}
