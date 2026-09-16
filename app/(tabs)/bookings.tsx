import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import {
  ALL_BOOKING_TYPES,
  ALL_HALL_TYPES,
  BOOKING_TYPE_FIELDS,
  BOOKING_TYPE_LABEL_KEY,
  HALL_TYPE_LABEL_KEY,
  isAccommodationType,
  type BookingListingType,
  type HallType,
} from '@/src/lib/bookingTypes';
import { fetchGovernorates, type Governorate } from '@/src/lib/listings';
import { isFavorited, addFavorite, removeFavorite } from '@/src/lib/favorites';
import { searchBookableListings, EMPTY_BOOKING_FILTERS, type BookableListingCard, type BookingSearchFilters } from '@/src/lib/bookings';
import { DateRangeCalendar } from '@/src/components/DateRangeCalendar';
import { formatDayMonth } from '@/src/lib/arabicDate';
import { LoadingState } from '@/src/components/LoadingState';
import { EmptyState } from '@/src/components/EmptyState';
import { FormInput } from '@/src/components/FormInput';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { SecondaryButton } from '@/src/components/SecondaryButton';

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function FavoriteButton({ bookingListingId, userId, theme }: { bookingListingId: string; userId: string | null; theme: ThemeColors }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [favorited, setFavoritedState] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!userId) {
        setFavoritedState(false);
        return;
      }
      const v = await isFavorited(userId, bookingListingId);
      if (!cancelled) setFavoritedState(v);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, bookingListingId]);

  const toggle = async () => {
    if (!userId || busy) return;
    setBusy(true);
    if (favorited) {
      await removeFavorite(userId, bookingListingId);
      setFavoritedState(false);
    } else {
      await addFavorite(userId, bookingListingId);
      setFavoritedState(true);
    }
    setBusy(false);
  };

  return (
    <Pressable style={styles.favoriteButton} onPress={toggle} hitSlop={8}>
      <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={16} color={favorited ? theme.accentGold : theme.white} />
    </Pressable>
  );
}

