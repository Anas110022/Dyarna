import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { CATEGORY_LABEL_KEY } from '@/src/lib/listingTypes';
import { fetchOwnListings, type ListingStatus, type OwnListingPreview } from '@/src/lib/account';
import { publishListingIfEligible } from '@/src/lib/listings';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';
import { PropertyCard } from '@/src/components/PropertyCard';

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

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

export default function MyListingsScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [listings, setListings] = useState<OwnListingPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

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
        const { data, error: fetchError } = await fetchOwnListings(user.id);
        if (cancelled) return;
        if (fetchError) {
          setError(true);
          setLoading(false);
          return;
        }
        setListings(data);
        setLoading(false);
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // Re-runs the exact same real, server-side eligibility check the
  // posting flow itself calls — never a client-side status change. Only
  // shown for a listing genuinely stuck at pending_review; if it's not
  // actually eligible yet (not verified, or fewer than 3 real photos),
  // this correctly reports that back rather than pretending to succeed.
  const handleRetryPublish = async (listingId: string) => {
    if (retryingId) return;
    setRetryingId(listingId);
    const { published, error: publishError } = await publishListingIfEligible(listingId);
    setRetryingId(null);
    if (publishError) {
      Alert.alert(t('postListing.errorPublishGeneric'));
      return;
    }
    if (!published) {
      Alert.alert(t('myListings.retryNotEligible'));
      return;
    }
    setListings((prev) => prev.map((l) => (l.id === listingId ? { ...l, status: 'published' } : l)));
  };

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  return (
    <View style={styles.flex}>
      <AppHeader title={t('account.myListings')} />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" message={t('account.loadError')} />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState icon="home-outline" message={t('myListings.empty')} />}
          renderItem={({ item }) => (
            <PropertyCard
              photoUrl={item.photoUrl}
              title={item.title}
              categoryLabel={t(CATEGORY_LABEL_KEY[item.category])}
              locationLabel={[item.area, item.city].filter(Boolean).join('، ')}
              priceLabel={`$${groupThousands(item.priceUsd)}`}
              onPress={() => router.push(`/listing/${item.id}`)}
              status={{ label: t(STATUS_LABEL_KEY[item.status]), tone: STATUS_TONE[item.status] }}
              footer={
                item.status === 'pending_review' ? (
                  <Pressable
                    style={styles.retryButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleRetryPublish(item.id);
                    }}
                    disabled={retryingId === item.id}
                    hitSlop={6}
                  >
                    {retryingId === item.id ? (
                      <ActivityIndicator size="small" color={theme.headingText} />
                    ) : (
                      <Text style={styles.retryButtonText}>{t('postListing.retryPublish')}</Text>
                    )}
                  </Pressable>
                ) : undefined
              }
            />
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
    retryButton: { alignSelf: 'flex-start', marginTop: spacing.xs, paddingVertical: 4 },
    retryButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText, textDecorationLine: 'underline' },
  });
}
