import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getThemeColors, type ThemeColors, type ThemeMode } from './themeTokens';

// المظهر — a real, persisted, app-wide theme choice. Mirrors the exact
// pattern already used for locale (src/i18n/index.tsx): AsyncStorage +
// Context, single source of truth. Deliberately does NOT read
// Appearance.getColorScheme() as the default or react to OS appearance
// changes — the user's explicit in-app choice is the only thing that ever
// sets the theme (requirement: "do not unexpectedly change their choice
// because the phone's system appearance changes"). Default is light until
// the user actually picks something.
//
// Appearance.setColorScheme() is called on every real change so native
// chrome that reacts to color scheme (system Alert dialogs, keyboard
// appearance) follows the same explicit choice, not just in-app screens.

const THEME_STORAGE_KEY = 'dyarna.theme';

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => Promise<void>;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      const initial: ThemeMode = stored === 'dark' ? 'dark' : 'light';
      setModeState(initial);
      Appearance.setColorScheme(initial);
      setReady(true);
    });
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    Appearance.setColorScheme(next);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  const colors = useMemo(() => getThemeColors(mode), [mode]);

  const value = useMemo(() => ({ mode, colors, setMode, ready }), [mode, colors, setMode, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
