import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { useI18n } from '@/src/i18n';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import { colors, fonts, radii, spacing } from '@/src/theme';

export default function LoginScreen() {
  const { t } = useI18n();

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>{t('common.appName')}</Text>
      <Text style={styles.subtitle}>{t('auth.signIn')} / {t('auth.signUp')}</Text>
      <Text style={styles.note}>{t('auth.placeholder')}</Text>

      {!isSupabaseConfigured && (
        <Text style={styles.warning}>
          Supabase مو مربوط بعد — عبّي EXPO_PUBLIC_SUPABASE_URL و EXPO_PUBLIC_SUPABASE_ANON_KEY بملف .env
        </Text>
      )}

      {/* TEMPORARY: bypasses real auth so the tab shell is reachable before
          the phone/email + OTP screens are built in the next phase. Remove
          once real Supabase auth ships. */}
      <Pressable style={styles.button} onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.buttonText}>معاينة الشاشات الرئيسية (مؤقت)</Text>
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
    gap: spacing.sm,
  },
  logo: {
    fontFamily: fonts.headingBlack,
    fontSize: 32,
    color: colors.gold,
  },
  subtitle: {
    fontFamily: fonts.headingBold,
    fontSize: 15,
    color: colors.white,
  },
  note: {
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    color: colors.goldSoft,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  warning: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
    color: '#E4A45F',
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  button: {
    marginTop: spacing.xxl,
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  buttonText: {
    fontFamily: fonts.headingBold,
    fontSize: 13,
    color: colors.pine,
  },
});
