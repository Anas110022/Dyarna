import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { fetchNotifyOnListingPublished, setNotifyOnListingPublished } from '@/src/lib/account';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { LoadingState } from '@/src/components/LoadingState';

export default function NotificationSettingsScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [userId, setUserId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        setAuthRequired(true);
        return;
      }
      if (cancelled) return;
      setUserId(user.id);
      const result = await fetchNotifyOnListingPublished(user.id);
      if (cancelled) return;
      setEnabled(result.enabled);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async () => {
    if (!userId || saving) return;
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    const { error } = await setNotifyOnListingPublished(userId, next);
    setSaving(false);
    if (error) {
      setEnabled(!next);
    }
  };

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  return (
    <View style={styles.flex}>
      <AppHeader title={t('account.notificationSettings')} />

      {loading ? (
        <LoadingState />
      ) : (
        <View style={styles.content}>
          <View style={styles.card}>
            <Pressable style={styles.row} onPress={toggle} disabled={saving}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>{t('notificationSettings.listingPublishedLabel')}</Text>
                <Text style={styles.rowHint}>{t('notificationSettings.listingPublishedHint')}</Text>
              </View>
              <View style={[styles.switchTrack, enabled && styles.switchTrackOn]}>
                <View style={[styles.switchThumb, enabled && styles.switchThumbOn]} />
              </View>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    content: { padding: spacing.lg },
    card: { backgroundColor: theme.surface, borderRadius: radii.md, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, gap: spacing.md },
    rowInfo: { flex: 1, gap: 2 },
    rowLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    rowHint: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },

    switchTrack: { width: 40, height: 22, borderRadius: 11, backgroundColor: theme.surfaceAlt, padding: 2, justifyContent: 'center' },
    switchTrackOn: { backgroundColor: theme.brandFill },
    switchThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: theme.white, alignSelf: 'flex-start' },
    switchThumbOn: { alignSelf: 'flex-end' },
  });
}
