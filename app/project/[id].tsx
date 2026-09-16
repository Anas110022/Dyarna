import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { PROJECT_TYPE_LABEL_KEY, DELIVERY_STATUS_LABEL_KEY, UNIT_STATUS_LABEL_KEY, type ProjectUnitStatus } from '@/src/lib/projectTypes';
import {
  fetchProjectDetail,
  fetchProjectInterestStatus,
  fetchProjectUnits,
  registerProjectInterest,
  type ProjectDetail,
  type ProjectUnitCard,
} from '@/src/lib/projects';
import { AuthPromptModal, useAuthPrompt } from '@/src/components/AuthPrompt';
import { LoadingState } from '@/src/components/LoadingState';
import { EmptyState } from '@/src/components/EmptyState';
import { FormInput } from '@/src/components/FormInput';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { SecondaryButton } from '@/src/components/SecondaryButton';

const ROOM_COUNT_OPTIONS = [1, 2, 3, 4, 5];

type UnitFilters = {
  minPrice: string;
  maxPrice: string;
  minBedrooms: number | null;
  minLivingRooms: number | null;
  minBathrooms: number | null;
  unitType: string | null;
  status: ProjectUnitStatus | null;
};

const EMPTY_UNIT_FILTERS: UnitFilters = {
  minPrice: '',
  maxPrice: '',
  minBedrooms: null,
  minLivingRooms: null,
  minBathrooms: null,
  unitType: null,
  status: null,
};

