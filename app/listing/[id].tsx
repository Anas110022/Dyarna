import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { BED_BATH_CATEGORIES, CATEGORY_LABEL_KEY, LAND_LIKE_CATEGORIES } from '@/src/lib/listingTypes';
import {
  fetchAmenityTypes,
  fetchListingDetail,
  incrementListingViewCount,
  type AmenityType,
  type ListingDetail,
} from '@/src/lib/listings';
import { fetchDrivingRoute, openGoogleMapsNavigation, type DrivingRoute } from '@/src/lib/directions';
import { getOrCreateConversation } from '@/src/lib/chat';
import { addFavorite, isFavorited, removeFavorite } from '@/src/lib/favorites';
import { submitReport, type ReportReason } from '@/src/lib/reports';
import { useComparison } from '@/src/lib/comparisonContext';
import { recordListingView } from '@/src/lib/analytics';
import { ReportModal } from '@/src/components/ReportModal';
import { AuthPromptModal, useAuthPrompt } from '@/src/components/AuthPrompt';
import { PropertyPhotoViewer } from '@/src/components/PropertyPhotoViewer';
import { LoadingState } from '@/src/components/LoadingState';
import { EmptyState } from '@/src/components/EmptyState';

const { width } = Dimensions.get('window');

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Real stored timestamps/dates only — always sliced from the actual ISO
// value returned by Supabase, never computed or guessed.
function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function InfoRow({ label, value, last, theme }: { label: string; value: string; last?: boolean; theme: ThemeColors }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoRowLabel}>{label}</Text>
      <Text style={styles.infoRowValue}>{value}</Text>
    </View>
  );
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

function StatusTag({ text, theme }: { text: string; theme: ThemeColors }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.statusTag}>
      <Text style={styles.statusTagText}>{text}</Text>
    </View>
  );
}

