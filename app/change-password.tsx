import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { fetchOwnProfile } from '@/src/lib/listings';
import { changePassword } from '@/src/lib/account';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { FormInput } from '@/src/components/FormInput';

export default function ChangePasswordScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<'phone' | 'email' | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        setAuthRequired(true);
        return;
      }
      const own = await fetchOwnProfile(user.id);
      if (cancelled) return;
      setEmail(own.email);
      setAuthMethod(own.authMethod);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    if (!email) return;
    if (currentPassword.length === 0) {
      setError(t('changePassword.errorCurrentRequired'));
      return;
    }
    if (newPassword.length < 6) {
      setError(t('auth.errorPasswordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('changePassword.errorMismatch'));
      return;
    }

    setSaving(true);
    setError(null);
    const { error: changeError } = await changePassword(email, currentPassword, newPassword);
    setSaving(false);

    if (changeError === 'current_password_incorrect') {
      setError(t('changePassword.errorCurrentIncorrect'));
      return;
    }
    if (changeError) {
      setError(t('changePassword.errorGeneric'));
      return;
    }
    setSuccess(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  return (
    <View style={styles.flex}>
      <AppHeader title={t('account.changePassword')} />

      {loading ? (
        <LoadingState />
      ) : authMethod === 'phone' ? (
        <EmptyState icon="call-outline" message={t('changePassword.notApplicablePhone')} />
      ) : success ? (
        <EmptyState icon="checkmark-circle" message={t('changePassword.successMessage')} />
      ) : (
        <View style={styles.content}>
          <FormInput
            label={t('changePassword.currentPassword')}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            placeholder={t('auth.passwordPlaceholder')}
            containerStyle={styles.field}
          />

          <FormInput
            label={t('changePassword.newPassword')}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder={t('auth.passwordPlaceholder')}
            containerStyle={styles.field}
          />

          <FormInput
            label={t('changePassword.confirmPassword')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder={t('auth.passwordPlaceholder')}
            containerStyle={styles.field}
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <PrimaryButton label={t('editProfile.save')} onPress={handleSave} loading={saving} style={styles.saveButton} />
        </View>
      )}
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    content: { padding: spacing.lg },
    field: { marginBottom: spacing.lg },
    errorText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.danger, marginTop: spacing.xs },
    saveButton: { marginTop: spacing.md },
  });
}