const { width } = Dimensions.get('window');

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default function ProjectDetailScreen() {
  const { id, intent } = useLocalSearchParams<{ id: string; intent?: string }>();
  const { t, locale } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [interestRegistered, setInterestRegistered] = useState(false);
  const [submittingInterest, setSubmittingInterest] = useState(false);

  const [units, setUnits] = useState<ProjectUnitCard[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [unitsError, setUnitsError] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<UnitFilters>(EMPTY_UNIT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<UnitFilters>(EMPTY_UNIT_FILTERS);

  const { authPromptVisible, authPromptIntent, showAuthPrompt, hideAuthPrompt } = useAuthPrompt();

  // Guards every setState below against firing after this screen has
  // already unmounted (e.g. the user navigated back while units were
  // still loading) — loadUnits is called both from the id-effect below
  // and directly from the retry button, so a plain effect-local
  // `cancelled` flag can't cover it; this ref can.
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const loadUnits = async (projectId: string) => {
    setUnitsLoading(true);
    setUnitsError(false);
    const { data, error } = await fetchProjectUnits(projectId);
    if (!mountedRef.current) return;
    if (error) {
      setUnitsError(true);
    } else {
      setUnits(data);
    }
    setUnitsLoading(false);
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data }, { data: authData }] = await Promise.all([fetchProjectDetail(id), supabase.auth.getUser()]);
      if (cancelled) return;
      setDetail(data);
      setNotFound(!data);
      if (data) loadUnits(data.id);
      const uid = authData.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid && data) {
        const { registered } = await fetchProjectInterestStatus(data.id, uid);
        if (!cancelled) setInterestRegistered(registered);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Real distinct values from this project's own units only — unit_type
  // has no fixed enum in the schema (free text), so its filter options
  // can never be a hardcoded list; status uses the real fixed enum
  // (src/lib/projectTypes.ts) but only offers values that actually occur
  // here, never all three regardless of what this project really has.
  const availableUnitTypes = useMemo(() => Array.from(new Set(units.map((u) => u.unitType))), [units]);
  const availableStatuses = useMemo(
    () => Array.from(new Set(units.map((u) => u.status))) as ProjectUnitStatus[],
    [units]
  );

  const filteredUnits = useMemo(() => {
    const minPrice = appliedFilters.minPrice ? Number(appliedFilters.minPrice) : null;
    const maxPrice = appliedFilters.maxPrice ? Number(appliedFilters.maxPrice) : null;
    return units.filter((u) => {
      if (minPrice != null && !Number.isNaN(minPrice) && u.priceUsd < minPrice) return false;
      if (maxPrice != null && !Number.isNaN(maxPrice) && u.priceUsd > maxPrice) return false;
      if (appliedFilters.minBedrooms != null && (u.bedrooms == null || u.bedrooms < appliedFilters.minBedrooms)) return false;
      if (appliedFilters.minLivingRooms != null && (u.livingRooms == null || u.livingRooms < appliedFilters.minLivingRooms)) return false;
      if (appliedFilters.minBathrooms != null && (u.bathrooms == null || u.bathrooms < appliedFilters.minBathrooms)) return false;
      if (appliedFilters.unitType && u.unitType !== appliedFilters.unitType) return false;
      if (appliedFilters.status && u.status !== appliedFilters.status) return false;
      return true;
    });
  }, [units, appliedFilters]);

  const activeFilterCount =
    (appliedFilters.minPrice || appliedFilters.maxPrice ? 1 : 0) +
    (appliedFilters.minBedrooms != null ? 1 : 0) +
    (appliedFilters.minLivingRooms != null ? 1 : 0) +
    (appliedFilters.minBathrooms != null ? 1 : 0) +
    (appliedFilters.unitType ? 1 : 0) +
    (appliedFilters.status ? 1 : 0);

  const openFilterSheet = () => {
    setDraftFilters(appliedFilters);
    setFilterSheetOpen(true);
  };
  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setFilterSheetOpen(false);
  };
  const clearFilters = () => {
    setDraftFilters(EMPTY_UNIT_FILTERS);
    setAppliedFilters(EMPTY_UNIT_FILTERS);
    setFilterSheetOpen(false);
  };

  const handlePhotoScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setPhotoIndex(index);
  };

  // تسجيل اهتمام — a real record (src/lib/projects.ts's registerProjectInterest),
  // never a fake confirmation. Guest Mode: gated exactly like every other
  // gated action in the app (favorite/chat/call on listing detail) — the
  // auth prompt only ever fires after the user has already confirmed
  // below, so no record is ever created without both a real explicit
  // confirmation tap and a real authenticated session.
  const submitInterest = async () => {
    if (!detail || submittingInterest || interestRegistered) return;
    if (!currentUserId) {
      showAuthPrompt('project-interest');
      return;
    }
    setSubmittingInterest(true);
    const { error } = await registerProjectInterest(detail.id, currentUserId);
    setSubmittingInterest(false);
    if (error) {
      Alert.alert(t('projects.interestError'));
      return;
    }
    setInterestRegistered(true);
    Alert.alert(t('projects.interestSuccess'));
  };

  const handleRegisterInterest = () => {
    if (!detail || submittingInterest || interestRegistered) return;
    Alert.alert(t('projects.interestConfirmTitle'), t('projects.interestConfirmBody'), [
      { text: t('projects.interestConfirmCancel'), style: 'cancel' },
      { text: t('projects.interestConfirmConfirm'), onPress: submitInterest },
    ]);
  };

  const openDocument = () => {
    if (!detail?.documentUrl) return;
    Linking.openURL(detail.documentUrl);
  };

  const openNavigation = () => {
    if (!detail) return;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${detail.lat},${detail.lng}`);
  };

  // Guest Mode return-to-origin — same real pattern as listing detail's:
  // once a real session and the real project are both loaded, resume the
  // gated action that actually sent the guest to sign in. Calls
  // submitInterest directly, not handleRegisterInterest — the user already
  // confirmed intent in the dialog before being sent to sign in, so
  // showing that same confirmation a second time here would just be
  // re-asking a question they already answered.
  const resumedIntentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!intent || !currentUserId || !detail) return;
    if (resumedIntentRef.current === intent) return;
    resumedIntentRef.current = intent;
    const timeout = setTimeout(() => {
      if (intent === 'project-interest') submitInterest();
    }, 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- submitInterest is recreated every render; only the resume trigger should re-run this
  }, [intent, currentUserId, detail]);

  if (loading) {
    return <LoadingState />;
  }

  if (notFound || !detail) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        message={t('projects.notFound')}
        actionLabel={t('postListing.back')}
        onAction={() => router.back()}
      />
    );
  }

  const governorateName = locale === 'ar' ? detail.governorateNameAr : detail.governorateNameEn;
  const locationLine = [detail.district, detail.city, governorateName].filter(Boolean).join('، ');
  const priceLine =
    detail.minPriceUsd != null
      ? detail.maxPriceUsd != null && detail.maxPriceUsd !== detail.minPriceUsd
        ? `$${groupThousands(detail.minPriceUsd)} - $${groupThousands(detail.maxPriceUsd)}`
        : `${t('projects.startingFrom')} $${groupThousands(detail.minPriceUsd)}`
      : null;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.galleryWrap}>
          {detail.photoUrls.length > 0 ? (
            <FlatList
              data={detail.photoUrls}
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
              <Ionicons name="business-outline" size={40} color={theme.mutedText} />
            </View>
          )}

          <SafeAreaView edges={['top']} style={styles.galleryTopRow} pointerEvents="box-none">
            <Pressable style={styles.circleButton} onPress={() => router.back()}>
              <Ionicons name="arrow-forward" size={18} color={theme.headingText} />
            </Pressable>
          </SafeAreaView>

          {detail.photoUrls.length > 0 && (
            <View style={styles.galleryBottomRow} pointerEvents="none">
              <View style={styles.pageIndicator}>
                <Text style={styles.pageIndicatorText}>{`${photoIndex + 1} / ${detail.photoUrls.length}`}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.categoryEyebrow}>{t(PROJECT_TYPE_LABEL_KEY[detail.projectType])}</Text>
            <View style={styles.deliveryTag}>
              <Text style={styles.deliveryTagText}>{t(DELIVERY_STATUS_LABEL_KEY[detail.deliveryStatus])}</Text>
            </View>
          </View>
          <Text style={styles.title}>{detail.title}</Text>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color={theme.mutedText} />
            <Text style={styles.locationText}>{locationLine || '—'}</Text>
          </View>
          {priceLine && <Text style={styles.price}>{priceLine}</Text>}
          {detail.totalUnits != null && (
            <Text style={styles.unitsCount}>{locale === 'ar' ? `${detail.totalUnits} وحدة` : `${detail.totalUnits} units`}</Text>
          )}

          <Text style={styles.sectionTitle}>{t('postListing.descriptionLabel')}</Text>
          <Text style={styles.descriptionText}>{detail.description}</Text>

          <View style={styles.unitsHeaderRow}>
            <Text style={[styles.sectionTitle, styles.unitsSectionTitle]}>{t('projects.unitsTitle')}</Text>
            {units.length > 0 && (
              <Pressable style={styles.unitsFilterButton} onPress={openFilterSheet}>
                <Ionicons name="options-outline" size={14} color={theme.headingText} />
                <Text style={styles.unitsFilterButtonText}>{t('projects.filters')}</Text>
                {activeFilterCount > 0 && (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                  </View>
                )}
              </Pressable>
            )}
          </View>

          {unitsLoading ? (
            <View style={styles.unitsPlaceholder}>
              <ActivityIndicator color={theme.headingText} />
            </View>
          ) : unitsError ? (
            <View style={styles.unitsPlaceholder}>
              <Ionicons name="cloud-offline-outline" size={20} color={theme.mutedText} />
              <Text style={styles.unitsPlaceholderText}>{t('projects.unitsLoadError')}</Text>
              <Pressable onPress={() => loadUnits(detail.id)}>
                <Text style={styles.unitsRetryText}>{t('common.retry')}</Text>
              </Pressable>
            </View>
          ) : units.length === 0 ? (
            <View style={styles.unitsPlaceholder}>
              <Ionicons name="grid-outline" size={20} color={theme.mutedText} />
              <Text style={styles.unitsPlaceholderText}>{t('projects.unitsEmpty')}</Text>
            </View>
          ) : filteredUnits.length === 0 ? (
            <View style={styles.unitsPlaceholder}>
              <Ionicons name="search-outline" size={20} color={theme.mutedText} />
              <Text style={styles.unitsPlaceholderText}>{t('projects.unitsNoMatch')}</Text>
            </View>
          ) : (
            <View style={styles.unitsList}>
              {filteredUnits.map((unit) => (
                <Pressable key={unit.id} style={styles.unitCard} onPress={() => router.push(`/project-unit/${unit.id}`)}>
                  {unit.photoUrl ? (
                    <Image source={{ uri: unit.photoUrl }} style={styles.unitPhoto} contentFit="cover" cachePolicy="memory-disk" recyclingKey={unit.id} />
                  ) : (
                    <View style={[styles.unitPhoto, styles.unitPhotoPlaceholder]}>
                      <Ionicons name="image-outline" size={16} color={theme.mutedText} />
                    </View>
                  )}
                  <View style={styles.unitInfo}>
                    <View style={styles.unitTopRow}>
                      <Text style={styles.unitType} numberOfLines={1}>
                        {unit.unitType}
                        {unit.unitReference ? ` · ${unit.unitReference}` : ''}
                      </Text>
                      <View style={styles.unitStatusTag}>
                        <Text style={styles.unitStatusTagText}>{t(UNIT_STATUS_LABEL_KEY[unit.status])}</Text>
                      </View>
                    </View>
                    <Text style={styles.unitPrice}>${groupThousands(unit.priceUsd)}</Text>
                    <View style={styles.unitSpecsRow}>
                      <Text style={styles.unitSpecText}>
                        {unit.areaSqm} {t('home.sqm')}
                      </Text>
                      {unit.bedrooms != null && <Text style={styles.unitSpecText}>· {unit.bedrooms} {t('postListing.bedroomsLabel')}</Text>}
                      {unit.livingRooms != null && <Text style={styles.unitSpecText}>· {unit.livingRooms} {t('home.livingRoomsLabel')}</Text>}
                      {unit.bathrooms != null && <Text style={styles.unitSpecText}>· {unit.bathrooms} {t('postListing.bathroomsLabel')}</Text>}
                      {unit.floor && <Text style={styles.unitSpecText}>· {t('postListing.floorLabel')} {unit.floor}</Text>}
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>{t('listingDetail.locationOnMap')}</Text>
          <View style={styles.mapPreview}>
            <MapView
              provider={PROVIDER_GOOGLE}
              style={StyleSheet.absoluteFill}
              initialRegion={{ latitude: detail.lat, longitude: detail.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              <Marker coordinate={{ latitude: detail.lat, longitude: detail.lng }} />
            </MapView>
          </View>
          {detail.address && <Text style={styles.addressText}>{detail.address}</Text>}
          <Pressable style={styles.navigateButton} onPress={openNavigation}>
            <Ionicons name="navigate-outline" size={16} color={theme.onBrandFill} />
            <Text style={styles.navigateButtonText}>{t('listingDetail.goToLocation')}</Text>
          </Pressable>

          {detail.documentUrl && (
            <Pressable style={styles.documentRow} onPress={openDocument}>
              <Ionicons name="document-text-outline" size={18} color={theme.headingText} />
              <Text style={styles.documentText} numberOfLines={1}>
                {detail.documentName ?? t('projects.projectDocument')}
              </Text>
              <Ionicons name="download-outline" size={16} color={theme.mutedText} />
            </Pressable>
          )}

          <View style={styles.developerCard}>
            <View style={[styles.developerAvatar]}>
              <Ionicons name="business-outline" size={22} color={theme.mutedText} />
            </View>
            <View style={styles.developerInfo}>
              <Text style={styles.developerName}>{detail.developerName ?? t('projects.unknownDeveloper')}</Text>
              {detail.developerIsVerified && (
                <View style={styles.developerVerifiedRow}>
                  <Ionicons name="shield-checkmark-outline" size={12} color={theme.accentGold} />
                  <Text style={styles.developerVerifiedText}>{t('listingDetail.verifiedAccount')}</Text>
                </View>
              )}
            </View>
          </View>

          <Pressable
            style={[styles.interestButton, interestRegistered && styles.interestButtonDone]}
            onPress={handleRegisterInterest}
            disabled={submittingInterest || interestRegistered}
          >
            {submittingInterest ? (
              <ActivityIndicator size="small" color={theme.onBrandFill} />
            ) : (
              <>
                <Ionicons name={interestRegistered ? 'checkmark-circle' : 'heart-outline'} size={16} color={theme.onBrandFill} />
                <Text style={styles.interestButtonText}>
                  {interestRegistered ? t('projects.interestRegistered') : t('projects.registerInterest')}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={filterSheetOpen} transparent animationType="slide" onRequestClose={() => setFilterSheetOpen(false)}>
        <Pressable style={styles.filterOverlay} onPress={() => setFilterSheetOpen(false)}>
          <Pressable style={styles.filterSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.filterHandle} />
            <ScrollView contentContainerStyle={styles.filterSheetContent}>
              <View style={styles.filterHeaderRow}>
                <Text style={styles.filterSheetTitle}>{t('projects.filters')}</Text>
                <Pressable onPress={() => setFilterSheetOpen(false)} hitSlop={10}>
                  <Ionicons name="close" size={18} color={theme.mutedText} />
                </Pressable>
              </View>

              <Text style={styles.filterLabel}>{t('projects.filterPrice')}</Text>
              <View style={styles.priceRow}>
                <FormInput
                  keyboardType="numeric"
                  placeholder={t('projects.filterMin')}
                  value={draftFilters.minPrice}
                  onChangeText={(v) => setDraftFilters((f) => ({ ...f, minPrice: v.replace(/[^0-9]/g, '') }))}
                  containerStyle={styles.priceInputWrap}
                />
                <FormInput
                  keyboardType="numeric"
                  placeholder={t('projects.filterMax')}
                  value={draftFilters.maxPrice}
                  onChangeText={(v) => setDraftFilters((f) => ({ ...f, maxPrice: v.replace(/[^0-9]/g, '') }))}
                  containerStyle={styles.priceInputWrap}
                />
              </View>

              <Text style={styles.filterLabel}>{t('postListing.bedroomsLabel')}</Text>
              <View style={styles.chipRow}>
                {ROOM_COUNT_OPTIONS.map((n) => (
                  <Pressable
                    key={n}
                    style={[styles.roomChip, draftFilters.minBedrooms === n && styles.roomChipActive]}
                    onPress={() => setDraftFilters((f) => ({ ...f, minBedrooms: f.minBedrooms === n ? null : n }))}
                  >
                    <Text style={[styles.roomChipText, draftFilters.minBedrooms === n && styles.roomChipTextActive]}>
                      {n === 5 ? `${n}${t('projects.orMore')}` : n}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.filterLabel}>{t('home.livingRoomsLabel')}</Text>
              <View style={styles.chipRow}>
                {ROOM_COUNT_OPTIONS.map((n) => (
                  <Pressable
                    key={n}
                    style={[styles.roomChip, draftFilters.minLivingRooms === n && styles.roomChipActive]}
                    onPress={() => setDraftFilters((f) => ({ ...f, minLivingRooms: f.minLivingRooms === n ? null : n }))}
                  >
                    <Text style={[styles.roomChipText, draftFilters.minLivingRooms === n && styles.roomChipTextActive]}>
                      {n === 5 ? `${n}${t('projects.orMore')}` : n}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.filterLabel}>{t('postListing.bathroomsLabel')}</Text>
              <View style={styles.chipRow}>
                {ROOM_COUNT_OPTIONS.map((n) => (
                  <Pressable
                    key={n}
                    style={[styles.roomChip, draftFilters.minBathrooms === n && styles.roomChipActive]}
                    onPress={() => setDraftFilters((f) => ({ ...f, minBathrooms: f.minBathrooms === n ? null : n }))}
                  >
                    <Text style={[styles.roomChipText, draftFilters.minBathrooms === n && styles.roomChipTextActive]}>
                      {n === 5 ? `${n}${t('projects.orMore')}` : n}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {availableUnitTypes.length > 1 && (
                <>
                  <Text style={styles.filterLabel}>{t('projects.unitType')}</Text>
                  <View style={styles.chipRow}>
                    {availableUnitTypes.map((type) => (
                      <Pressable
                        key={type}
                        style={[styles.typeChip, draftFilters.unitType === type && styles.roomChipActive]}
                        onPress={() => setDraftFilters((f) => ({ ...f, unitType: f.unitType === type ? null : type }))}
                      >
                        <Text style={[styles.roomChipText, draftFilters.unitType === type && styles.roomChipTextActive]}>{type}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {availableStatuses.length > 1 && (
                <>
                  <Text style={styles.filterLabel}>{t('projects.unitStatusLabel')}</Text>
                  <View style={styles.chipRow}>
                    {availableStatuses.map((status) => (
                      <Pressable
                        key={status}
                        style={[styles.typeChip, draftFilters.status === status && styles.roomChipActive]}
                        onPress={() => setDraftFilters((f) => ({ ...f, status: f.status === status ? null : status }))}
                      >
                        <Text style={[styles.roomChipText, draftFilters.status === status && styles.roomChipTextActive]}>
                          {t(UNIT_STATUS_LABEL_KEY[status])}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              <View style={styles.filterActionsRow}>
                <SecondaryButton label={t('projects.filterClear')} onPress={clearFilters} style={styles.filterActionButton} />
                <PrimaryButton label={t('projects.filterApply')} onPress={applyFilters} style={styles.filterActionButton} />
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <AuthPromptModal visible={authPromptVisible} onClose={hideAuthPrompt} intent={authPromptIntent} />
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
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    categoryEyebrow: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.accentGold },
    deliveryTag: { backgroundColor: theme.brandFill, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
    deliveryTagText: { fontFamily: fonts.headingBold, fontSize: 9.5, color: theme.onBrandFill },
    title: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.screenTitle, color: theme.headingText, marginBottom: spacing.xs },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm },
    locationText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText },
    price: { fontFamily: fonts.headingBlack, fontSize: fontSizes.screenTitle, color: theme.headingText },
    unitsCount: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, marginTop: 2 },

    sectionTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText, marginTop: spacing.lg, marginBottom: spacing.md },
    descriptionText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.bodyText, lineHeight: 22 },

    unitsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
    unitsSectionTitle: { marginTop: 0, marginBottom: 0 },
    unitsFilterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: theme.surface,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    unitsFilterButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText },
    filterBadge: { backgroundColor: theme.brandFill, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
    filterBadgeText: { fontFamily: fonts.headingBold, fontSize: 9, color: theme.onBrandFill },

    unitsPlaceholder: {
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.md,
    },
    unitsPlaceholderText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.mutedText, textAlign: 'center' },
    unitsRetryText: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.headingText, marginTop: spacing.xs },

    unitsList: { gap: spacing.sm, marginTop: spacing.md },
    unitCard: {
      flexDirection: 'row',
      gap: spacing.sm,
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.sm,
    },
    unitPhoto: { width: 64, height: 64, borderRadius: radii.md, backgroundColor: theme.surfaceAlt },
    unitPhotoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    unitInfo: { flex: 1, justifyContent: 'center', gap: 3 },
    unitTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    unitType: { flex: 1, fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    unitStatusTag: { backgroundColor: theme.surfaceAlt, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
    unitStatusTagText: { fontFamily: fonts.headingBold, fontSize: 9.5, color: theme.bodyText },
    unitPrice: { fontFamily: fonts.headingBlack, fontSize: fontSizes.body, color: theme.headingText },
    unitSpecsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    unitSpecText: { fontFamily: fonts.bodyRegular, fontSize: 10.5, color: theme.mutedText },

    filterOverlay: { flex: 1, backgroundColor: 'rgba(11,43,33,0.35)', justifyContent: 'flex-end' },
    filterSheet: { backgroundColor: theme.background, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, maxHeight: '85%' },
    filterHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: theme.surfaceAlt, alignSelf: 'center', marginTop: spacing.sm },
    filterSheetContent: { padding: spacing.lg },
    filterHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
    filterSheetTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.sectionTitle, color: theme.headingText },
    filterLabel: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, marginTop: spacing.md, marginBottom: spacing.sm },
    priceRow: { flexDirection: 'row', gap: spacing.sm },
    priceInputWrap: { flex: 1 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    roomChip: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.fieldBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    roomChipActive: { backgroundColor: theme.brandFill, borderColor: theme.brandFill },
    roomChipText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.bodyText },
    roomChipTextActive: { fontFamily: fonts.headingBold, color: theme.onBrandFill },
    typeChip: {
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.fieldBorder,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    filterActionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    filterActionButton: { flex: 1 },

    mapPreview: { height: 160, borderRadius: radii.lg, overflow: 'hidden' },
    addressText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText, marginTop: spacing.xs },
    navigateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: theme.brandFill,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      marginTop: spacing.sm,
    },
    navigateButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.onBrandFill },

    documentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginTop: spacing.lg,
    },
    documentText: { flex: 1, fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },

    developerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginTop: spacing.lg,
    },
    developerAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    developerInfo: { flex: 1, gap: 2 },
    developerName: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    developerVerifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    developerVerifiedText: { fontFamily: fonts.bodyMedium, fontSize: 10, color: theme.mutedText },

    interestButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: theme.brandFill,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      marginTop: spacing.lg,
    },
    interestButtonDone: { backgroundColor: theme.success },
    interestButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.onBrandFill },
  });
}
