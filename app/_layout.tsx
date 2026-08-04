import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Cairo_700Bold, Cairo_800ExtraBold, Cairo_900Black } from '@expo-google-fonts/cairo';
import { Tajawal_300Light, Tajawal_400Regular, Tajawal_500Medium } from '@expo-google-fonts/tajawal';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { I18nProvider } from '@/src/i18n';
import { colors } from '@/src/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Cairo_700Bold,
    Cairo_800ExtraBold,
    Cairo_900Black,
    Tajawal_300Light,
    Tajawal_400Regular,
    Tajawal_500Medium,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory } }} />
      </I18nProvider>
    </SafeAreaProvider>
  );
}
