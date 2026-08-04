import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { colors } from '@/src/theme';

const HAS_SEEN_INTRO_KEY = 'dyarna.hasSeenIntro';

type Destination = '/(onboarding)/intro' | '/(auth)/login' | '/(tabs)';

export default function Index() {
  const [destination, setDestination] = useState<Destination | null>(null);

  useEffect(() => {
    (async () => {
      const hasSeenIntro = await AsyncStorage.getItem(HAS_SEEN_INTRO_KEY);
      if (!hasSeenIntro) {
        setDestination('/(onboarding)/intro');
        return;
      }

      const hasSession = isSupabaseConfigured
        ? Boolean((await supabase.auth.getSession()).data.session)
        : false;
      setDestination(hasSession ? '/(tabs)' : '/(auth)/login');
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
