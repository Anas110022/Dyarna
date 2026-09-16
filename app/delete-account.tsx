import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { deleteOwnAccount } from '@/src/lib/account';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { LoadingState } from '@/src/components/LoadingState';

export default function DeleteAccountScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);

  // This screen had no entry guard at all — a guest reaching it directly
  // would see the real delete-confirmation UI with nothing to actually
  // delete. The server itself would reject the call with no session, but
  // showing that as a real "you need an account" state is clearer.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setAuthRequired(!data.user);
      setCheckingAuth(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const performDelete = async () => {
    setDeleting(true);
    setError(null);
    const { error: deleteError } = await deleteOwnAccount();
    if (deleteError) {
      setDeleting(false);
      setError(t('deleteAccount.error'));
      return;
    }
    // The auth.users row (and everything cascading from it) is now really
    // gone server-side — just clear the now-invalid local session.
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  };

  const handleDeletePress = () => {
    Alert.alert(t('deleteAccount.finalConfirmTitle'), t('deleteAccount.finalConfirmBody'), [
      { text: t('account.cancel'), style: 'cancel' },
      { text: t('deleteAccount.confirmButton'), style: 'destructive', onPress: performDelete },
    ]);
  };

  if (checkingAuth) {
    return <LoadingState />;
  }

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  return (
    <View style={styles.flex}>
      <AppHeader title={t('deleteAccount.title')} />

      <View style={styles.content}>
        <Ionicons name="warning-outline" size={40} color={theme.danger} style={styles.icon} />
        <Text style={styles.warningTitle}>{t('deleteAccount.warningTitle')}</Text>
        <Text style={styles.warningBody}>{t('deleteAccount.warningBody')}</Text>

        <View style={styles.list}>
          {t('deleteAccount.willDeleteItems').split('|').map((item) => (
            <View key={item} style={styles.listItem}>
              <Ionicons name="close-circle" size={14} color={theme.danger} />
              <Text style={styles.listItemText}>{item}</Text>
            </View>
          ))}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]} onPress={handleDeletePress} disabled={deleting}>
          {deleting ? <ActivityIndicator color={theme.white} /> : <Text style={styles.deleteButtonText}>{t('deleteAccount.confirmButton')}</Text>}
        </Pressable>

        <Pressable onPress={() => router.back()} disabled={deleting}>
          <Text style={styles.cancelLink}>{t('account.cancel')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    content: { padding: spacing.lg, alignItems: 'center' },
    icon: { marginTop: spacing.lg, marginBottom: spacing.md },
    warningTitle: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.sectionTitle, color: theme.bodyText, textAlign: 'center', marginBottom: spacing.sm },
    warningBody: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.body, color: theme.mutedText, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },

    list: { alignSelf: 'stretch', backgroundColor: theme.surface, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.xl },
    listItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    listItemText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.bodyText, flexShrink: 1 },

    errorText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.danger, marginBottom: spacing.md },

    deleteButton: { backgroundColor: theme.danger, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center', alignSelf: 'stretch' },
    deleteButtonDisabled: { opacity: 0.6 },
    deleteButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.white },
    cancelLink: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.mutedText, marginTop: spacing.lg },
  });
}
