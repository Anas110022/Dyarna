import { useCallback, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { CATEGORY_LABEL_KEY } from '@/src/lib/listingTypes';
import { fetchOwnListings, type ListingStatus } from '@/src/lib/account';
import { fetchOwnBookingListings } from '@/src/lib/bookings';
import { BOOKING_TYPE_LABEL_KEY } from '@/src/lib/bookingTypes';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';
import { StatusBadge } from '@/src/components/StatusBadge';

const STATUS_LABEL_KEY: Record<ListingStatus, string> = {
  pending_review: 'myListings.statusPendingReview',
  published: 'myListings.statusPublished',
  rejected: 'myListings.statusRejected',
  archived: 'myListings.statusArchived',
};
const STATUS_TONE: Record<ListingStatus, 'pending' | 'success' | 'danger' | 'neutral'> = {
  pending_review: 'pending',
  published: 'success',
  rejected: 'danger',
  archived: 'neutral',
};

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// إحصائيات إعلاني — a single picker combining the owner's REAL properties
// from both real domains (public.listings and public.booking_listings),
// reusing the exact same fetch functions already used by my-listings.tsx /
// my-booking-listings.tsx — no new query, no duplicate system.
type PropertyItem = {
  id: string;
  kind: 'listing' | 'booking';
  title: string;
  typeLabel: string;
  location: string;
  priceUsd: number;
  status: ListingStatus;
  photoUrl: string | null;
};

export default function AdStatisticsScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [items, setItems] = useState<PropertyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        setLoading(true);
        setError(false);
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
        const [listingsResult, bookingResult] = await Promise.all([fetchOwnListings(user.id), fetchOwnBookingListings(user.id)]);
        if (cancelled) return;
        if (listingsResult.error || bookingResult.error) {
          setError(true);
          setLoading(false);
          return;
        }
        const combined: PropertyItem[] = [
          ...listingsResult.data.map((l) => ({
            id: l.id,
            kind: 'listing' as const,
            title: l.title,
            typeLabel: t(CATEGORY_LABEL_KEY[l.category]),
            location: [l.area, l.city].filter(Boolean).join('، '),
            priceUsd: l.priceUsd,
            status: l.status,
            photoUrl: l.photoUrl,
          })),
          ...bookingResult.data.map((b) => ({
            id: b.id,
            kind: 'booking' as const,
            title: b.title,
            typeLabel: t(BOOKING_TYPE_LABEL_KEY[b.bookingType]),
            location: [b.area, b.city].filter(Boolean).join('، '),
            priceUsd: b.priceUsd,
            status: b.status,
            photoUrl: b.photoUrl,
          })),
        ];
        setItems(combined);
        setLoading(false);
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [t])
  );

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  return (
    <View style={styles.flex}>
      <AppHeader title={t('adStatistics.pickerTitle')} />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" message={t('adStatistics.loadError')} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="stats-chart-outline"
          message={t('adStatistics.emptyMessage')}
          actionLabel={t('adStatistics.addPropertyButton')}
          onAction={() => router.push('/post-booking-listing')}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: '/ad-statistics-detail',
                  params: { id: item.id, type: item.kind, title: item.title, photoUrl: item.photoUrl ?? '' },
                })
              }
            >
              {item.photoUrl ? (
                <Image source={{ uri: item.photoUrl }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]}>
                  <Ionicons name="image-outline" size={20} color={theme.mutedText} />
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.cardType}>{item.typeLabel}</Text>
                {!!item.location && (
                  <View style={styles.locationRow}>
                    <Ionicons name="location-outline" size={11} color={theme.mutedText} />
                    <Text style={styles.cardLocation} numberOfLines={1}>
                      {item.location}
                    </Text>
                  </View>
                )}
                <View style={styles.bottomRow}>
                  <Text style={styles.cardPrice}>${groupThousands(item.priceUsd)}</Text>
                  <StatusBadge label={t(STATUS_LABEL_KEY[item.status])} tone={STATUS_TONE[item.status]} />
                </View>
              </View>
              <Ionicons name="chevron-back" size={16} color={theme.mutedText} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },

    listContent: { padding: spacing.lg, flexGrow: 1 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    photo: { width: 60, height: 60, borderRadius: radii.md, backgroundColor: theme.surfaceAlt },
    photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    cardBody: { flex: 1, gap: 2 },
    cardTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    cardType: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.accentGold },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    cardLocation: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    cardPrice: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.headingText },
  });
}
