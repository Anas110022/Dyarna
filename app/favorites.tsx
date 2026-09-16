import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { useI18n } from '@/src/i18n';
import { spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { CATEGORY_LABEL_KEY } from '@/src/lib/listingTypes';
import { fetchFavoriteListings } from '@/src/lib/favorites';
import type { ListingPreview } from '@/src/lib/listings';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';
import { PropertyCard } from '@/src/components/PropertyCard';

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default function FavoritesScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [listings, setListings] = useState<ListingPreview[]>([]);
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
        const { data, error: fetchError } = await fetchFavoriteListings(user.id);
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

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  return (
    <View style={styles.flex}>
      <AppHeader title={t('home.favorites')} />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" message={t('account.loadError')} />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState icon="heart-outline" message={t('favorites.empty')} />}
          renderItem={({ item }) => (
            <PropertyCard
              photoUrl={item.photoUrl}
              title={item.title}
              categoryLabel={t(CATEGORY_LABEL_KEY[item.category])}
              locationLabel={[item.area, item.city].filter(Boolean).join('، ')}
              priceLabel={`$${groupThousands(item.priceUsd)}`}
              onPress={() => router.push(`/listing/${item.id}`)}
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
  });
}
