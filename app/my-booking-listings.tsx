import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { BOOKING_TYPE_LABEL_KEY, isAccommodationType } from '@/src/lib/bookingTypes';
import { fetchOwnBookingListings, pauseBookingListing, resumeBookingListing, type OwnBookingListingPreview } from '@/src/lib/bookings';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';
import { PropertyCard } from '@/src/components/PropertyCard';

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const STATUS_LABEL_KEY: Record<OwnBookingListingPreview['status'], string> = {
  pending_review: 'myListings.statusPendingReview',
  published: 'myListings.statusPublished',
  rejected: 'myListings.statusRejected',
  archived: 'myListings.statusArchived',
};

const STATUS_TONE: Record<OwnBookingListingPreview['status'], 'pending' | 'success' | 'danger' | 'neutral'> = {
  pending_review: 'pending',
  published: 'success',
  rejected: 'danger',
  archived: 'neutral',
};

export default function MyBookingListingsScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [listings, setListings] = useState<OwnBookingListingPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    setAuthRequired(false);
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setLoading(false);
      setAuthRequired(true);
      return;
    }
    const { data, error: fetchError } = await fetchOwnBookingListings(user.id);
    if (fetchError) {
      setError(true);
      setLoading(false);
      return;
    }
    setListings(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handlePause = (item: OwnBookingListingPreview) => {
    Alert.alert(t('booking.pauseListing'), t('booking.pauseListingConfirm'), [
      { text: t('account.cancel'), style: 'cancel' },
      {
        text: t('booking.pauseListing'),
        style: 'destructive',
        onPress: async () => {
          setBusyId(item.id);
          const { error } = await pauseBookingListing(item.id);
          setBusyId(null);
          if (!error) setListings((prev) => prev.map((l) => (l.id === item.id ? { ...l, status: 'archived' } : l)));
        },
      },
    ]);
  };

  const handleResume = async (item: OwnBookingListingPreview) => {
    setBusyId(item.id);
    const { published, error } = await resumeBookingListing(item.id);
    setBusyId(null);
    if (error) return;
    if (!published) {
      Alert.alert(t('booking.resumeNotEligible'));
      setListings((prev) => prev.map((l) => (l.id === item.id ? { ...l, status: 'pending_review' } : l)));
      return;
    }
    setListings((prev) => prev.map((l) => (l.id === item.id ? { ...l, status: 'published' } : l)));
  };

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  return (
    <View style={styles.flex}>
      <AppHeader
        title={t('booking.myBookingListings')}
        rightElement={
          <Pressable style={styles.headerAddButton} onPress={() => router.push('/post-booking-listing')} hitSlop={12}>
            <Ionicons name="add-circle-outline" size={24} color={theme.headingText} />
          </Pressable>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" message={t('account.loadError')} />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              icon="bed-outline"
              message={t('booking.myBookingListingsEmpty')}
              actionLabel={t('booking.addBookingListing')}
              onAction={() => router.push('/post-booking-listing')}
            />
          }
          renderItem={({ item }) => {
            const busy = busyId === item.id;
            const accommodation = isAccommodationType(item.bookingType);
            return (
              <PropertyCard
                photoUrl={item.photoUrl}
                title={item.title}
                categoryLabel={t(BOOKING_TYPE_LABEL_KEY[item.bookingType])}
                locationLabel={[item.area, item.city].filter(Boolean).join('، ')}
                priceLabel={
                  accommodation
                    ? t('booking.pricePerNight', { price: groupThousands(item.priceUsd) })
                    : t('booking.pricePerEvent', { price: groupThousands(item.priceUsd) })
                }
                onPress={() => router.push(`/booking-settings/${item.id}`)}
                status={{ label: t(STATUS_LABEL_KEY[item.status]), tone: STATUS_TONE[item.status] }}
                footer={
                  item.status === 'published' || item.status === 'archived' ? (
                    <Pressable
                      style={item.status === 'published' ? styles.pauseButton : styles.resumeButton}
                      disabled={busy}
                      onPress={(e) => {
                        e.stopPropagation();
                        if (item.status === 'published') handlePause(item);
                        else handleResume(item);
                      }}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={item.status === 'published' ? theme.danger : theme.headingText} />
                      ) : (
                        <Text style={item.status === 'published' ? styles.pauseButtonText : styles.resumeButtonText}>
                          {item.status === 'published' ? t('booking.pauseListing') : t('booking.resumeListing')}
                        </Text>
                      )}
                    </Pressable>
                  ) : undefined
                }
              />
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
    headerAddButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    listContent: { padding: spacing.lg, flexGrow: 1 },

    pauseButton: { alignSelf: 'flex-start', marginTop: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: theme.danger, borderRadius: radii.sm },
    pauseButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.danger },
    resumeButton: { alignSelf: 'flex-start', marginTop: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: theme.headingText, borderRadius: radii.sm },
    resumeButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText },
  });
}
