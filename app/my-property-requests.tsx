import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { CATEGORY_LABEL_KEY } from '@/src/lib/listingTypes';
import { fetchMyPropertyRequests, type PropertyRequest, type PropertyRequestStatus } from '@/src/lib/propertyRequests';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';
import { StatusBadge } from '@/src/components/StatusBadge';

const STATUS_LABEL_KEY: Record<PropertyRequestStatus, string> = {
  active: 'propertyRequest.statusActive',
  closed: 'propertyRequest.statusClosed',
  cancelled: 'propertyRequest.statusCancelled',
};

const STATUS_TONE: Record<PropertyRequestStatus, 'pending' | 'success' | 'danger' | 'neutral'> = {
  active: 'success',
  closed: 'neutral',
  cancelled: 'danger',
};

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function budgetText(item: PropertyRequest, t: (k: string, p?: Record<string, string | number>) => string): string {
  if (item.minPriceUsd == null && item.maxPriceUsd == null) return t('propertyRequest.budgetNotSpecified');
  if (item.minPriceUsd != null && item.maxPriceUsd != null) {
    return `${t('propertyRequest.priceFrom')} $${groupThousands(item.minPriceUsd)} ${t('propertyRequest.priceTo')} $${groupThousands(item.maxPriceUsd)}`;
  }
  if (item.minPriceUsd != null) return `${t('propertyRequest.priceFrom')} $${groupThousands(item.minPriceUsd)}`;
  return `${t('propertyRequest.priceTo')} $${groupThousands(item.maxPriceUsd!)}`;
}

export default function MyPropertyRequestsScreen() {
  const { t, locale } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [requests, setRequests] = useState<PropertyRequest[]>([]);
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
        if (!authData.user) {
          if (!cancelled) {
            setLoading(false);
            setAuthRequired(true);
          }
          return;
        }
        const { data, error: fetchError } = await fetchMyPropertyRequests();
        if (cancelled) return;
        if (fetchError) {
          setError(true);
          setLoading(false);
          return;
        }
        setRequests(data);
        setLoading(false);
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  return (
    <View style={styles.flex}>
      <AppHeader title={t('propertyRequest.myRequests')} />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" message={t('propertyRequest.loadError')} />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState icon="search-outline" message={t('propertyRequest.myRequestsEmpty')} />}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/property-request/${item.id}`)}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>
                  {t(item.requestType === 'rent' ? 'propertyRequest.requestTypeRent' : 'propertyRequest.requestTypeSale')} · {t(CATEGORY_LABEL_KEY[item.propertyType])}
                </Text>
                <StatusBadge label={t(STATUS_LABEL_KEY[item.status])} tone={STATUS_TONE[item.status]} />
              </View>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={12} color={theme.mutedText} />
                <Text style={styles.locationText} numberOfLines={1}>
                  {[item.neighborhood, item.city, locale === 'ar' ? item.governorateNameAr : item.governorateNameEn].filter(Boolean).join('، ')}
                </Text>
              </View>
              <Text style={styles.budgetText}>{budgetText(item, t)}</Text>
              {item.minRooms != null && <Text style={styles.roomsText}>{t('propertyRequest.roomsLabel')}: {item.minRooms}+</Text>}
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
    card: { backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.sm, gap: 6 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, flexShrink: 1 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    locationText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, flexShrink: 1 },
    budgetText: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.headingText },
    roomsText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
  });
}
