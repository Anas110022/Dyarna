import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { fetchOwnerListingStats, type OwnerListingStats } from '@/src/lib/analytics';
import { AppHeader } from '@/src/components/AppHeader';

type PeriodOption = { label: string; days: number | null };

function StatCard({ icon, label, value, theme }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; theme: ThemeColors }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.statCard}>
      <View style={styles.statIconWrap}>
        <Ionicons name={icon} size={18} color={theme.headingText} />
      </View>
      <View style={styles.statTextWrap}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

export default function AdStatisticsDetailScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { id, type, title, photoUrl } = useLocalSearchParams<{ id: string; type: 'listing' | 'booking'; title?: string; photoUrl?: string }>();

  const periods: PeriodOption[] = [
    { label: t('adStatistics.periodAll'), days: null },
    { label: t('adStatistics.period7'), days: 7 },
    { label: t('adStatistics.period30'), days: 30 },
    { label: t('adStatistics.period90'), days: 90 },
  ];

  const [periodDays, setPeriodDays] = useState<number | null>(null);
  const [stats, setStats] = useState<OwnerListingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id || !type) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      const target = type === 'listing' ? { listingId: id } : { bookingListingId: id };
      const { data, error: fetchError } = await fetchOwnerListingStats(target, periodDays);
      if (cancelled) return;
      if (fetchError || !data) {
        setError(true);
        setLoading(false);
        return;
      }
      setStats(data);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, type, periodDays]);

  const [{ todayISO, yesterdayISO }] = useState(() => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return { todayISO: now.toISOString().slice(0, 10), yesterdayISO: yesterday.toISOString().slice(0, 10) };
  });
  const trendDayLabel = (day: string) => {
    if (day === todayISO) return t('adStatistics.trendToday');
    if (day === yesterdayISO) return t('adStatistics.trendYesterday');
    return day;
  };

  return (
    <View style={styles.flex}>
      <AppHeader title={t('adStatistics.detailTitle')} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.propertyCard}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.propertyPhoto} />
          ) : (
            <View style={[styles.propertyPhoto, styles.propertyPhotoPlaceholder]}>
              <Ionicons name="image-outline" size={20} color={theme.mutedText} />
            </View>
          )}
          <Text style={styles.propertyTitle} numberOfLines={2}>
            {title}
          </Text>
        </View>

        <Text style={styles.fieldLabel}>{t('adStatistics.periodLabel')}</Text>
        <View style={styles.periodRow}>
          {periods.map((p) => (
            <Pressable
              key={p.label}
              style={[styles.periodChip, periodDays === p.days && styles.periodChipActive]}
              onPress={() => setPeriodDays(p.days)}
            >
              <Text style={[styles.periodChipText, periodDays === p.days && styles.periodChipTextActive]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.headingText} />
          </View>
        ) : error || !stats ? (
          <View style={styles.centered}>
            <Ionicons name="cloud-offline-outline" size={28} color={theme.mutedText} />
            <Text style={styles.emptyMessage}>{t('adStatistics.loadError')}</Text>
          </View>
        ) : (
          <>
            <View style={styles.statsGrid}>
              <StatCard icon="eye-outline" label={t('adStatistics.viewsLabel')} value={stats.viewsTotal} theme={theme} />
              {type === 'booking' && (
                <>
                  <StatCard icon="briefcase-outline" label={t('adStatistics.bookingRequestsLabel')} value={stats.bookingRequests} theme={theme} />
                  <StatCard icon="checkmark-circle-outline" label={t('adStatistics.bookingsAcceptedLabel')} value={stats.bookingsAccepted} theme={theme} />
                  <StatCard icon="close-circle-outline" label={t('adStatistics.bookingsRejectedLabel')} value={stats.bookingsRejected} theme={theme} />
                </>
              )}
              {type === 'listing' && (
                <StatCard icon="search-outline" label={t('adStatistics.matchedRequestsLabel')} value={stats.matchedRequests} theme={theme} />
              )}
            </View>

            {stats.viewsTrend.length > 0 && (
              <View style={styles.trendCard}>
                <Text style={styles.trendTitle}>{t('adStatistics.trendTitle')}</Text>
                {stats.viewsTrend
                  .slice()
                  .sort((a, b) => (a.day < b.day ? 1 : -1))
                  .map((point) => (
                    <View key={point.day} style={styles.trendRow}>
                      <Text style={styles.trendDay}>{trendDayLabel(point.day)}</Text>
                      <Text style={styles.trendCount}>{point.count}</Text>
                    </View>
                  ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
    centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xxl },
    emptyMessage: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, textAlign: 'center' },

    propertyCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    propertyPhoto: { width: 56, height: 56, borderRadius: radii.md, backgroundColor: theme.surfaceAlt },
    propertyPhotoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    propertyTitle: { flex: 1, fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText },

    fieldLabel: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, marginBottom: spacing.xs },
    periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    periodChip: { backgroundColor: theme.surface, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    periodChipActive: { backgroundColor: theme.brandFill },
    periodChipText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.mutedText },
    periodChipTextActive: { fontFamily: fonts.headingBold, color: theme.onBrandFill },

    statsGrid: { gap: spacing.sm },
    statCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
    },
    statIconWrap: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statTextWrap: { flex: 1 },
    statValue: { fontFamily: fonts.headingBlack, fontSize: fontSizes.sectionTitle, color: theme.headingText },
    statLabel: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText },

    trendCard: { backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md, marginTop: spacing.lg },
    trendTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.headingText, marginBottom: spacing.xs },
    trendRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    trendDay: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    trendCount: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText },
  });
}
