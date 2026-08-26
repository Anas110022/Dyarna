import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { sendPhoneOtp, resendEmailSignupOtp, verifyEmailSignupOtp, verifyPhoneOtp } from '@/src/lib/authService';
import { colors, fonts, spacing } from '@/src/theme';
import { OtpInput } from '@/src/components/OtpInput';
import { PillButton } from '@/src/components/PillButton';

// Supabase's own OTP codes are 6 digits (the design mockup shows 4 as a
// placeholder illustration, but the real code sent by Supabase is 6 digits).
const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function OtpScreen() {
  const { t } = useI18n();
  const { method, value } = useLocalSearchParams<{ method: 'phone' | 'email'; value: string }>();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const showError = (message: string) => Alert.alert(t('auth.errorTitle'), message);

  const handleConfirm = async () => {
    if (code.length < OTP_LENGTH) {
      showError(t('otp.errorIncomplete'));
      return;
    }
    setLoading(true);
    const { error } =
      method === 'phone' ? await verifyPhoneOtp(value, code) : await verifyEmailSignupOtp(value, code);
    setLoading(false);
    if (error) {
      showError(error || t('otp.errorInvalid'));
      return;
    }
    router.replace('/(tabs)');
  };

  const handleResend = async () => {
    if (secondsLeft > 0) return;
    const { error } = method === 'phone' ? await sendPhoneOtp(value) : await resendEmailSignupOtp(value);
    if (error) {
      showError(error);
      return;
    }
    setCode('');
    setSecondsLeft(RESEND_SECONDS);
  };

  return (
    <View style={styles.container}>
      <Ionicons name="shield-checkmark-outline" size={40} color={colors.gold} style={styles.icon} />
      <Text style={styles.title}>{t('otp.title')}</Text>
      <Text style={styles.subtitle}>
        {method === 'phone' ? t('otp.sentToPhone') : t('otp.sentToEmail')}
        {'\n'}
        <Text style={styles.subtitleValue}>{value}</Text>
      </Text>

      <OtpInput length={OTP_LENGTH} value={code} onChange={setCode} />

      <PillButton
        label={loading ? t('otp.verifying') : t('otp.confirm')}
        onPress={handleConfirm}
        loading={loading}
        style={styles.cta}
      />

      <Pressable onPress={handleResend} disabled={secondsLeft > 0}>
        <Text style={styles.resend}>
          {secondsLeft > 0 ? t('otp.resendIn', { seconds: formatSeconds(secondsLeft) }) : t('otp.resend')}
        </Text>
      </Pressable>
    </View>
  );
}

function formatSeconds(total: number): string {
  const s = String(total).padStart(2, '0');
  return `00:${s}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.pine,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  icon: {
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fonts.headingExtraBold,
    fontSize: 16,
    color: colors.ivory,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: 10,
    color: 'rgba(247,244,236,0.55)',
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  subtitleValue: {
    fontFamily: fonts.headingBold,
    color: colors.goldSoft,
  },
  cta: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    alignSelf: 'stretch',
  },
  resend: {
    fontFamily: fonts.bodyRegular,
    fontSize: 9.5,
    color: 'rgba(247,244,236,0.45)',
  },
});
