import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { colors } from '@/src/theme';

const HAS_SEEN_INTRO_KEY = 'dyarna.hasSeenIntro';

type Destination = '/(onboarding)/intro' | '/(tabs)';

export default function Index() {
  const [destination, setDestination] = useState<Destination | null>(null);

  // Guest Mode: session or no session, every returning launch goes straight
  // to the real tabs — Home is guest-accessible, so there is no more
  // "logged out" startup destination. Only a genuinely first-ever launch
  // still shows the onboarding intro. Individual gated actions (favorite,
  // contact, chat, post, review...) are what actually prompt sign-in, each
  // screen checks its own real session for that — not app startup.
  useEffect(() => {
    (async () => {
      let next: Destination = '/(tabs)';
      try {
        const hasSeenIntro = await AsyncStorage.getItem(HAS_SEEN_INTRO_KEY);
        if (!hasSeenIntro) {
          next = '/(onboarding)/intro';
        }
      } finally {
        // Hide the real native splash only once we actually know where to
        // go — so the app goes straight from the real logo to the real
        // destination, never exposing this screen's own fallback spinner
        // in between on a normal launch.
        SplashScreen.hideAsync();
        setDestination(next);
      }
    })();
  }, []);

  if (!destination) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pine }}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return <Redirect href={destination} />;
}
