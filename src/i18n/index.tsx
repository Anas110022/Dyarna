import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
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

function applyRTL(locale: Locale) {
  const shouldBeRTL = locale === 'ar';
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(shouldBeRTL);
    // NOTE: I18nManager only takes effect after a full native reload. The
    // language toggle in Account settings (later phase) must trigger an
    // app restart (e.g. via expo-updates) right after calling setLocale.
  }
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
    applyRTL(next);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => interpolate(resolve(translations[locale], key), params),
    [locale]
  );

  if (!ready) return null;

  return (
    <I18nContext.Provider value={{ locale, isRTL: locale === 'ar', t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