export default function BookingsScreen() {
  const { t, locale } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    }, [])
  );

  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  useEffect(() => {
    fetchGovernorates().then(({ data }) => setGovernorates(data));
  }, []);

  const [appliedFilters, setAppliedFilters] = useState<BookingSearchFilters>(EMPTY_BOOKING_FILTERS);
  const [draftFilters, setDraftFilters] = useState<BookingSearchFilters>(EMPTY_BOOKING_FILTERS);

  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [citySheetOpen, setCitySheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [draftCheckIn, setDraftCheckIn] = useState<string | null>(null);
  const [draftCheckOut, setDraftCheckOut] = useState<string | null>(null);

  const [results, setResults] = useState<BookableListingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      const { data, error: fetchError } = await searchBookableListings(appliedFilters);
      if (cancelled) return;
      if (fetchError) {
        setError(true);
        setLoading(false);
        return;
      }
      setResults(data);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [appliedFilters]);

  const openDateSheet = () => {
    setDraftCheckIn(appliedFilters.checkIn);
    setDraftCheckOut(appliedFilters.checkOut);
    setDateSheetOpen(true);
  };

  const applyDates = () => {
    setAppliedFilters((f) => ({ ...f, checkIn: draftCheckIn, checkOut: draftCheckOut }));
    setDateSheetOpen(false);
  };

  const clearDates = () => {
    setDraftCheckIn(null);
    setDraftCheckOut(null);
    setAppliedFilters((f) => ({ ...f, checkIn: null, checkOut: null }));
    setDateSheetOpen(false);
  };

  const openFilterSheet = () => {
    setDraftFilters(appliedFilters);
    setFilterSheetOpen(true);
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setFilterSheetOpen(false);
  };

  const resetFilters = () => {
    setDraftFilters((f) => ({ ...EMPTY_BOOKING_FILTERS, checkIn: f.checkIn, checkOut: f.checkOut, governorateId: f.governorateId }));
  };

  // Selecting a new type clears the previous type's now-irrelevant fields
  // (e.g. a hall_type chosen for قاعة أفراح must never silently carry over
  // and filter out every apartment) instead of just hiding them in the UI.
  const selectDraftType = (type: BookingListingType | null) => {
    setDraftFilters((f) => ({
      ...EMPTY_BOOKING_FILTERS,
      checkIn: f.checkIn,
      checkOut: f.checkOut,
      governorateId: f.governorateId,
      bookingType: type,
    }));
  };

  const selectedGovernorate = governorates.find((g) => g.id === appliedFilters.governorateId) ?? null;
  const nights = appliedFilters.checkIn && appliedFilters.checkOut ? nightsBetween(appliedFilters.checkIn, appliedFilters.checkOut) : null;

  const draftFieldFlags = draftFilters.bookingType ? BOOKING_TYPE_FIELDS[draftFilters.bookingType] : null;

  const appliedFilterBadgeCount =
    (appliedFilters.bookingType != null ? 1 : 0) +
    (appliedFilters.minPrice != null ? 1 : 0) +
    (appliedFilters.maxPrice != null ? 1 : 0) +
    (appliedFilters.minBedrooms != null ? 1 : 0) +
    (appliedFilters.minBathrooms != null ? 1 : 0) +
    (appliedFilters.minBeds != null ? 1 : 0) +
    (appliedFilters.hallType != null ? 1 : 0);

  return (
    <View style={styles.flex}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>{t('booking.title')}</Text>
          <Pressable style={styles.addButton} onPress={() => router.push('/post-booking-listing')} hitSlop={10}>
            <Ionicons name="add-circle-outline" size={30} color={theme.headingText} />
          </Pressable>
        </View>

        <View style={styles.controlsRow}>
          <Pressable style={styles.controlButton} onPress={openDateSheet}>
            <Ionicons name="calendar-outline" size={14} color={theme.headingText} />
            <Text style={styles.controlButtonText} numberOfLines={1}>
              {appliedFilters.checkIn && appliedFilters.checkOut
                ? `${formatDayMonth(appliedFilters.checkIn, locale)} - ${formatDayMonth(appliedFilters.checkOut, locale)}`
                : t('booking.dateButton')}
            </Text>
          </Pressable>
          <Pressable style={styles.controlButton} onPress={() => setCitySheetOpen(true)}>
            <Ionicons name="location-outline" size={14} color={theme.headingText} />
            <Text style={styles.controlButtonText} numberOfLines={1}>
              {selectedGovernorate ? (locale === 'ar' ? selectedGovernorate.name_ar : selectedGovernorate.name_en) : t('booking.cityButton')}
            </Text>
          </Pressable>
          <Pressable style={[styles.controlButton, styles.filterControlButton]} onPress={openFilterSheet}>
            <Ionicons name="options-outline" size={14} color={theme.headingText} />
            {appliedFilterBadgeCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{appliedFilterBadgeCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {appliedFilters.bookingType && (
          <View style={styles.activeTypeRow}>
            <View style={styles.activeTypeChip}>
              <Text style={styles.activeTypeChipText}>{t(BOOKING_TYPE_LABEL_KEY[appliedFilters.bookingType])}</Text>
              <Pressable onPress={() => setAppliedFilters((f) => ({ ...f, bookingType: null }))} hitSlop={8}>
                <Ionicons name="close-circle" size={15} color={theme.headingText} />
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" message={t('booking.loadError')} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            results.length > 0 ? <Text style={styles.resultsCount}>{t('booking.resultsCount', { count: results.length })}</Text> : null
          }
          ListEmptyComponent={<EmptyState icon="bed-outline" message={t('booking.empty')} />}
          renderItem={({ item }) => {
            const accommodation = isAccommodationType(item.bookingType);
            const total = nights && accommodation ? nights * item.priceUsd : null;
            return (
              <Pressable
                style={styles.card}
                onPress={() =>
                  router.push({
                    pathname: '/booking/[id]',
                    params: {
                      id: item.id,
                      checkIn: appliedFilters.checkIn ?? '',
                      checkOut: appliedFilters.checkOut ?? '',
                    },
                  })
                }
              >
                <View style={styles.cardPhotoWrap}>
                  {item.photoUrl ? (
                    <Image source={{ uri: item.photoUrl }} style={styles.cardPhoto} />
                  ) : (
                    <View style={[styles.cardPhoto, styles.cardPhotoPlaceholder]}>
                      <Ionicons name="image-outline" size={22} color={theme.mutedText} />
                    </View>
                  )}
                  <FavoriteButton bookingListingId={item.id} userId={currentUserId} theme={theme} />
                  <View style={styles.cardTypeTag}>
                    <Text style={styles.cardTypeTagText}>{t(BOOKING_TYPE_LABEL_KEY[item.bookingType])}</Text>
                  </View>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={styles.cardLocationRow}>
                    <Ionicons name="location-outline" size={11} color={theme.mutedText} />
                    <Text style={styles.cardLocation} numberOfLines={1}>
                      {[item.area, item.city].filter(Boolean).join('، ')}
                    </Text>
                  </View>
                  <View style={styles.specRow}>
                    {accommodation ? (
                      <>
                        {item.bedrooms != null && (
                          <View style={styles.specItem}>
                            <Ionicons name="bed-outline" size={12} color={theme.headingText} />
                            <Text style={styles.specText}>{item.bedrooms}</Text>
                          </View>
                        )}
                        {item.beds != null && (
                          <View style={styles.specItem}>
                            <Ionicons name="moon-outline" size={12} color={theme.headingText} />
                            <Text style={styles.specText}>{item.beds}</Text>
                          </View>
                        )}
                        {item.bathrooms != null && (
                          <View style={styles.specItem}>
                            <Ionicons name="water-outline" size={12} color={theme.headingText} />
                            <Text style={styles.specText}>{item.bathrooms}</Text>
                          </View>
                        )}
                      </>
                    ) : (
                      item.hallType && (
                        <View style={styles.specItem}>
                          <Ionicons name="business-outline" size={12} color={theme.headingText} />
                          <Text style={styles.specText}>{t(HALL_TYPE_LABEL_KEY[item.hallType])}</Text>
                        </View>
                      )
                    )}
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceText}>
                      {accommodation
                        ? t('booking.pricePerNight', { price: groupThousands(item.priceUsd) })
                        : t('booking.pricePerEvent', { price: groupThousands(item.priceUsd) })}
                    </Text>
                    {nights && total != null && (
                      <Text style={styles.totalText}>
                        {t('booking.nightsCount', { count: nights })} · {t('booking.total')} ${groupThousands(total)}
                      </Text>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Date sheet */}
      <Modal visible={dateSheetOpen} transparent animationType="slide" onRequestClose={() => setDateSheetOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setDateSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('booking.selectDates')}</Text>
              <Pressable onPress={() => setDateSheetOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={18} color={theme.mutedText} />
              </Pressable>
            </View>
            <DateRangeCalendar checkIn={draftCheckIn} checkOut={draftCheckOut} onChange={(ci, co) => (setDraftCheckIn(ci), setDraftCheckOut(co))} />
            <View style={styles.sheetFooter}>
              <SecondaryButton label={t('booking.resetFilters')} onPress={clearDates} style={styles.resetButtonFlex} />
              <PrimaryButton label={t('booking.applyFilters')} onPress={applyDates} style={styles.applyButtonFlex} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* City sheet */}
      <Modal visible={citySheetOpen} transparent animationType="slide" onRequestClose={() => setCitySheetOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setCitySheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('booking.cityButton')}</Text>
              <Pressable onPress={() => setCitySheetOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={18} color={theme.mutedText} />
              </Pressable>
            </View>
            <FlatList
              data={[{ id: null, name_ar: t('booking.anyCity'), name_en: t('booking.anyCity') } as unknown as Governorate, ...governorates]}
              keyExtractor={(g, i) => g.id ?? `all-${i}`}
              renderItem={({ item: g }) => (
                <Pressable
                  style={styles.cityRow}
                  onPress={() => {
                    setAppliedFilters((f) => ({ ...f, governorateId: g.id }));
                    setCitySheetOpen(false);
                  }}
                >
                  <Text style={styles.cityRowText}>{locale === 'ar' ? g.name_ar : g.name_en}</Text>
                  {appliedFilters.governorateId === g.id && <Ionicons name="checkmark" size={18} color={theme.headingText} />}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Filter sheet — type selection drives everything else shown below it */}
      <Modal visible={filterSheetOpen} transparent animationType="slide" onRequestClose={() => setFilterSheetOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setFilterSheetOpen(false)}>
          <Pressable style={styles.filterSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('booking.filterButton')}</Text>
              <Pressable onPress={() => setFilterSheetOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={18} color={theme.mutedText} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.filterBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.filterFieldLabel}>{t('booking.selectBookingTypeTitle')}</Text>
              <View style={styles.chipRow}>
                {ALL_BOOKING_TYPES.map((type) => {
                  const active = draftFilters.bookingType === type;
                  return (
                    <Pressable
                      key={type}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => selectDraftType(active ? null : type)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{t(BOOKING_TYPE_LABEL_KEY[type])}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {!draftFilters.bookingType ? (
                <Text style={styles.filterHint}>{t('booking.selectBookingTypeTitle')}</Text>
              ) : (
                <>
                  <Text style={styles.filterFieldLabel}>
                    {isAccommodationType(draftFilters.bookingType) ? `${t('booking.minPrice')} / ${t('booking.maxPrice')}` : t('booking.priceUsdLabel')}
                  </Text>
                  <View style={styles.rangeRow}>
                    <FormInput
                      keyboardType="numeric"
                      placeholder={t('booking.minPrice')}
                      value={draftFilters.minPrice != null ? String(draftFilters.minPrice) : ''}
                      onChangeText={(v) => setDraftFilters((f) => ({ ...f, minPrice: v.trim() ? Number(v) : null }))}
                      containerStyle={styles.rangeInput}
                    />
                    <FormInput
                      keyboardType="numeric"
                      placeholder={t('booking.maxPrice')}
                      value={draftFilters.maxPrice != null ? String(draftFilters.maxPrice) : ''}
                      onChangeText={(v) => setDraftFilters((f) => ({ ...f, maxPrice: v.trim() ? Number(v) : null }))}
                      containerStyle={styles.rangeInput}
                    />
                  </View>

                  {draftFieldFlags?.bedrooms && (
                    <>
                      <Text style={styles.filterFieldLabel}>{t('booking.bedrooms')}</Text>
                      <View style={styles.chipRow}>
                        {[1, 2, 3, 4].map((n) => {
                          const active = draftFilters.minBedrooms === n;
                          return (
                            <Pressable
                              key={n}
                              style={[styles.filterChip, active && styles.filterChipActive]}
                              onPress={() => setDraftFilters((f) => ({ ...f, minBedrooms: active ? null : n }))}
                            >
                              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{n}+</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}

                  {draftFieldFlags?.bathrooms && (
                    <>
                      <Text style={styles.filterFieldLabel}>{t('booking.bathrooms')}</Text>
                      <View style={styles.chipRow}>
                        {[1, 2, 3].map((n) => {
                          const active = draftFilters.minBathrooms === n;
                          return (
                            <Pressable
                              key={n}
                              style={[styles.filterChip, active && styles.filterChipActive]}
                              onPress={() => setDraftFilters((f) => ({ ...f, minBathrooms: active ? null : n }))}
                            >
                              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{n}+</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}

                  {draftFieldFlags?.beds && (
                    <>
                      <Text style={styles.filterFieldLabel}>{t('booking.bedsLabel')}</Text>
                      <View style={styles.chipRow}>
                        {[1, 2, 3, 4].map((n) => {
                          const active = draftFilters.minBeds === n;
                          return (
                            <Pressable
                              key={n}
                              style={[styles.filterChip, active && styles.filterChipActive]}
                              onPress={() => setDraftFilters((f) => ({ ...f, minBeds: active ? null : n }))}
                            >
                              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{n}+</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}

                  {draftFieldFlags?.hallFields && (
                    <>
                      <Text style={styles.filterFieldLabel}>{t('booking.hallTypeLabel')}</Text>
                      <View style={styles.chipRow}>
                        {ALL_HALL_TYPES.map((ht: HallType) => {
                          const active = draftFilters.hallType === ht;
                          return (
                            <Pressable
                              key={ht}
                              style={[styles.filterChip, active && styles.filterChipActive]}
                              onPress={() => setDraftFilters((f) => ({ ...f, hallType: active ? null : ht }))}
                            >
                              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{t(HALL_TYPE_LABEL_KEY[ht])}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}

                </>
              )}
            </ScrollView>
            <View style={styles.sheetFooter}>
              <SecondaryButton label={t('booking.resetFilters')} onPress={resetFilters} style={styles.resetButtonFlex} />
              <PrimaryButton label={t('booking.applyFilters')} onPress={applyFilters} style={styles.applyButtonFlex} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  const shadow = {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  };

  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: theme.background, gap: spacing.sm },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { flex: 1, fontFamily: fonts.headingExtraBold, fontSize: fontSizes.screenTitle, color: theme.headingText },
    addButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    controlsRow: { flexDirection: 'row', gap: spacing.sm },
    controlButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.surface,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 44,
      ...shadow,
    },
    filterControlButton: { flex: 0, width: 44, justifyContent: 'center', position: 'relative' },
    filterBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      minWidth: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: theme.accentGold,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBadgeText: { fontFamily: fonts.headingBold, fontSize: 8, color: theme.headingText },
    controlButtonText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.headingText, flexShrink: 1 },

    activeTypeRow: { flexDirection: 'row' },
    activeTypeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: `${theme.accentGold}30`,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    activeTypeChipText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText },

    listContent: { padding: spacing.lg, flexGrow: 1 },
    resultsCount: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.mutedText, marginBottom: spacing.sm },

    card: { backgroundColor: theme.surface, borderRadius: radii.lg, overflow: 'hidden', marginBottom: spacing.md, ...shadow },
    cardPhotoWrap: { height: 160, backgroundColor: theme.surfaceAlt },
    cardPhoto: { width: '100%', height: '100%' },
    cardPhotoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    favoriteButton: {
      position: 'absolute',
      top: spacing.sm,
      left: spacing.sm,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: 'rgba(11,43,33,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTypeTag: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.sm,
      backgroundColor: 'rgba(255,255,255,0.92)',
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    cardTypeTagText: { fontFamily: fonts.headingBold, fontSize: 9.5, color: theme.headingText },
    cardBody: { padding: spacing.md, gap: 4 },
    cardTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText },
    cardLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    cardLocation: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText },
    specRow: { flexDirection: 'row', gap: spacing.md, marginTop: 2, flexWrap: 'wrap' },
    specItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    specText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    priceRow: { marginTop: spacing.xs, gap: 2 },
    priceText: { fontFamily: fonts.headingBlack, fontSize: fontSizes.sectionTitle, color: theme.headingText },
    totalText: { fontFamily: fonts.bodyRegular, fontSize: 10.5, color: theme.mutedText },

    overlay: { flex: 1, backgroundColor: 'rgba(11,43,33,0.28)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: theme.background, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, maxHeight: '80%', padding: spacing.lg },
    filterSheet: { backgroundColor: theme.background, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, maxHeight: '85%' },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: theme.surfaceAlt, alignSelf: 'center', marginBottom: spacing.sm },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md, paddingHorizontal: spacing.lg },
    sheetTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.sectionTitle, color: theme.headingText },
    sheetFooter: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingTop: spacing.sm },
    resetButtonFlex: { flex: 1 },
    applyButtonFlex: { flex: 2 },

    cityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      minHeight: 48,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    cityRowText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.body, color: theme.bodyText },

    filterBody: { padding: spacing.lg, gap: spacing.xs },
    filterFieldLabel: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, marginBottom: spacing.sm, marginTop: spacing.md },
    filterHint: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText, marginTop: spacing.md, textAlign: 'center' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    filterChip: { backgroundColor: theme.surface, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    filterChipActive: { backgroundColor: theme.brandFill },
    filterChipText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.mutedText },
    filterChipTextActive: { fontFamily: fonts.headingBold, color: theme.onBrandFill },
    rangeRow: { flexDirection: 'row', gap: spacing.sm },
    rangeInput: { flex: 1 },
  });
}
