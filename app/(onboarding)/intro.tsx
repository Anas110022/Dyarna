import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useI18n } from '@/src/i18n';
import { colors, fonts, radii, spacing } from '@/src/theme';

const HAS_SEEN_INTRO_KEY = 'dyarna.hasSeenIntro';

export default function IntroScreen() {
  const { t } = useI18n();

  const finishIntro = async () => {
    await AsyncStorage.setItem(HAS_SEEN_INTRO_KEY, 'true');
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>{t('common.appName')}</Text>
      <Text style={styles.title}>{t('onboarding.slide1Title')}</Text>
      <Text style={styles.body}>{t('onboarding.slide1Body')}</Text>
      <Text style={styles.note}>
        الشاشات الثلاث الكاملة (مع السلايدات وpagination dots) رح تُبنى بالمرحلة الجاية — هاي نسخة مؤقتة للتأكد من
        عمل التنقل والخطوط والـ RTL.
      </Text>
      <Pressable style={styles.button} onPress={finishIntro}>
        <Text style={styles.buttonText}>{t('onboarding.start')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.pine,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  eyebrow: {
    fontFamily: fonts.headingBlack,
    fontSize: 28,
    color: colors.gold,
  },
  title: {
    fontFamily: fonts.headingExtraBold,
    fontSize: 20,
    color: colors.white,
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    color: colors.goldSoft,
    textAlign: 'center',
  },
  note: {
    fontFamily: fonts.bodyLight,
    fontSize: 11,
    color: colors.goldSoft,
    textAlign: 'center',
    opacity: 0.7,
    marginTop: spacing.lg,
  },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  buttonText: {
    fontFamily: fonts.headingBold,
    fontSize: 14,
    color: colors.pine,
  },
});
