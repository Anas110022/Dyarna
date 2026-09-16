import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { fetchOwnerReservations, updateReservationStatus, type OwnerReservationSummary, type ReservationStatus } from '@/src/lib/bookings';
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

export default function OwnerBookingsScreen() {
  const { t, locale } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [reservations, setReservations] = useState<OwnerReservationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);

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
        setOwnerId(user.id);
        const { data, error: fetchError } = await fetchOwnerReservations(user.id);
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

  const applyStatus = async (reservationId: string, status: ReservationStatus) => {
    setUpdatingId(reservationId);
    const { error: updateError } = await updateReservationStatus(reservationId, status);
    setUpdatingId(null);
    if (updateError) return { error: updateError };
    setReservations((prev) => prev.map((r) => (r.id === reservationId ? { ...r, status } : r)));
    return { error: null };
  };

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  const todayIso = toISODate(new Date());

  return (
    <View style={styles.flex}>
      <AppHeader title={t('booking.ownerBookingsTitle')} />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" message={t('booking.loadError')} />
      ) : (
        <FlatList
          data={reservations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState icon="calendar-outline" message={t('booking.ownerBookingsEmpty')} />}
          renderItem={({ item }) => {
            const busy = updatingId === item.id;
            const canComplete = item.status === 'confirmed' && item.checkOut <= todayIso;
            return (
              <Pressable style={styles.row} onPress={() => ownerId && router.push(`/booking/${item.bookingListingId}`)}>
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
                  <Text style={styles.guestName} numberOfLines={1}>
                    {t('booking.guestLabel')}: {item.guestFullName ?? '—'}
                  </Text>
                  <Text style={styles.dates}>
                    {formatDateRange(item.checkIn, item.checkOut, locale)} · {t('booking.nightsCount', { count: item.nights })}
                  </Text>
                  <Text style={styles.price}>${groupThousands(item.totalPriceUsd)}</Text>

                  {item.status === 'pending' && (
                    <View style={styles.actionsRow}>
                      <Pressable
                        style={styles.confirmButton}
                        disabled={busy}
                        onPress={(e) => {
                          e.stopPropagation();
                          applyStatus(item.id, 'confirmed');
                        }}
                      >
                        {busy ? <ActivityIndicator size="small" color={theme.white} /> : <Text style={styles.confirmButtonText}>{t('booking.confirmReservation')}</Text>}
                      </Pressable>
                      <Pressable
                        style={styles.rejectButton}
                        disabled={busy}
                        onPress={(e) => {
                          e.stopPropagation();
                          applyStatus(item.id, 'rejected');
                        }}
                      >
                        <Text style={styles.rejectButtonText}>{t('booking.rejectReservation')}</Text>
                      </Pressable>
                    </View>
                  )}

                  {item.status === 'confirmed' && (
                    <View style={styles.actionsRow}>
                      {canComplete && (
                        <Pressable
                          style={styles.confirmButton}
                          disabled={busy}
                          onPress={(e) => {
                            e.stopPropagation();
                            applyStatus(item.id, 'completed');
                          }}
                        >
                          {busy ? <ActivityIndicator size="small" color={theme.white} /> : <Text style={styles.confirmButtonText}>{t('booking.markCompleted')}</Text>}
                        </Pressable>
                      )}
                      <Pressable
                        style={styles.rejectButton}
                        disabled={busy}
                        onPress={(e) => {
                          e.stopPropagation();
                          applyStatus(item.id, 'cancelled');
                        }}
                      >
                        <Text style={styles.rejectButtonText}>{t('booking.cancelBooking')}</Text>
                      </Pressable>
                    </View>
                  )}
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
    listContent: { padding: spacing.lg, flexGrow: 1 },
    row: { flexDirection: 'row', gap: spacing.md, backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.sm },
    photo: { width: 64, height: 64, borderRadius: radii.md, backgroundColor: theme.surfaceAlt },
    photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    info: { flex: 1, justifyContent: 'center', gap: 3 },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    title: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, flexShrink: 1 },
    guestName: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.bodyText },
    dates: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    price: { fontFamily: fonts.headingBlack, fontSize: fontSizes.bodySmall, color: theme.headingText, marginTop: 2 },

    actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    confirmButton: { flex: 1, backgroundColor: theme.brandFill, borderRadius: radii.sm, paddingVertical: spacing.sm, alignItems: 'center', justifyContent: 'center' },
    confirmButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.white },
    rejectButton: { flex: 1, borderWidth: 1, borderColor: theme.danger, borderRadius: radii.sm, paddingVertical: spacing.sm, alignItems: 'center', justifyContent: 'center' },
    rejectButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.danger },
  });
}
