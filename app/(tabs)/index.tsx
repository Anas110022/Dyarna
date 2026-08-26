import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/src/i18n';
import { colors, fonts, radii, spacing } from '@/src/theme';
import { formatCount } from '@/src/lib/numbers';
import { MOCK_LISTINGS, ListingCategory, ListingPurpose, TOTAL_LISTINGS_COUNT } from '@/src/data/mockListings';
import { PriceMarker } from '@/src/components/PriceMarker';
import { ListingPreviewSheet } from '@/src/components/ListingPreviewSheet';

const DAMASCUS_REGION: Region = {
  latitude: 33.5138,
  longitude: 36.2765,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

const CATEGORIES: { key: 'all' | ListingCategory; labelKey: string }[] = [
  { key: 'all', labelKey: 'home.categoryAll' },
  { key: 'apartment', labelKey: 'home.categoryApartment' },
  { key: 'villa', labelKey: 'home.categoryVilla' },
  { key: 'house', labelKey: 'home.categoryHouse' },
  { key: 'land', labelKey: 'home.categoryLand' },
  { key: 'office', labelKey: 'home.categoryOffice' },
  { key: 'shop', labelKey: 'home.categoryShop' },
  { key: 'building', labelKey: 'home.categoryBuilding' },
];

export default function HomeMapScreen() {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [purpose, setPurpose] = useState<ListingPurpose>('rent');
  const [category, setCategory] = useState<'all' | ListingCategory>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredListings = useMemo(
    () =>
      MOCK_LISTINGS.filter(
        (listing) => listing.purpose === purpose && (category === 'all' || listing.category === category)
      ),
    [purpose, category]
  );

  const selectedListing = filteredListings.find((listing) => listing.id === selectedId) ?? null;

  const handleRecenter = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('home.locationPermissionTitle'), t('home.locationPermissionBody'));
      return;
    }
    const position = await Location.getCurrentPositionAsync({});
    mapRef.current?.animateToRegion(
      {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      500
    );
  };

  return (
    <View style={styles.container}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={DAMASCUS_REGION}>
        {filteredListings.map((listing) => (
          <Marker
            key={listing.id}
            coordinate={{ latitude: listing.latitude, longitude: listing.longitude }}
            onPress={() => setSelectedId(listing.id)}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <PriceMarker price={listing.price} selected={listing.id === selectedId} />
          </Marker>
        ))}
      </MapView>

      {selectedListing && <Pressable style={styles.dimOverlay} onPress={() => setSelectedId(null)} />}

      <View style={[styles.topOverlay, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={styles.toggleRow}>
          <View style={styles.toggleCard}>
            <Pressable style={styles.toggleTab} onPress={() => setPurpose('rent')}>
              <Text style={[styles.toggleText, purpose === 'rent' && styles.toggleTextActive]}>
                {t('home.forRent')}
              </Text>
            </Pressable>
            <Pressable style={styles.toggleTab} onPress={() => setPurpose('sale')}>
              <Text style={[styles.toggleText, purpose === 'sale' && styles.toggleTextActive]}>
                {t('home.forSale')}
              </Text>
            </Pressable>
          </View>
          <View style={styles.filtersButton}>
            <Ionicons name="options-outline" size={14} color={colors.pine} />
            <Text style={styles.filtersText}>{t('home.filters')}</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat.key}
              style={[styles.chip, category === cat.key && styles.chipActive]}
              onPress={() => setCategory(cat.key)}
            >
              <Text style={[styles.chipText, category === cat.key && styles.chipTextActive]}>{t(cat.labelKey)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {!selectedListing && (
        <>
          <View style={styles.leftControls}>
            <Pressable style={styles.roundButton} onPress={handleRecenter}>
              <Ionicons name="locate-outline" size={16} color={colors.pine} />
            </Pressable>
          </View>
          <View style={styles.rightControls}>
            <Pressable style={styles.favoritesButton} onPress={() => router.push('/saved')}>
              <Ionicons name="heart" size={15} color={colors.gold} />
              <Text style={styles.favoritesText}>{t('home.favorites')}</Text>
            </Pressable>
          </View>
        </>
      )}

      <View style={styles.bottomSlot}>
        {selectedListing ? (
          <ListingPreviewSheet
            listing={selectedListing}
            onDismiss={() => setSelectedId(null)}
            onViewDetails={() => router.push({ pathname: '/listing/[id]', params: { id: selectedListing.id } })}
          />
        ) : (
          <View style={styles.summaryBar}>
            <Pressable style={styles.summaryAction} onPress={() => router.push('/search')}>
              <Text style={styles.summaryActionText}>{t('home.list')}</Text>
            </Pressable>
            <Text style={styles.summaryCount}>
              {t('home.resultsCount', {
                shown: formatCount(filteredListings.length, locale),
                total: formatCount(TOTAL_LISTINGS_COUNT, locale),
              })}
            </Text>
            <Pressable style={styles.summaryAction} onPress={() => router.push('/post-listing')}>
              <Text style={styles.summaryAddText}>{t('home.add')}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ivory2,
  },
  dimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11,43,33,0.28)',
  },
  topOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    marginBottom: spacing.sm,
  },
  toggleCard: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radii.md + 1,
    padding: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  toggleTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  toggleText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10.5,
    color: '#B7AF98',
  },
  toggleTextActive: {
    fontFamily: fonts.headingBold,
    color: colors.pine,
  },
  filtersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.white,
    borderRadius: radii.md + 1,
    paddingHorizontal: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  filtersText: {
    fontFamily: fonts.headingBold,
    fontSize: 10,
    color: colors.pine,
  },
  chipsRow: {
    gap: spacing.xs + 2,
  },
  chip: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 1,
    borderRadius: radii.pill,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  chipActive: {
    backgroundColor: colors.gold,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10.5,
    color: colors.inkSoft,
  },
  chipTextActive: {
    fontFamily: fonts.headingBold,
    color: colors.pine,
  },
  leftControls: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.xxl + 64,
    gap: spacing.sm,
  },
  rightControls: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.xxl + 64,
  },
  roundButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  favoritesButton: {
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md + 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  favoritesText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 8,
    color: colors.inkSoft,
  },
  bottomSlot: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.xl,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  summaryAction: {},
  summaryActionText: {
    fontFamily: fonts.headingBold,
    fontSize: 9.5,
    color: colors.pine,
  },
  summaryAddText: {
    fontFamily: fonts.headingBlack,
    fontSize: 9.5,
    color: colors.whatsapp,
  },
  summaryCount: {
    fontFamily: fonts.bodyRegular,
    fontSize: 9.5,
    color: colors.inkSoft,
  },
});
