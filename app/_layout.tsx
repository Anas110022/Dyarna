import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Cairo_700Bold, Cairo_800ExtraBold, Cairo_900Black } from '@expo-google-fonts/cairo';
import { Tajawal_300Light, Tajawal_400Regular, Tajawal_500Medium } from '@expo-google-fonts/tajawal';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { I18nProvider } from '@/src/i18n';
import { ComparisonProvider } from '@/src/lib/comparisonContext';
import { ThemeProvider, useTheme } from '@/src/theme/ThemeContext';

SplashScreen.preventAutoHideAsync();

// المظهر — real, app-wide, persisted. RootNavigator is a separate inner
// component (not inlined in RootLayout) purely so it can call useTheme()
// — that hook only works inside <ThemeProvider>, which has to wrap it.
function RootNavigator() {
  const { colors } = useTheme();
  return (
    <>
      <StatusBar style={colors.statusBarStyle} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
    </>
  );
}

// The native splash (real logo) is deliberately kept up past font-loading —
// app/index.tsx hides it itself once it has actually resolved where to
// redirect (onboarding vs login vs home), so the screen goes straight from
// the real splash to the real destination with no intermediate unbranded
// loading flash in between.
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Cairo_700Bold,
    Cairo_800ExtraBold,
    Cairo_900Black,
    Tajawal_300Light,
    Tajawal_400Regular,
    Tajawal_500Medium,
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <ThemeProvider>
          <ComparisonProvider>
            <RootNavigator />
          </ComparisonProvider>
        </ThemeProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