export default function ListingDetailScreen() {
  const { id, intent } = useLocalSearchParams<{ id: string; intent?: string }>();
  const { t, locale } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [detail, setDetail] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);
  const [amenityTypes, setAmenityTypes] = useState<AmenityType[]>([]);

  const [route, setRoute] = useState<DrivingRoute | null>(null);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [startingChat, setStartingChat] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const { authPromptVisible, authPromptIntent, showAuthPrompt, hideAuthPrompt } = useAuthPrompt();
  const { selectedIds, isSelected, toggleListing, maxCompare } = useComparison();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data }, { data: amenities }, { data: authData }] = await Promise.all([
        fetchListingDetail(id),
        fetchAmenityTypes(),
        supabase.auth.getUser(),
      ]);
      if (cancelled) return;
      setDetail(data);
      setNotFound(!data);
      setAmenityTypes(amenities);
      const uid = authData.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid) {
        const alreadyFavorited = await isFavorited(uid, id);
        if (!cancelled) setFavorited(alreadyFavorited);
      }
      setLoading(false);

      // Real view-count increment — fired once per real visit to this
      // screen, skipped entirely for the listing's own owner (matching the
      // RPC's own server-side rule) so an owner checking their own listing
      // never inflates their own count. Bumped locally only after the real
      // write succeeds, so the number on screen never gets ahead of the DB.
      if (data && uid !== data.ownerId) {
        incrementListingViewCount(data.id).then(({ error }) => {
          if (!cancelled && !error) {
            setDetail((prev) => (prev ? { ...prev, viewCount: prev.viewCount + 1 } : prev));
          }
        });
        // إحصائيات إعلاني — a real, deduplicated view event for the owner's
        // analytics screen. Separate from the running counter above (which
        // already powers the public "المشاهدات" figure on this screen) —
        // this one is real per-event data with a timestamp, which is what
        // makes a real trend and a real dedup window possible.
        recordListingView({ listingId: data.id });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const amenityNames = useMemo(() => {
    if (!detail) return [];
    return detail.amenities
      .map((key) => amenityTypes.find((a) => a.key === key))
      .filter((a): a is AmenityType => a != null)
      .map((a) => (locale === 'ar' ? a.nameAr : a.nameEn));
  }, [detail, amenityTypes, locale]);

  const handlePhotoScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setPhotoIndex(index);
  };

  // A real tel: link — opens the device's native phone dialer/call screen
  // with the listing's real contact number. No fake numbers: this is
  // exactly the number the owner entered when publishing the listing.
  // Guest Mode: contacting an owner is a gated action, same as chat.
  const callOwner = () => {
    if (!detail) return;
    if (!currentUserId) {
      showAuthPrompt('call');
      return;
    }
    if (!detail.contactPhone.trim()) {
      Alert.alert(t('listingDetail.noPhoneAvailable'));
      return;
    }
    Linking.openURL(`tel:${detail.contactPhone}`);
  };

  // wa.me is a real universal WhatsApp link: if WhatsApp is installed it
  // opens directly in-app, and if it isn't, it falls back to a normal web
  // page (App Store prompt / WhatsApp Web) instead of crashing or doing
  // nothing — that's the graceful "not installed" handling itself, not
  // something that needs a canOpenURL check first.
  const openWhatsApp = () => {
    if (!detail) return;
    if (!currentUserId) {
      showAuthPrompt('whatsapp');
      return;
    }
    if (!detail.contactPhone.trim()) {
      Alert.alert(t('listingDetail.noPhoneAvailable'));
      return;
    }
    const phoneDigits = detail.contactPhone.replace(/[^0-9]/g, '');
    const message = encodeURIComponent(t('listingDetail.whatsappMessage').replace('{{title}}', detail.title));
    Linking.openURL(`https://wa.me/${phoneDigits}?text=${message}`);
  };

  // Real favorite toggle — requires a real session; the listing's actual
  // saved-state in Supabase is the source of truth, updated optimistically
  // here and rolled back if the write fails.
  const toggleFavorite = async () => {
    if (!detail || togglingFavorite) return;
    if (!currentUserId) {
      showAuthPrompt('favorite');
      return;
    }
    const next = !favorited;
    setFavorited(next);
    setTogglingFavorite(true);
    const { error } = next ? await addFavorite(currentUserId, detail.id) : await removeFavorite(currentUserId, detail.id);
    setTogglingFavorite(false);
    if (error) {
      setFavorited(!next);
    }
  };

  // مقارنة العقارات — a real, session-local selection of real listing ids
  // (src/lib/comparisonContext.tsx), never a second listing/mock system.
  const handleToggleCompare = () => {
    if (!detail) return;
    const result = toggleListing(detail.id);
    if (result === 'limit_reached') {
      Alert.alert(t('compare.limitReachedTitle'), t('compare.limitReachedMessage', { max: maxCompare }));
    }
  };

  // Real in-app chat: requires a real session and a real
  // getOrCreateConversation call — the server itself also rejects a
  // listing owner messaging their own listing via the
  // conversations_no_self_chat constraint, so this button is disabled for
  // the owner as a matching, non-security-critical UX affordance.
  const openInAppChat = async () => {
    if (!detail || startingChat) return;
    if (!currentUserId) {
      showAuthPrompt('chat');
      return;
    }
    if (currentUserId === detail.ownerId) return;

    setStartingChat(true);
    const { conversationId, error } = await getOrCreateConversation(detail.id, currentUserId);
    setStartingChat(false);
    if (error || !conversationId) {
      Alert.alert(t('listingDetail.chatStartError'));
      return;
    }
    router.push(`/chat/${conversationId}`);
  };

  const reportListing = () => {
    if (!currentUserId) {
      showAuthPrompt('report');
      return;
    }
    setReportError(null);
    setReportModalOpen(true);
  };

  const handleSubmitReport = async (reason: ReportReason, details: string) => {
    if (!currentUserId || !detail || submittingReport) return;
    setSubmittingReport(true);
    setReportError(null);
    const { error } = await submitReport(currentUserId, 'listing', detail.id, reason, details || null);
    setSubmittingReport(false);
    if (error) {
      setReportError(error === 'already_reported' ? t('report.alreadyReported') : t('report.error'));
      return;
    }
    setReportModalOpen(false);
    Alert.alert(t('report.submitted'));
  };

  // Guest Mode return-to-origin: once a real session and the real listing
  // are both loaded, resume whichever gated action actually sent the guest
  // to sign in (see app/(auth)/otp.tsx) — fired exactly once per intent
  // value, since the resumed action's own handler re-checks currentUserId
  // and would otherwise just show the prompt again.
  const resumedIntentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!intent || !currentUserId || !detail) return;
    if (resumedIntentRef.current === intent) return;
    resumedIntentRef.current = intent;
    // Deferred a tick so the resumed action's own setState calls land as a
    // real response to this effect firing, not synchronously inside it.
    const timeout = setTimeout(() => {
      if (intent === 'favorite') toggleFavorite();
      else if (intent === 'call') callOwner();
      else if (intent === 'whatsapp') openWhatsApp();
      else if (intent === 'chat') openInAppChat();
      else if (intent === 'report') reportListing();
    }, 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- these handlers are recreated every render; only the resume trigger (intent/currentUserId/detail) should re-run this
  }, [intent, currentUserId, detail]);

  // Real device location + a real road-network routing calculation (see
  // src/lib/directions.ts) — never a fake/straight-line number.
  const calculateRoute = async () => {
    if (!detail || calculatingRoute) return;
    setRouteError(null);
    setCalculatingRoute(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setRouteError(t('listingDetail.locationPermissionDenied'));
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const { result, error } = await fetchDrivingRoute(
        { lat: position.coords.latitude, lng: position.coords.longitude },
        { lat: detail.lat, lng: detail.lng }
      );
      if (error || !result) {
        setRouteError(t('listingDetail.routeUnavailable'));
        return;
      }
      setRoute(result);
    } finally {
      setCalculatingRoute(false);
    }
  };

  // Shared with the full-screen "الخدمات المجاورة" map (src/lib/directions.ts)
  // so both "الذهاب إلى الموقع" buttons stay in sync — both point at the
  // listing's real, stored lat/lng, never a fake/typed address.
  const openNavigation = () => {
    if (!detail) return;
    openGoogleMapsNavigation({ lat: detail.lat, lng: detail.lng });
  };

  // Tapping the map preview opens the full-screen "الخدمات المجاورة" map —
  // the real distance/duration badge below still has its own tap target
  // (calculateRoute), unchanged.
  const openNearbyMap = () => {
    if (!detail) return;
    router.push({
      pathname: '/listing/nearby-map',
      params: { lat: String(detail.lat), lng: String(detail.lng), title: detail.title },
    });
  };

  if (loading) {
    return <LoadingState />;
  }

  if (notFound || !detail) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        message={t('listingDetail.notFound')}
        actionLabel={t('postListing.back')}
        onAction={() => router.back()}
      />
    );
  }

  const showBedBath = BED_BATH_CATEGORIES.includes(detail.category);
  const showLand = LAND_LIKE_CATEGORIES.includes(detail.category);
  const showCeiling = detail.category === 'warehouse';
  const isRent = detail.listingType === 'rent';
  const locationLine = [detail.area, detail.city, locale === 'ar' ? detail.governorateNameAr : detail.governorateNameEn]
    .filter(Boolean)
    .join('، ');

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.galleryWrap}>
          {detail.photos.length > 0 ? (
            <FlatList
              data={detail.photos}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(uri, index) => `${uri}-${index}`}
              onMomentumScrollEnd={handlePhotoScroll}
              renderItem={({ item, index }) => (
                <Pressable
                  onPress={() => {
                    setPhotoViewerIndex(index);
                    setPhotoViewerVisible(true);
                  }}
                >
                  <Image
                    source={{ uri: item }}
                    style={styles.heroPhoto}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    priority={index === 0 ? 'high' : 'normal'}
                    recyclingKey={item}
                  />
                </Pressable>
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
            <View style={styles.galleryTopRowRight}>
              <Pressable
                style={[styles.circleButton, isSelected(detail.id) && styles.circleButtonActive]}
                onPress={handleToggleCompare}
              >
                <Ionicons name="git-compare-outline" size={18} color={isSelected(detail.id) ? theme.white : theme.headingText} />
              </Pressable>
              <Pressable style={styles.circleButton} onPress={toggleFavorite} disabled={togglingFavorite}>
                <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={18} color={favorited ? theme.accentGold : theme.headingText} />
              </Pressable>
            </View>
          </SafeAreaView>

          <View style={styles.galleryBottomRow} pointerEvents="box-none">
            {detail.isVerifiedListing ? (
              <View style={styles.verifiedTag}>
                <Ionicons name="shield-checkmark" size={12} color={theme.headingText} />
                <Text style={styles.verifiedTagText}>{t('listingDetail.verifiedListing')}</Text>
              </View>
            ) : (
              <View />
            )}
            {detail.photos.length > 0 && (
              <Pressable
                style={styles.pageIndicator}
                onPress={() =>
                  router.push({
                    pathname: '/listing-photos/[id]',
                    params: { id: detail.id, photos: JSON.stringify(detail.photos), title: detail.title },
                  })
                }
              >
                <Text style={styles.pageIndicatorText}>{`${photoIndex + 1} / ${detail.photos.length}`}</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.categoryEyebrow}>{t(CATEGORY_LABEL_KEY[detail.category])}</Text>
          <Text style={styles.title}>{detail.title}</Text>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color={theme.mutedText} />
            <Text style={styles.locationText}>{locationLine || '—'}</Text>
          </View>
          <Text style={styles.price}>
            ${groupThousands(detail.priceUsd)}
            {isRent && <Text style={styles.priceSuffix}> / {t('listingDetail.perYear')}</Text>}
          </Text>

          <Text style={styles.sectionTitle}>{t('listingDetail.allDetails')}</Text>
          <View style={styles.detailsGrid}>
            <DetailCell icon="resize-outline" label={t('postListing.areaSqmLabel')} value={`${detail.areaSqm} ${t('home.sqm')}`} theme={theme} />
            {showBedBath && detail.bedrooms != null && (
              <DetailCell icon="bed-outline" label={t('postListing.bedroomsLabel')} value={String(detail.bedrooms)} theme={theme} />
            )}
            {showBedBath && detail.bathrooms != null && (
              <DetailCell icon="water-outline" label={t('postListing.bathroomsLabel')} value={String(detail.bathrooms)} theme={theme} />
            )}
            {showBedBath && detail.livingRooms != null && (
              <DetailCell icon="tv-outline" label={t('home.livingRoomsLabel')} value={String(detail.livingRooms)} theme={theme} />
            )}
            {detail.category === 'apartment' && detail.floor != null && (
              <DetailCell icon="layers-outline" label={t('postListing.floorLabel')} value={String(detail.floor)} theme={theme} />
            )}
            {showBedBath && detail.yearBuilt != null && (
              <DetailCell icon="calendar-outline" label={t('postListing.yearBuiltLabel')} value={String(detail.yearBuilt)} theme={theme} />
            )}
            {showLand && detail.landType && (
              <DetailCell
                icon="map-outline"
                label={t('postListing.landTypeLabel')}
                value={t(
                  `postListing.landType${detail.landType === 'residential' ? 'Residential' : detail.landType === 'agricultural' ? 'Agricultural' : 'Commercial'}`
                )}
                theme={theme}
              />
            )}
            {showLand && detail.frontageM != null && (
              <DetailCell icon="resize-outline" label={t('postListing.frontageLabel')} value={`${detail.frontageM} ${t('home.sqm').replace('²','')}`} theme={theme} />
            )}
            {showCeiling && detail.ceilingHeightM != null && (
              <DetailCell icon="resize-outline" label={t('home.ceilingHeightLabel')} value={`${detail.ceilingHeightM} م`} theme={theme} />
            )}
          </View>

          {(detail.condition || detail.furnished || (showLand && detail.hasBuildingPermit !== null)) && (
            <View style={styles.tagsRow}>
              {detail.condition && (
                <StatusTag text={t(detail.condition === 'good' ? 'postListing.conditionGood' : 'postListing.conditionNeedsRenovation')} theme={theme} />
              )}
              {detail.furnished && (
                <StatusTag
                  text={t(
                    `postListing.furnished${detail.furnished === 'full' ? 'Full' : detail.furnished === 'partial' ? 'Partial' : 'Unfurnished'}`
                  )}
                  theme={theme}
                />
              )}
              {showLand && detail.hasBuildingPermit !== null && (
                <StatusTag text={`${t('postListing.buildingPermitLabel')}: ${t(detail.hasBuildingPermit ? 'postListing.yes' : 'postListing.no')}`} theme={theme} />
              )}
            </View>
          )}

          {amenityNames.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>{t('home.amenitiesLabel')}</Text>
              <View style={styles.tagsRow}>
                {amenityNames.map((name) => (
                  <StatusTag key={name} text={name} theme={theme} />
                ))}
              </View>
            </>
          )}

          <Text style={styles.sectionTitle}>{t('postListing.descriptionLabel')}</Text>
          <Text style={styles.descriptionText}>{detail.description}</Text>

          <Text style={styles.sectionTitle}>{t('listingDetail.locationOnMap')}</Text>
          <Pressable style={styles.mapPreview} onPress={openNearbyMap}>
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

            {/* Its own tap target, nested inside the preview's — tapping
                the badge calculates the real distance (unchanged
                behavior); tapping anywhere else on the preview opens the
                full-screen "الخدمات المجاورة" map instead. */}
            <Pressable style={styles.routeBadge} onPress={calculateRoute}>
              {calculatingRoute ? (
                <ActivityIndicator size="small" color={theme.headingText} />
              ) : route ? (
                <Text style={styles.routeBadgeText}>
                  {t('listingDetail.durationMinutes', { minutes: route.durationMinutes })} • {t('listingDetail.distanceKm', { km: route.distanceKm })}
                </Text>
              ) : routeError ? (
                <Text style={styles.routeBadgeError}>{routeError}</Text>
              ) : (
                <Text style={styles.routeBadgeText}>{t('listingDetail.tapForDistance')}</Text>
              )}
            </Pressable>
          </Pressable>

          <Pressable style={styles.navigateButton} onPress={openNavigation}>
            <Ionicons name="navigate-outline" size={16} color={theme.onBrandFill} />
            <Text style={styles.navigateButtonText}>{t('listingDetail.goToLocation')}</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>{t('listingDetail.adInfoTitle')}</Text>
          <View style={styles.adInfoCard}>
            <InfoRow label={t('listingDetail.adNumber')} value={`#${detail.adNumber}`} theme={theme} />
            <InfoRow label={t('listingDetail.createdAt')} value={formatDate(detail.createdAt)} theme={theme} />
            <InfoRow label={t('listingDetail.lastUpdated')} value={formatDate(detail.updatedAt)} theme={theme} />
            <InfoRow label={t('listingDetail.views')} value={groupThousands(detail.viewCount)} theme={theme} />
            <InfoRow label={t('listingDetail.licenseNumber')} value={detail.licenseNumber ?? t('listingDetail.notAvailable')} theme={theme} />
            <InfoRow
              label={t('listingDetail.licenseExpiry')}
              value={detail.licenseExpiryDate ? formatDate(detail.licenseExpiryDate) : t('listingDetail.notAvailable')}
              theme={theme}
            />
            <InfoRow label={t('listingDetail.adSource')} value={detail.adSource ?? t('listingDetail.notAvailable')} theme={theme} />
            <InfoRow
              label={t('listingDetail.deedArea')}
              value={detail.deedAreaSqm != null ? `${detail.deedAreaSqm} ${t('home.sqm')}` : t('listingDetail.notAvailable')}
              last
              theme={theme}
            />
          </View>

          <Pressable style={styles.posterCard} onPress={() => router.push(`/profile/${detail.ownerId}`)}>
            {detail.ownerAvatarUrl ? (
              <Image source={{ uri: detail.ownerAvatarUrl }} style={styles.posterAvatar} contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <View style={[styles.posterAvatar, styles.posterAvatarPlaceholder]}>
                <Ionicons name="person-circle-outline" size={28} color={theme.mutedText} />
              </View>
            )}
            <View style={styles.posterInfo}>
              <Text style={styles.posterName}>{detail.ownerFullName ?? t('listingDetail.unknownOwner')}</Text>
              {detail.ownerIsVerified && (
                <View style={styles.posterVerifiedRow}>
                  <Ionicons name="shield-checkmark-outline" size={12} color={theme.accentGold} />
                  <Text style={styles.posterVerifiedText}>{t('listingDetail.verifiedAccount')}</Text>
                </View>
              )}
            </View>
            <Ionicons name="chevron-back" size={16} color={theme.mutedText} />
          </Pressable>

          <Text style={styles.sectionTitle}>{t('listingDetail.contactSectionTitle')}</Text>
          <View style={styles.contactRow}>
            {currentUserId !== detail.ownerId && (
              <Pressable style={styles.chatButton} onPress={openInAppChat} disabled={startingChat}>
                {startingChat ? (
                  <ActivityIndicator size="small" color={theme.headingText} />
                ) : (
                  <>
                    <Ionicons name="chatbubble-outline" size={15} color={theme.headingText} />
                    <Text style={styles.chatButtonText}>{t('listingDetail.chatInApp')}</Text>
                  </>
                )}
              </Pressable>
            )}
            <Pressable style={styles.whatsappButton} onPress={openWhatsApp}>
              <Ionicons name="logo-whatsapp" size={16} color={theme.white} />
              <Text style={styles.whatsappButtonText}>{t('listingDetail.whatsapp')}</Text>
            </Pressable>
            <Pressable style={styles.callButton} onPress={callOwner}>
              <Ionicons name="call-outline" size={15} color={theme.white} />
              <Text style={styles.callButtonText}>{t('listingDetail.call')}</Text>
            </Pressable>
          </View>

          <Pressable style={styles.reportLink} onPress={reportListing}>
            <Ionicons name="flag-outline" size={13} color={theme.mutedText} />
            <Text style={styles.reportLinkText}>{t('listingDetail.report')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {selectedIds.length >= 2 && (
        <Pressable style={styles.compareBar} onPress={() => router.push('/compare-properties')}>
          <Ionicons name="git-compare-outline" size={16} color={theme.onBrandFill} />
          <Text style={styles.compareBarText}>{t('compare.viewComparison', { count: selectedIds.length })}</Text>
        </Pressable>
      )}

      <ReportModal
        visible={reportModalOpen}
        title={t('report.listingTitle')}
        onClose={() => setReportModalOpen(false)}
        onSubmit={handleSubmitReport}
        submitting={submittingReport}
        errorText={reportError}
      />

      <AuthPromptModal visible={authPromptVisible} onClose={hideAuthPrompt} intent={authPromptIntent} />

      <PropertyPhotoViewer
        visible={photoViewerVisible}
        photos={detail.photos}
        initialIndex={photoViewerIndex}
        onClose={() => setPhotoViewerVisible(false)}
      />
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    scrollContent: { paddingBottom: spacing.xxl },

    galleryWrap: { height: 300, backgroundColor: theme.surfaceAlt },
    heroPhoto: { width, height: 300, backgroundColor: theme.surfaceAlt },
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
    galleryTopRowRight: { flexDirection: 'row', gap: spacing.sm },
    circleButtonActive: { backgroundColor: theme.brandFill },
    circleButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: 'rgba(255,255,255,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    galleryBottomRow: {
      position: 'absolute',
      bottom: spacing.md,
      left: spacing.lg,
      right: spacing.lg,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    verifiedTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(201,168,95,0.92)',
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radii.pill,
    },
    verifiedTagText: { fontFamily: fonts.headingBold, fontSize: 9, color: '#0B2B21' },
    pageIndicator: { backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill },
    pageIndicatorText: { fontFamily: fonts.bodyMedium, fontSize: 9, color: '#fff' },

    content: { padding: spacing.lg },
    categoryEyebrow: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.accentGold, marginBottom: 4 },
    title: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.screenTitle, color: theme.headingText, marginBottom: spacing.xs },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm },
    locationText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText },
    price: { fontFamily: fonts.headingBlack, fontSize: fontSizes.screenTitle, color: theme.headingText, marginBottom: spacing.lg },
    priceSuffix: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.body, color: theme.mutedText },

    sectionTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText, marginTop: spacing.lg, marginBottom: spacing.md },
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

    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    statusTag: { backgroundColor: theme.surfaceAlt, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
    statusTagText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.bodyText },

    descriptionText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.body, color: theme.bodyText, lineHeight: 22 },

    mapPreview: { height: 160, borderRadius: radii.lg, overflow: 'hidden' },
    routeBadge: {
      position: 'absolute',
      bottom: spacing.sm,
      left: spacing.sm,
      right: spacing.sm,
      backgroundColor: theme.surface,
      borderRadius: radii.pill,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    routeBadgeText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText },
    routeBadgeError: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.danger },
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

    adInfoCard: {
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: spacing.md,
    },
    infoRowLast: { borderBottomWidth: 0 },
    infoRowLabel: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    infoRowValue: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.bodyText, flexShrink: 1, textAlign: 'right' },

    posterCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginTop: spacing.lg,
    },
    posterAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.surfaceAlt },
    posterAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    posterInfo: { flex: 1, gap: 2 },
    posterName: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText },
    posterVerifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    posterVerifiedText: { fontFamily: fonts.bodyMedium, fontSize: 10, color: theme.mutedText },

    contactRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    callButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: theme.brandFill,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
    },
    callButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.white },
    chatButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1.5,
      borderColor: theme.headingText,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
    },
    chatButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText },
    whatsappButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: theme.success,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
    },
    whatsappButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.white },

    reportLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', marginTop: spacing.lg },
    reportLinkText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.mutedText },

    compareBar: {
      position: 'absolute',
      bottom: spacing.lg,
      left: spacing.lg,
      right: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: theme.brandFill,
      borderRadius: radii.pill,
      paddingVertical: spacing.md,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    compareBarText: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.onBrandFill },
  });
}
