import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { isSupabaseConfigured } from '@/src/lib/supabase';
import { isValidEmail, isValidLocalNumber, toE164 } from '@/src/lib/phone';
import { DEFAULT_COUNTRY, type CountryCode } from '@/src/lib/countryCodes';
import { sendPhoneOtp, signUpWithEmail, resendEmailSignupOtp } from '@/src/lib/authService';
import { colors, fonts, spacing } from '@/src/theme';
import { EagleLogo } from '@/src/components/EagleLogo';
import { PillButton } from '@/src/components/PillButton';
import { PhoneInput } from '@/src/components/PhoneInput';

type AuthMode = 'signup' | 'signin';
type AuthMethod = 'phone' | 'email';

export default function LoginScreen() {
  const { t, locale, setLocale } = useI18n();
  const params = useLocalSearchParams<{ mode?: AuthMode; redirect?: string; intent?: string }>();

  // Guest Mode return-to-origin: whatever screen/action sent the guest here
  // rides along as plain route params, untouched by this screen, and gets
  // forwarded to /otp so the real destination is known only once
  // verification actually succeeds (see app/(auth)/otp.tsx).
  const otpParams = { redirect: params.redirect, intent: params.intent };

  // Guest Mode: this screen is no longer only the mandatory startup
  // destination — a signed-out user can now also reach it voluntarily
  // (tapping "تسجيل الدخول"/"إنشاء حساب" from a guest-mode prompt), so it
  // needs a real way back to guest browsing instead of being a dead end.
  const closeToGuestMode = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const [mode, setMode] = useState<AuthMode>(params.mode === 'signin' ? 'signin' : 'signup');
  const [method, setMethod] = useState<AuthMethod>('phone');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const showError = (message: string) => Alert.alert(t('auth.errorTitle'), message);

  const handleSubmit = async () => {
    if (mode === 'signup' && !fullName.trim()) {
      showError(t('auth.errorFullNameRequired'));
      return;
    }

    if (method === 'phone') {
      if (!isValidLocalNumber(phone, phoneCountry)) {
        showError(t('auth.errorPhoneInvalid'));
        return;
      }
      const phoneE164 = toE164(phone, phoneCountry);
      setLoading(true);
      const { error } = await sendPhoneOtp(phoneE164, mode === 'signup' ? fullName.trim() : undefined);
      setLoading(false);
      if (error) {
        showError(error);
        return;
      }
      router.push({ pathname: '/(auth)/otp', params: { method: 'phone', value: phoneE164, mode, ...otpParams } });
      return;
    }

    // method === 'email' — real 6-digit OTP for both signup and sign-in.
    // Dyarna's email auth never checks a password to log in: signup still
    // collects one (used later for the "change password" account setting),
    // but sign-in only ever sends a fresh code to an existing account —
    // resendEmailSignupOtp hits the same email-otp Edge Function's
    // 'resend' action, which needs no password and works for any real,
    // already-registered email.
    if (!isValidEmail(email)) {
      showError(t('auth.errorEmailInvalid'));
      return;
    }

    setLoading(true);
    if (mode === 'signup') {
      if (password.length < 6) {
        setLoading(false);
        showError(t('auth.errorPasswordTooShort'));
        return;
      }
      const { error } = await signUpWithEmail(email.trim(), password, fullName.trim());
      setLoading(false);
      if (error) {
        showError(error);
        return;
      }
      router.push({ pathname: '/(auth)/otp', params: { method: 'email', value: email.trim(), mode: 'signup', ...otpParams } });
    } else {
      const { error } = await resendEmailSignupOtp(email.trim());
      setLoading(false);
      if (error === 'account_not_found') {
        showError(t('auth.errorAccountNotFound'));
        return;
      }
      if (error) {
        showError(error);
        return;
      }
      router.push({ pathname: '/(auth)/otp', params: { method: 'email', value: email.trim(), mode: 'signin', ...otpParams } });
    }
  };

  const ctaLabel =
    mode === 'signup'
      ? method === 'phone'
        ? t('auth.ctaSignupPhone')
        : t('auth.ctaSignupEmail')
      : method === 'phone'
        ? t('auth.ctaSigninPhone')
        : t('auth.ctaSigninEmail');

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView edges={['top']} style={styles.closeButtonSafeArea} pointerEvents="box-none">
        <Pressable style={styles.closeButton} onPress={closeToGuestMode} hitSlop={12}>
          <Ionicons name="close" size={20} color={colors.goldSoft} />
        </Pressable>
      </SafeAreaView>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <EagleLogo size={42} />
          <Text style={styles.wordmark}>{t('common.appName')}</Text>
        </View>

        <View style={styles.langRow}>
          <Pressable onPress={() => setLocale('ar')}>
            <Text style={[styles.langOption, locale === 'ar' && styles.langOptionActive]}>{t('auth.langAr')}</Text>
          </Pressable>
          <Pressable onPress={() => setLocale('en')}>
            <Text style={[styles.langOption, locale === 'en' && styles.langOptionActive]}>{t('auth.langEn')}</Text>
          </Pressable>
        </View>

        <View style={styles.tabRow}>
          <Pressable style={[styles.tab, mode === 'signup' && styles.tabActive]} onPress={() => setMode('signup')}>
            <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>{t('auth.signUp')}</Text>
          </Pressable>
          <Pressable style={[styles.tab, mode === 'signin' && styles.tabActive]} onPress={() => setMode('signin')}>
            <Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>{t('auth.signIn')}</Text>
          </Pressable>
        </View>

        <View style={styles.methodRow}>
          <Pressable onPress={() => setMethod('phone')}>
            <Text style={[styles.methodOption, method === 'phone' && styles.methodOptionActive]}>
              {t('auth.methodPhone')}
            </Text>
          </Pressable>
          <Pressable onPress={() => setMethod('email')}>
            <Text style={[styles.methodOption, method === 'email' && styles.methodOptionActive]}>
              {t('auth.methodEmail')}
            </Text>
          </Pressable>
        </View>

        {mode === 'signup' && (
          <Field>
            <Text style={styles.label}>{t('auth.fullName')}</Text>
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={14} color={colors.goldSoft} />
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder={t('auth.fullNamePlaceholder')}
                placeholderTextColor="rgba(247,244,236,0.35)"
              />
            </View>
          </Field>
        )}

        {method === 'phone' ? (
          <Field>
            <Text style={styles.label}>{t('auth.phone')}</Text>
            <PhoneInput
              variant="dark"
              country={phoneCountry}
              onCountryChange={setPhoneCountry}
              value={phone}
              onChangeText={setPhone}
              placeholder={t('auth.phonePlaceholder')}
            />
          </Field>
        ) : (
          <>
            <Field>
              <Text style={styles.label}>{t('auth.email')}</Text>
              <View style={styles.inputRow}>
                <Ionicons name="mail-outline" size={14} color={colors.goldSoft} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor="rgba(247,244,236,0.35)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  textContentType="emailAddress"
                  textAlign="left"
                />
              </View>
            </Field>
            {mode === 'signup' && (
              <Field>
                <Text style={styles.label}>{t('auth.password')}</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="lock-closed-outline" size={14} color={colors.goldSoft} />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t('auth.passwordPlaceholder')}
                    placeholderTextColor="rgba(247,244,236,0.35)"
                    secureTextEntry
                    textContentType="password"
                    textAlign="left"
                  />
                </View>
              </Field>
            )}
          </>
        )}

        <Text style={styles.otpHint}>{method === 'phone' ? t('auth.otpHintPhone') : t('auth.otpHintEmail')}</Text>

        {!isSupabaseConfigured && <Text style={styles.warning}>{t('auth.supabaseNotConfigured')}</Text>}

        <PillButton
          label={loading ? t('auth.sending') : ctaLabel}
          onPress={handleSubmit}
          loading={loading}
          style={styles.cta}
        />

        <Text style={styles.terms}>{t('auth.termsFooter')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <View style={styles.field}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.pine,
  },
  closeButtonSafeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'flex-end',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  wordmark: {
    fontFamily: fonts.headingBlack,
    fontSize: 22,
    color: colors.goldSoft,
    marginTop: spacing.sm,
  },
  langRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  langOption: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: 'rgba(247,244,236,0.4)',
    paddingBottom: 4,
  },
  langOptionActive: {
    color: colors.goldSoft,
    fontFamily: fonts.headingBold,
    borderBottomWidth: 2,
    borderBottomColor: colors.gold,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 3,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 1,
    borderRadius: 9,
  },
  tabActive: {
    backgroundColor: colors.gold,
  },
  tabText: {
    fontFamily: fonts.headingBold,
    fontSize: 11,
    color: 'rgba(247,244,236,0.55)',
  },
  tabTextActive: {
    color: colors.pine,
  },
  methodRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  methodOption: {
    fontFamily: fonts.headingBold,
    fontSize: 11,
    color: 'rgba(247,244,236,0.4)',
    paddingBottom: 4,
  },
  methodOptionActive: {
    color: colors.goldSoft,
    borderBottomWidth: 2,
    borderBottomColor: colors.gold,
  },
  field: {
    marginBottom: spacing.sm + 2,
  },
  label: {
    fontFamily: fonts.bodyRegular,
    fontSize: 10,
    color: 'rgba(247,244,236,0.6)',
    marginBottom: spacing.xs + 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,95,0.35)',
    borderRadius: 13,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  prefix: {
    fontFamily: fonts.headingBold,
    fontSize: 13,
    color: colors.goldSoft,
  },
  input: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.ivory,
    padding: 0,
  },
  otpHint: {
    fontFamily: fonts.bodyRegular,
    fontSize: 9.5,
    color: 'rgba(247,244,236,0.4)',
    marginBottom: spacing.md,
  },
  warning: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
    color: '#E4A45F',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  cta: {
    marginBottom: spacing.md,
  },
  terms: {
    fontFamily: fonts.bodyRegular,
    fontSize: 9,
    color: 'rgba(247,244,236,0.4)',
    textAlign: 'center',
    lineHeight: 16,
  },
});
