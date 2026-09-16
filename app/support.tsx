import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { createSupportTicket, fetchOwnSupportTickets, type SupportTicket } from '@/src/lib/account';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { LoadingState } from '@/src/components/LoadingState';
import { FormInput } from '@/src/components/FormInput';

const STATUS_LABEL_KEY: Record<SupportTicket['status'], string> = {
  open: 'support.statusOpen',
  in_progress: 'support.statusInProgress',
  resolved: 'support.statusResolved',
};

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export default function SupportScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [userId, setUserId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        setLoading(true);
        setAuthRequired(false);
        const { data: authData } = await supabase.auth.getUser();
        const user = authData.user;
        if (!user) {
          if (!cancelled) {
            setLoading(false);
            setAuthRequired(true);
          }
          return;
        }
        if (cancelled) return;
        setUserId(user.id);
        const { data } = await fetchOwnSupportTickets(user.id);
        if (cancelled) return;
        setTickets(data);
        setLoading(false);
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const handleSubmit = async () => {
    if (!userId || message.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    const { error: submitError } = await createSupportTicket(userId, message.trim());
    setSubmitting(false);
    if (submitError) {
      setError(t('support.submitError'));
      return;
    }
    setMessage('');
    const { data } = await fetchOwnSupportTickets(userId);
    setTickets(data);
  };

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  return (
    <View style={styles.flex}>
      <AppHeader title={t('account.support')} />

      <FlatList
        data={tickets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.form}>
            <FormInput
              label={t('support.formLabel')}
              value={message}
              onChangeText={setMessage}
              placeholder={t('support.formPlaceholder')}
              multiline
              numberOfLines={5}
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
            <PrimaryButton
              label={t('support.submit')}
              onPress={handleSubmit}
              loading={submitting}
              disabled={message.trim().length === 0}
              style={styles.submitButton}
            />

            {tickets.length > 0 && <Text style={styles.sectionTitle}>{t('support.yourTickets')}</Text>}
          </View>
        }
        ListEmptyComponent={loading ? <LoadingState /> : null}
        renderItem={({ item }) => (
          <View style={styles.ticketCard}>
            <View style={styles.ticketHeader}>
              <Text style={styles.ticketStatus}>{t(STATUS_LABEL_KEY[item.status])}</Text>
              <Text style={styles.ticketDate}>{formatDate(item.createdAt)}</Text>
            </View>
            <Text style={styles.ticketMessage}>{item.message}</Text>
          </View>
        )}
      />
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    listContent: { padding: spacing.lg, flexGrow: 1 },

    form: { marginBottom: spacing.md },
    errorText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.danger, marginTop: spacing.sm },
    submitButton: { marginTop: spacing.md },

    sectionTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.mutedText, marginTop: spacing.xl, marginBottom: spacing.sm },

    ticketCard: { backgroundColor: theme.surface, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
    ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
    ticketStatus: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText },
    ticketDate: { fontFamily: fonts.bodyRegular, fontSize: 9, color: theme.mutedText },
    ticketMessage: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.bodyText, lineHeight: 18 },
  });
}
