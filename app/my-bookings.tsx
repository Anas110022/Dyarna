import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { fetchMyReservations, updateReservationStatus, type ReservationSummary, type ReservationStatus } from '@/src/lib/bookings';
import { toISODate } from '@/src/components/DateRangeCalendar';
import { formatDateRange } from '@/src/lib/arabicDate';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';
import { StatusBadge } from '@/src/components/StatusBadge';

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const STATUS_LABEL_KEY: Record<ReservationStatus, string> = {
  pending: 'booking.statusPending',
  confirmed: 'booking.statusConfirmed',
  cancelled: 'booking.statusCancelled',
  rejected: 'booking.statusRejected',
  completed: 'booking.statusCompleted',
};

const STATUS_TONE: Record<ReservationStatus, 'pending' | 'success' | 'danger' | 'neutral'> = {
  pending: 'pending',
  confirmed: 'success',
  cancelled: 'danger',
  rejected: 'danger',
  completed: 'neutral',
};

type BookingTab = 'upcoming' | 'current' | 'past' | 'cancelled';

function bucketOf(r: ReservationSummary, todayIso: string): BookingTab {
  if (r.status === 'cancelled' || r.status === 'rejected') return 'cancelled';
  if (r.status === 'completed') return 'past';
  if (r.checkOut <= todayIso) return 'past';
  if (r.checkIn <= todayIso && r.checkOut > todayIso) return 'current';
  return 'upcoming';
}

const TABS: { key: BookingTab; labelKey: string }[] = [
  { key: 'upcoming', labelKey: 'booking.tabUpcoming' },
  { key: 'current', labelKey: 'booking.tabCurrent' },
  { key: 'past', labelKey: 'booking.tabPast' },
  { key: 'cancelled', labelKey: 'booking.tabCancelled' },
];

export default function MyBookingsScreen() {
  const { t, locale } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [reservations, setReservations] = useState<ReservationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [activeTab, setActiveTab] = useState<BookingTab>('upcoming');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

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
        const { data, error: fetchError } = await fetchMyReservations(user.id);
        if (cancelled) return;
        if (fetchError) {
          setError(true);
          setLoading(false);
          return;
        }
        setReservations(data);
        setLoading(false);
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const todayIso = useMemo(() => toISODate(new Date()), []);

  const grouped = useMemo(() => {
    const buckets: Record<BookingTab, ReservationSummary[]> = { upcoming: [], current: [], past: [], cancelled: [] };
    for (const r of reservations) {
      buckets[bucketOf(r, todayIso)].push(r);
    }
    return buckets;
  }, [reservations, todayIso]);

  const cancelReservation = (reservation: ReservationSummary) => {
    Alert.alert(t('booking.cancelBooking'), t('booking.cancelBookingConfirm'), [
      { text: t('account.cancel'), style: 'cancel' },
      {
        text: t('booking.cancelBooking'),
        style: 'destructive',
        onPress: async () => {
          setCancellingId(reservation.id);
          const { error: cancelError } = await updateReservationStatus(reservation.id, 'cancelled');
          setCancellingId(null);
          if (cancelError) {
            Alert.alert(t('booking.statusUpdateError'));
            return;
          }
          setReservations((prev) => prev.map((r) => (r.id === reservation.id ? { ...r, status: 'cancelled' } : r)));
          Alert.alert(t('booking.cancelSuccess'));
        },
      },
    ]);
  };

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  const currentList = grouped[activeTab];

  return (
    <View style={styles.flex}>
      <AppHeader title={t('booking.myBookings')} />

      <View style={styles.tabsRow}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{t(tab.labelKey)}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" message={t('booking.loadError')} />
      ) : (
        <FlatList
          data={currentList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState icon="calendar-outline" message={t('booking.noBookingsInTab')} />}
          renderItem={({ item }) => {
            const cancellable = (item.status === 'pending' || item.status === 'confirmed') && item.checkIn > todayIso;
            return (
              <Pressable style={styles.row} onPress={() => router.push(`/booking/${item.bookingListingId}`)}>
                {item.photoUrl ? (
                  <Image source={{ uri: item.photoUrl }} style={styles.photo} />
                ) : (
                  <View style={[styles.photo, styles.photoPlaceholder]}>
                    <Ionicons name="image-outline" size={18} color={theme.mutedText} />
                  </View>
                )}
                <View style={styles.info}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title} numberOfLines={1}>
                      {item.bookingListingTitle}
                    </Text>
                    <StatusBadge label={t(STATUS_LABEL_KEY[item.status])} tone={STATUS_TONE[item.status]} />
                  </View>
                  <View style={styles.locationRow}>
                    <Ionicons name="location-outline" size={11} color={theme.mutedText} />
                    <Text style={styles.location} numberOfLines={1}>
                      {[item.bookingListingArea, item.bookingListingCity].filter(Boolean).join('، ')}
                    </Text>
                  </View>
                  <Text style={styles.dates}>
                    {formatDateRange(item.checkIn, item.checkOut, locale)} · {t('booking.nightsCount', { count: item.nights })}
                  </Text>
                  <View style={styles.bottomRow}>
                    <Text style={styles.price}>${groupThousands(item.totalPriceUsd)}</Text>
                    {cancellable && (
                      <Pressable
                        style={styles.cancelButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          cancelReservation(item);
                        }}
                        disabled={cancellingId === item.id}
                      >
                        {cancellingId === item.id ? (
                          <ActivityIndicator size="small" color={theme.danger} />
                        ) : (
                          <Text style={styles.cancelButtonText}>{t('booking.cancelBooking')}</Text>
                        )}
                      </Pressable>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    tabsRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
    tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: theme.surface },
    tabActive: { backgroundColor: theme.brandFill },
    tabText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.mutedText },
    tabTextActive: { fontFamily: fonts.headingBold, color: theme.onBrandFill },

    listContent: { padding: spacing.lg, flexGrow: 1 },
    row: { flexDirection: 'row', gap: spacing.md, backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.sm },
    photo: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: theme.surfaceAlt },
    photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    info: { flex: 1, justifyContent: 'center', gap: 3 },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    title: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, flexShrink: 1 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    location: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    dates: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    price: { fontFamily: fonts.headingBlack, fontSize: fontSizes.body, color: theme.headingText },
    cancelButton: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
    cancelButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.danger },
  });
}
