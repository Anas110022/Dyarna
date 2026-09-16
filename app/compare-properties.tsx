import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { CATEGORY_LABEL_KEY } from '@/src/lib/listingTypes';
import { fetchAmenityTypes, fetchListingDetail, type AmenityType, type ListingDetail } from '@/src/lib/listings';
import { useComparison } from '@/src/lib/comparisonContext';
import { AppHeader } from '@/src/components/AppHeader';
import { LoadingState } from '@/src/components/LoadingState';
import { EmptyState } from '@/src/components/EmptyState';

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const CARD_WIDTH = 260;

type FieldRow = { label: string; value: (d: ListingDetail) => string };

export default function ComparePropertiesScreen() {
  const { t, locale } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { selectedIds, removeListing } = useComparison();

  const [details, setDetails] = useState<ListingDetail[]>([]);
  const [amenityTypes, setAmenityTypes] = useState<AmenityType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (selectedIds.length === 0) {
        setDetails([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const [results, { data: amenities }] = await Promise.all([
        Promise.all(selectedIds.map((id) => fetchListingDetail(id))),
        fetchAmenityTypes(),
      ]);
      if (cancelled) return;
      const valid: ListingDetail[] = [];
      results.forEach((r, i) => {
        if (r.data) {
          valid.push(r.data);
        } else {
          // Real listing no longer viewable (unpublished/removed since it
          // was added) — self-heal the selection instead of showing a
          // broken card for it.
          removeListing(selectedIds[i]);
        }
      });
      setDetails(valid);
      setAmenityTypes(amenities);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the actual id set changes, not on every removeListing/amenity identity change
  }, [selectedIds.join(',')]);

  const amenityLabel = (key: string, fallbackAr: string, fallbackEn: string) => {
    const found = amenityTypes.find((a) => a.key === key);
    if (!found) return locale === 'ar' ? fallbackAr : fallbackEn;
    return locale === 'ar' ? found.nameAr : found.nameEn;
  };

  const furnishedLabel = (f: ListingDetail['furnished']) => {
    if (f === 'full') return t('postListing.furnishedFull');
    if (f === 'partial') return t('postListing.furnishedPartial');
    if (f === 'unfurnished') return t('postListing.furnishedUnfurnished');
    return t('compare.notAvailable');
  };

  const detailRows: FieldRow[] = [
    { label: t('compare.propertyTypeLabel'), value: (d) => t(CATEGORY_LABEL_KEY[d.category]) },
    { label: t('compare.dealTypeLabel'), value: (d) => (d.listingType === 'rent' ? t('compare.rent') : t('compare.sale')) },
    { label: t('postListing.areaSqmLabel'), value: (d) => `${d.areaSqm} ${t('home.sqm')}` },
    { label: t('compare.cityLabel'), value: (d) => d.city || t('compare.notAvailable') },
    {
      label: t('compare.districtLabel'),
      value: (d) => (locale === 'ar' ? d.governorateNameAr : d.governorateNameEn) || t('compare.notAvailable'),
    },
    { label: t('compare.neighborhoodLabel'), value: (d) => d.area || t('compare.notAvailable') },
    { label: t('postListing.bedroomsLabel'), value: (d) => (d.bedrooms != null ? String(d.bedrooms) : t('compare.notAvailable')) },
    { label: t('home.livingRoomsLabel'), value: (d) => (d.livingRooms != null ? String(d.livingRooms) : t('compare.notAvailable')) },
    { label: t('postListing.bathroomsLabel'), value: (d) => (d.bathrooms != null ? String(d.bathrooms) : t('compare.notAvailable')) },
    { label: t('postListing.floorLabel'), value: (d) => (d.floor != null ? String(d.floor) : t('compare.notAvailable')) },
    { label: t('compare.masterBedroomLabel'), value: () => t('compare.notAvailable') },
    { label: t('compare.receptionRoomLabel'), value: () => t('compare.notAvailable') },
  ];

  const featureRows: FieldRow[] = [
    { label: t('compare.kitchenLabel'), value: () => t('compare.notAvailable') },
    { label: t('compare.furnishedLabel'), value: (d) => furnishedLabel(d.furnished) },
    { label: t('compare.familySectionLabel'), value: () => t('compare.notAvailable') },
    { label: t('compare.sewageLabel'), value: () => t('compare.notAvailable') },
    { label: t('compare.carEntranceLabel'), value: () => t('compare.notAvailable') },
    {
      label: amenityLabel('parking', 'موقف سيارات', 'Parking'),
      value: (d) => (d.amenities.includes('parking') ? t('postListing.yes') : t('postListing.no')),
    },
    {
      label: amenityLabel('pool', 'مسبح', 'Pool'),
      value: (d) => (d.amenities.includes('pool') ? t('postListing.yes') : t('postListing.no')),
    },
    { label: t('compare.acLabel'), value: () => t('compare.notAvailable') },
    { label: t('compare.waterLabel'), value: () => t('compare.notAvailable') },
    { label: t('compare.electricityLabel'), value: () => t('compare.notAvailable') },
    { label: t('compare.wifiLabel'), value: () => t('compare.notAvailable') },
    { label: t('compare.busStationLabel'), value: () => t('compare.notAvailable') },
    {
      label: amenityLabel('garden', 'حديقة', 'Garden'),
      value: (d) => (d.amenities.includes('garden') ? t('postListing.yes') : t('postListing.no')),
    },
    {
      label: amenityLabel('elevator', 'مصعد', 'Elevator'),
      value: (d) => (d.amenities.includes('elevator') ? t('postListing.yes') : t('postListing.no')),
    },
  ];

  return (
    <View style={styles.flex}>
      <AppHeader title={t('compare.title')} />

      {loading ? (
        <LoadingState />
      ) : details.length < 2 ? (
        <EmptyState icon="git-compare-outline" message={t('compare.emptyMessage')} />
      ) : (
        <ScrollView horizontal contentContainerStyle={styles.scrollContent} showsHorizontalScrollIndicator={false}>
          {details.map((d) => (
            <View key={d.id} style={styles.card}>
              <View style={styles.photoWrap}>
                {d.photos[0] ? (
                  <Image source={{ uri: d.photos[0] }} style={styles.photo} />
                ) : (
                  <View style={[styles.photo, styles.photoPlaceholder]}>
                    <Ionicons name="image-outline" size={24} color={theme.mutedText} />
                  </View>
                )}
                <Pressable style={styles.removeButton} onPress={() => removeListing(d.id)} hitSlop={8}>
                  <Ionicons name="close" size={14} color={theme.white} />
                </Pressable>
              </View>

              <Text style={styles.cardTitle} numberOfLines={2}>
                {d.title}
              </Text>
              <Text style={styles.cardPrice}>${groupThousands(d.priceUsd)}</Text>

              <Pressable style={styles.viewButton} onPress={() => router.push(`/listing/${d.id}`)}>
                <Text style={styles.viewButtonText}>{t('propertyRequest.viewProperty')}</Text>
              </Pressable>

              {detailRows.map((row) => (
                <View key={row.label} style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{row.label}</Text>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {row.value(d)}
                  </Text>
                </View>
              ))}

              <Text style={styles.featuresTitle}>{t('compare.featuresTitle')}</Text>
              {featureRows.map((row) => (
                <View key={row.label} style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{row.label}</Text>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {row.value(d)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },

    scrollContent: { flexDirection: 'row', padding: spacing.lg, gap: spacing.md },
    card: { width: CARD_WIDTH, backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md },
    photoWrap: { position: 'relative', marginBottom: spacing.xs },
    photo: { width: '100%', height: 120, borderRadius: radii.md, backgroundColor: theme.surfaceAlt },
    photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    removeButton: {
      position: 'absolute',
      top: 6,
      left: 6,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(11,43,33,0.75)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    cardPrice: { fontFamily: fonts.headingBlack, fontSize: fontSizes.sectionTitle, color: theme.headingText, marginTop: 2, marginBottom: spacing.xs },
    viewButton: { backgroundColor: theme.brandFill, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: 'center', marginBottom: spacing.sm },
    viewButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.onBrandFill },

    fieldRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: spacing.xs,
    },
    fieldLabel: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, flexShrink: 1 },
    fieldValue: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.bodyText, flexShrink: 1, textAlign: 'right' },

    featuresTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText, marginTop: spacing.sm, marginBottom: 2 },
  });
}
