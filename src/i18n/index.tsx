import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DevSettings, I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ar from './locales/ar.json';
import en from './locales/en.json';

export type Locale = 'ar' | 'en';

const translations: Record<Locale, Record<string, unknown>> = { ar, en };
const LOCALE_STORAGE_KEY = 'dyarna.locale';

type I18nContextValue = {
  locale: Locale;
  isRTL: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => Promise<void>;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function resolve(dict: Record<string, unknown>, key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined), dict);
  return typeof value === 'string' ? value : key;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (acc, [name, value]) => acc.replace(`{{${name}}}`, String(value)),
    template
  );
}

// I18nManager's RTL/LTR direction only takes visual effect after a JS
// reload — this returns whether the direction actually changed so the
// caller (setLocale) knows whether it needs to trigger one.
function applyRTL(locale: Locale): boolean {
  const shouldBeRTL = locale === 'ar';
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(shouldBeRTL);
    return true;
  }
  return false;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ar');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_STORAGE_KEY).then((stored) => {
      const initial: Locale = stored === 'en' ? 'en' : 'ar';
      setLocaleState(initial);
      applyRTL(initial);
      setReady(true);
    });
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, next);
    setLocaleState(next);
    const directionChanged = applyRTL(next);
    // Text updates instantly via context either way; the RTL/LTR layout
    // direction itself needs a JS reload to actually flip, so only reload
    // when the direction really changed (ar<->en), not on every toggle.
    if (directionChanged) {
      DevSettings.reload();
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => interpolate(resolve(translations[locale], key), params),
    [locale]
  );

  // Every consumer using useI18n() re-renders whenever this value's
  // identity changes — without this memo it was a fresh object literal on
  // every I18nProvider render, cascading to effectively the whole app
  // (I18nProvider wraps everything). Memoized so it only changes identity
  // when locale actually changes (t and setLocale are already stable
  // useCallbacks).
  const value = useMemo(() => ({ locale, isRTL: locale === 'ar', t, setLocale }), [locale, t, setLocale]);

  if (!ready) return null;

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
