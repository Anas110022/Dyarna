import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { PROJECT_TYPE_LABEL_KEY, DELIVERY_STATUS_LABEL_KEY } from '@/src/lib/projectTypes';
import { fetchPublishedProjects, type PublishedProjectCard } from '@/src/lib/projects';
import { LoadingState } from '@/src/components/LoadingState';
import { EmptyState } from '@/src/components/EmptyState';
import { ProjectCard } from '@/src/components/ProjectCard';

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default function ProjectsScreen() {
  const { t, locale } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [projects, setProjects] = useState<PublishedProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  // Guards against a fetch resolving after this screen is no longer the
  // one on screen (e.g. a quick tab switch away and back) — load is
  // called both automatically on focus and directly from the retry
  // button/pull-to-refresh, so a single ref covers every call site.
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(false);
    const { data, error: fetchError } = await fetchPublishedProjects();
    if (!mountedRef.current) return;
    if (fetchError) {
      setError(true);
    } else {
      setProjects(data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.flex}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <Text style={styles.headerTitle}>{t('projects.title')}</Text>
      </SafeAreaView>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <EmptyState
          icon="cloud-offline-outline"
          message={t('projects.loadError')}
          actionLabel={t('common.retry')}
          onAction={() => load()}
        />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.headingText} />}
          ListEmptyComponent={<EmptyState icon="business-outline" message={t('projects.emptyBody')} />}
          renderItem={({ item }) => (
            <ProjectCard
              coverPhotoUrl={item.coverPhotoUrl}
              deliveryStatusLabel={t(DELIVERY_STATUS_LABEL_KEY[item.deliveryStatus])}
              title={item.title}
              projectTypeLabel={t(PROJECT_TYPE_LABEL_KEY[item.projectType])}
              locationLabel={[item.district, item.city].filter(Boolean).join('، ')}
              priceLabel={item.minPriceUsd != null ? `${t('projects.startingFrom')} $${groupThousands(item.minPriceUsd)}` : null}
              developerName={item.developerName}
              unitsLabel={item.totalUnits != null ? (locale === 'ar' ? `${item.totalUnits} وحدة` : `${item.totalUnits} units`) : null}
              onPress={() => router.push(`/project/${item.id}`)}
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
    header: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      backgroundColor: theme.background,
    },
    headerTitle: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.screenTitle, color: theme.headingText },

    listContent: { padding: spacing.lg, flexGrow: 1 },
  });
}
