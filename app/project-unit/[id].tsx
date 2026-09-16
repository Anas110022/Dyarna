import { useEffect, useMemo, useState } from 'react';
import { Dimensions, FlatList, Pressable, ScrollView, StyleSheet, Text, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { UNIT_STATUS_LABEL_KEY } from '@/src/lib/projectTypes';
import { fetchProjectUnitDetail, type ProjectUnitDetail } from '@/src/lib/projects';
import { LoadingState } from '@/src/components/LoadingState';
import { EmptyState } from '@/src/components/EmptyState';

const { width } = Dimensions.get('window');

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function DetailCell({ icon, label, value, theme }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; theme: ThemeColors }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.detailCell}>
      <Ionicons name={icon} size={18} color={theme.headingText} />
      <Text style={styles.detailCellValue}>{value}</Text>
      <Text style={styles.detailCellLabel}>{label}</Text>
    </View>
  );
}

export default function ProjectUnitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [unit, setUnit] = useState<ProjectUnitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await fetchProjectUnitDetail(id);
      if (cancelled) return;
      setUnit(data);
      setNotFound(!data);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handlePhotoScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setPhotoIndex(index);
  };

  if (loading) {
    return <LoadingState />;
  }

  if (notFound || !unit) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        message={t('projects.unitNotFound')}
        actionLabel={t('postListing.back')}
        onAction={() => router.back()}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.galleryWrap}>
          {unit.photoUrls.length > 0 ? (
            <FlatList
              data={unit.photoUrls}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(uri, index) => `${uri}-${index}`}
              onMomentumScrollEnd={handlePhotoScroll}
              renderItem={({ item, index }) => (
                <Image
                  source={{ uri: item }}
                  style={styles.heroPhoto}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  priority={index === 0 ? 'high' : 'normal'}
                  recyclingKey={item}
                />
              )}
            />
          ) : (
            <View style={[styles.heroPhoto, styles.heroPhotoPlaceholder]}>
              <Ionicons name="image-outline" size={40} color={theme.mutedText} />
            </View>
          )}

          <SafeAreaView edges={['top']} style={styles.galleryTopRow} pointerEvents="box-none">
            <Pressable style={styles.circleButton} onPress={() => router.back()}>
              <Ionicons name="arrow-forward" size={18} color={theme.headingText} />
            </Pressable>
          </SafeAreaView>

          {unit.photoUrls.length > 0 && (
            <View style={styles.galleryBottomRow} pointerEvents="none">
              <View style={styles.pageIndicator}>
                <Text style={styles.pageIndicatorText}>{`${photoIndex + 1} / ${unit.photoUrls.length}`}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.eyebrow} numberOfLines={1}>
              {unit.unitType}
              {unit.unitReference ? ` · ${unit.unitReference}` : ''}
            </Text>
            <View style={styles.statusTag}>
              <Text style={styles.statusTagText}>{t(UNIT_STATUS_LABEL_KEY[unit.status])}</Text>
            </View>
          </View>
          <Text style={styles.price}>${groupThousands(unit.priceUsd)}</Text>

          <View style={styles.detailsGrid}>
            <DetailCell icon="resize-outline" label={t('postListing.areaSqmLabel')} value={`${unit.areaSqm} ${t('home.sqm')}`} theme={theme} />
            {unit.bedrooms != null && <DetailCell icon="bed-outline" label={t('postListing.bedroomsLabel')} value={String(unit.bedrooms)} theme={theme} />}
            {unit.bathrooms != null && <DetailCell icon="water-outline" label={t('postListing.bathroomsLabel')} value={String(unit.bathrooms)} theme={theme} />}
            {unit.livingRooms != null && <DetailCell icon="tv-outline" label={t('home.livingRoomsLabel')} value={String(unit.livingRooms)} theme={theme} />}
            {unit.floor != null && <DetailCell icon="layers-outline" label={t('postListing.floorLabel')} value={unit.floor} theme={theme} />}
          </View>

          {unit.description && (
            <>
              <Text style={styles.sectionTitle}>{t('postListing.descriptionLabel')}</Text>
              <Text style={styles.descriptionText}>{unit.description}</Text>
            </>
          )}

          <Pressable style={styles.projectCard} onPress={() => router.push(`/project/${unit.projectId}`)}>
            <View style={styles.projectCardIcon}>
              <Ionicons name="business-outline" size={20} color={theme.headingText} />
            </View>
            <View style={styles.projectCardInfo}>
              <Text style={styles.projectCardLabel}>{t('projects.partOfProject')}</Text>
              <Text style={styles.projectCardTitle} numberOfLines={1}>
                {unit.projectTitle}
              </Text>
            </View>
            <Ionicons name="chevron-back" size={16} color={theme.mutedText} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    scrollContent: { paddingBottom: spacing.xxl },

    galleryWrap: { height: 260, backgroundColor: theme.surfaceAlt },
    heroPhoto: { width, height: 260, backgroundColor: theme.surfaceAlt },
    heroPhotoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    galleryTopRow: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    circleButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: 'rgba(255,255,255,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    galleryBottomRow: { position: 'absolute', bottom: spacing.md, left: spacing.lg, right: spacing.lg, alignItems: 'flex-end' },
    pageIndicator: { backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill },
    pageIndicatorText: { fontFamily: fonts.bodyMedium, fontSize: 9, color: '#fff' },

    content: { padding: spacing.lg },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: 4 },
    eyebrow: { flex: 1, fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText },
    statusTag: { backgroundColor: theme.surfaceAlt, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
    statusTagText: { fontFamily: fonts.headingBold, fontSize: 10, color: theme.bodyText },
    price: { fontFamily: fonts.headingBlack, fontSize: fontSizes.screenTitle, color: theme.headingText, marginBottom: spacing.lg },

    detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    detailCell: {
      width: '31%',
      backgroundColor: theme.surface,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      gap: 4,
    },
    detailCellValue: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    detailCellLabel: { fontFamily: fonts.bodyRegular, fontSize: 9, color: theme.mutedText, textAlign: 'center' },

    sectionTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText, marginTop: spacing.lg, marginBottom: spacing.md },
    descriptionText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.bodyText, lineHeight: 22 },

    projectCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginTop: spacing.lg,
    },
    projectCardIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    projectCardInfo: { flex: 1, gap: 2 },
    projectCardLabel: { fontFamily: fonts.bodyRegular, fontSize: 10, color: theme.mutedText },
    projectCardTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },
  });
}
