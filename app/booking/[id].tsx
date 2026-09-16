import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { BOOKING_TYPE_FIELDS, BOOKING_TYPE_LABEL_KEY, HALL_TYPE_LABEL_KEY, isAccommodationType } from '@/src/lib/bookingTypes';
import { openGoogleMapsNavigation } from '@/src/lib/directions';
import { getOrCreateConversation } from '@/src/lib/chat';
import { addFavorite, isFavorited, removeFavorite } from '@/src/lib/favorites';
import { recordListingView } from '@/src/lib/analytics';
import { AuthPromptModal, useAuthPrompt } from '@/src/components/AuthPrompt';
import { DateRangeCalendar, toISODate } from '@/src/components/DateRangeCalendar';
import { formatDateRange, formatDayMonth } from '@/src/lib/arabicDate';
import {
  createReservation,
  fetchBookingAmenityTypes,
  fetchBookingListingDetail,
  fetchUnavailableRanges,
  type BookingAmenityType,
  type BookingListingDetail,
  type CreatedReservation,
  type UnavailableRange,
} from '@/src/lib/bookings';
import { LoadingState } from '@/src/components/LoadingState';
import { EmptyState } from '@/src/components/EmptyState';
import { PrimaryButton } from '@/src/components/PrimaryButton';

const { width } = Dimensions.get('window');

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function isValidFutureRange(checkIn: string | null, checkOut: string | null): boolean {
  if (!checkIn || !checkOut) return false;
  const todayIso = toISODate(new Date());
  return checkIn >= todayIso && checkOut > checkIn;
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

function RuleRow({ label, value, theme }: { label: string; value: string; theme: ThemeColors }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.ruleRow}>
      <Text style={styles.ruleLabel}>{label}</Text>
      <Text style={styles.ruleValue}>{value}</Text>
    </View>
  );
}

export default function BookingDetailsScreen() {
  const params = useLocalSearchParams<{ id: string; checkIn?: string; checkOut?: string; intent?: string }>();
  const { id, intent } = params;
  const { t, locale } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [detail, setDetail] = useState<BookingListingDetail | null>(null);
  const [unavailableRanges, setUnavailableRanges] = useState<UnavailableRange[]>([]);
  const [amenityTypes, setAmenityTypes] = useState<BookingAmenityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);
  const [startingChat, setStartingChat] = useState(false);

  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const seededFromParams = useRef(false);

  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [draftCheckIn, setDraftCheckIn] = useState<string | null>(null);
  const [draftCheckOut, setDraftCheckOut] = useState<string | null>(null);
  const [dateSheetError, setDateSheetError] = useState<string | null>(null);

  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<CreatedReservation | null>(null);

  const { authPromptVisible, authPromptIntent, showAuthPrompt, hideAuthPrompt } = useAuthPrompt();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data: listingData }, { data: rangesData }, { data: amenityData }, { data: authData }] = await Promise.all([
        fetchBookingListingDetail(id),
        fetchUnavailableRanges(id),
        fetchBookingAmenityTypes(),
        supabase.auth.getUser(),
      ]);
      if (cancelled) return;
      setDetail(listingData);
      setUnavailableRanges(rangesData);
      setAmenityTypes(amenityData);
      setNotFound(!listingData || listingData.status !== 'published');
      const uid = authData.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid) {
        const alreadyFavorited = await isFavorited(uid, id);
        if (!cancelled) setFavorited(alreadyFavorited);
      }

      // إحصائيات إعلاني — real, deduplicated view event; skipped for the
      // booking listing's own owner, same rule as the sale/rent details screen.
      if (listingData && uid !== listingData.ownerId) {
        recordListingView({ bookingListingId: listingData.id });
      }
      if (!seededFromParams.current) {
        seededFromParams.current = true;
        if (params.checkIn && params.checkOut && isValidFutureRange(params.checkIn, params.checkOut)) {
          setCheckIn(params.checkIn);
          setCheckOut(params.checkOut);
        }
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, params.checkIn, params.checkOut]);

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : null;
  const total = nights && detail ? nights * detail.priceUsd : null;

  const amenityNames = useMemo(() => {
    if (!detail) return [];
    return detail.amenities
      .map((key) => amenityTypes.find((a) => a.key === key))
      .filter((a): a is BookingAmenityType => a != null)
      .map((a) => (locale === 'ar' ? a.nameAr : a.nameEn));
  }, [detail, amenityTypes, locale]);

  const handlePhotoScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

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
    if (error) setFavorited(!next);
  };

  const shareListing = () => {
    if (!detail) return;
    const priceLine = isAccommodationType(detail.bookingType)
      ? t('booking.pricePerNight', { price: groupThousands(detail.priceUsd) })
      : t('booking.pricePerEvent', { price: groupThousands(detail.priceUsd) });
    Share.share({ message: `${detail.title} — ${priceLine}` }).catch(() => {});
  };

  const callOwner = () => {
    if (!detail) return;
    if (!currentUserId) {
      showAuthPrompt('call');
      return;
    }
    Linking.openURL(`tel:${detail.contactPhone}`);
  };

  const openWhatsApp = () => {
    if (!detail) return;
    if (!currentUserId) {
      showAuthPrompt('whatsapp');
      return;
    }
    const phoneDigits = detail.contactPhone.replace(/[^0-9]/g, '');
    const message = encodeURIComponent(t('listingDetail.whatsappMessage').replace('{{title}}', detail.title));
    Linking.openURL(`https://wa.me/${phoneDigits}?text=${message}`);
  };

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

  const openNavigation = () => {
    if (!detail) return;
    openGoogleMapsNavigation({ lat: detail.lat, lng: detail.lng });
  };

  const openNearbyMap = () => {
    if (!detail) return;
    router.push({ pathname: '/listing/nearby-map', params: { lat: String(detail.lat), lng: String(detail.lng), title: detail.title } });
  };

  const openDateSheet = () => {
    setDraftCheckIn(checkIn);
    setDraftCheckOut(checkOut);
    setDateSheetError(null);
    setDateSheetOpen(true);
  };

  const applyDates = () => {
    if (!draftCheckIn || !draftCheckOut || !detail) {
      setDateSheetError(t('booking.invalidDateRange'));
      return;
    }
    const n = nightsBetween(draftCheckIn, draftCheckOut);
    if (n < detail.minimumNights) {
      setDateSheetError(t('booking.minNightsError', { count: detail.minimumNights }));
      return;
    }
    if (detail.maximumNights != null && n > detail.maximumNights) {
      setDateSheetError(t('booking.maxNightsError', { count: detail.maximumNights }));
      return;
    }
    setCheckIn(draftCheckIn);
    setCheckOut(draftCheckOut);
    setDateSheetOpen(false);
  };

  const handleBook = async () => {
    if (!detail || !checkIn || !checkOut || booking) return;
    if (!currentUserId) {
      showAuthPrompt('book');
      return;
    }
    setBooking(true);
    setBookingError(null);
    const { data, error } = await createReservation(detail.id, checkIn, checkOut);
    setBooking(false);
    if (error || !data) {
      setBookingError(error === 'booking_failed' || !error ? t('booking.bookingFailed') : t('booking.bookingUnavailableError'));
      const { data: freshRanges } = await fetchUnavailableRanges(detail.id);
      setUnavailableRanges(freshRanges);
      return;
    }
    setConfirmed(data);
  };

  const resumedIntentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!intent || !currentUserId || !detail) return;
    if (resumedIntentRef.current === intent) return;
    resumedIntentRef.current = intent;
    const timeout = setTimeout(() => {
      if (intent === 'favorite') toggleFavorite();
      else if (intent === 'call') callOwner();
      else if (intent === 'whatsapp') openWhatsApp();
      else if (intent === 'chat') openInAppChat();
      else if (intent === 'book') handleBook();
    }, 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers recreated every render; only resume trigger should re-run this
  }, [intent, currentUserId, detail]);

  if (loading) {
    return <LoadingState />;
  }

  if (notFound || !detail) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        message={t('booking.notBookable')}
        actionLabel={t('postListing.back')}
        onAction={() => router.back()}
      />
    );
  }

  if (confirmed) {
    return (
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={styles.confirmScroll}>
          <View style={styles.confirmIconWrap}>
            <Ionicons name="checkmark-circle" size={64} color={theme.headingText} />
          </View>
          <Text style={styles.confirmTitle}>{t('booking.confirmationTitle')}</Text>
          <Text style={styles.confirmBody}>{t('booking.confirmationBody')}</Text>

          <View style={styles.confirmCard}>
            <RuleRow label={t('booking.referenceLabel')} value={confirmed.referenceCode} theme={theme} />
            <RuleRow label={t('booking.detailsTitle')} value={detail.title} theme={theme} />
            <RuleRow label={t('booking.checkInLabel')} value={checkIn ? formatDayMonth(checkIn, locale) : ''} theme={theme} />
            <RuleRow label={t('booking.checkOutLabel')} value={checkOut ? formatDayMonth(checkOut, locale) : ''} theme={theme} />
            <RuleRow label={t('booking.nightsCount', { count: confirmed.nights })} value="" theme={theme} />
            <RuleRow label={t('booking.total')} value={`$${groupThousands(confirmed.totalPriceUsd)}`} theme={theme} />
          </View>

          <PrimaryButton label={t('booking.backToBookings')} onPress={() => router.replace('/(tabs)/account')} style={styles.confirmPrimaryButton} />
          <View style={styles.confirmActionsRow}>
            <Pressable style={styles.confirmActionButton} onPress={callOwner}>
              <Ionicons name="call-outline" size={14} color={theme.headingText} />
              <Text style={styles.confirmActionText}>{t('booking.contactAdvertiser')}</Text>
            </Pressable>
            <Pressable style={styles.confirmActionButton} onPress={openNavigation}>
              <Ionicons name="navigate-outline" size={14} color={theme.headingText} />
              <Text style={styles.confirmActionText}>{t('booking.goToLocation')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  const fieldFlags = BOOKING_TYPE_FIELDS[detail.bookingType];
  const accommodation = isAccommodationType(detail.bookingType);
  const locationLine = [detail.area, detail.city, locale === 'ar' ? detail.governorateNameAr : detail.governorateNameEn]
    .filter(Boolean)
    .join('، ');
  const canBook =
    isValidFutureRange(checkIn, checkOut) &&
    nights != null &&
    nights >= detail.minimumNights &&
    (detail.maximumNights == null || nights <= detail.maximumNights);

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
              renderItem={({ item }) => <Image source={{ uri: item }} style={styles.heroPhoto} />}
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
            <View style={styles.galleryTopRightRow}>
              {currentUserId === detail.ownerId && (
                <Pressable style={styles.circleButton} onPress={() => router.push(`/booking-settings/${detail.id}`)}>
                  <Ionicons name="create-outline" size={17} color={theme.headingText} />
                </Pressable>
              )}
              <Pressable style={styles.circleButton} onPress={shareListing}>
                <Ionicons name="share-outline" size={17} color={theme.headingText} />
              </Pressable>
              <Pressable style={styles.circleButton} onPress={toggleFavorite} disabled={togglingFavorite}>
                <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={18} color={favorited ? theme.accentGold : theme.headingText} />
              </Pressable>
            </View>
          </SafeAreaView>
          {detail.photos.length > 0 && (
            <View style={styles.galleryBottomRow} pointerEvents="none">
              <View style={styles.pageIndicator}>
                <Text style={styles.pageIndicatorText}>{`${photoIndex + 1} / ${detail.photos.length}`}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.content}>
          <Text style={styles.categoryEyebrow}>{t(BOOKING_TYPE_LABEL_KEY[detail.bookingType])}</Text>
          <Text style={styles.title}>{detail.title}</Text>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color={theme.mutedText} />
            <Text style={styles.locationText}>{locationLine || '—'}</Text>
          </View>

          <Text style={styles.mapSectionLabel}>{t('listingDetail.locationOnMap')}</Text>
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
          </Pressable>
          <Pressable style={styles.navigateButton} onPress={openNavigation}>
            <Ionicons name="navigate-outline" size={16} color={theme.onBrandFill} />
            <Text style={styles.navigateButtonText}>{t('listingDetail.goToLocation')}</Text>
          </Pressable>

          <Text style={styles.price}>
            {accommodation
              ? t('booking.pricePerNight', { price: groupThousands(detail.priceUsd) })
              : t('booking.pricePerEvent', { price: groupThousands(detail.priceUsd) })}
          </Text>

          <Pressable style={styles.dateCard} onPress={openDateSheet}>
            <View style={styles.dateCardRow}>
              <Ionicons name="calendar-outline" size={16} color={theme.headingText} />
              <Text style={styles.dateCardText}>
                {checkIn && checkOut ? formatDateRange(checkIn, checkOut, locale) : t('booking.selectDates')}
              </Text>
            </View>
            <Text style={styles.dateCardChange}>{t('booking.changeDates')}</Text>
          </Pressable>
          {!accommodation && <Text style={styles.selectDatesHint}>{t('booking.hallSingleDayNote')}</Text>}

          {nights != null && total != null ? (
            <View style={styles.priceBreakdown}>
              <RuleRow
                label={
                  accommodation
                    ? t('booking.pricePerNight', { price: groupThousands(detail.priceUsd) })
                    : t('booking.pricePerEvent', { price: groupThousands(detail.priceUsd) })
                }
                value=""
                theme={theme}
              />
              {accommodation && <RuleRow label={t('booking.nightsCount', { count: nights })} value="" theme={theme} />}
              <View style={styles.priceBreakdownTotalRow}>
                <Text style={styles.priceBreakdownTotalLabel}>{t('booking.total')}</Text>
                <Text style={styles.priceBreakdownTotalValue}>${groupThousands(total)}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.selectDatesHint}>{t('booking.selectDates')}</Text>
          )}

          <Text style={styles.sectionTitle}>{t('booking.specsLabel')}</Text>
          <View style={styles.detailsGrid}>
            {fieldFlags.areaSqm && detail.areaSqm != null && (
              <DetailCell icon="resize-outline" label={t('booking.areaLabel')} value={`${detail.areaSqm} م²`} theme={theme} />
            )}
            {fieldFlags.streetWidth && detail.streetWidthM != null && (
              <DetailCell icon="trail-sign-outline" label={t('booking.streetWidthLabel')} value={`${detail.streetWidthM} م`} theme={theme} />
            )}
            {fieldFlags.propertyAge && detail.propertyAgeYears != null && (
              <DetailCell icon="time-outline" label={t('booking.propertyAgeLabel')} value={String(detail.propertyAgeYears)} theme={theme} />
            )}
            {fieldFlags.category && !!detail.category && (
              <DetailCell icon="pricetag-outline" label={t('booking.categoryLabel')} value={detail.category} theme={theme} />
            )}
            {fieldFlags.bedrooms && detail.bedrooms != null && (
              <DetailCell icon="bed-outline" label={t('postListing.bedroomsLabel')} value={String(detail.bedrooms)} theme={theme} />
            )}
            {fieldFlags.masterBedrooms && detail.masterBedrooms != null && (
              <DetailCell icon="key-outline" label={t('booking.masterBedroomsLabel')} value={String(detail.masterBedrooms)} theme={theme} />
            )}
            {fieldFlags.livingRooms && detail.livingRooms != null && (
              <DetailCell icon="tv-outline" label={t('booking.livingRoomsLabel')} value={String(detail.livingRooms)} theme={theme} />
            )}
            {fieldFlags.receptionRooms && detail.receptionRooms != null && (
              <DetailCell icon="people-circle-outline" label={t('booking.receptionRoomsLabel')} value={String(detail.receptionRooms)} theme={theme} />
            )}
            {fieldFlags.bathrooms && detail.bathrooms != null && (
              <DetailCell icon="water-outline" label={t('postListing.bathroomsLabel')} value={String(detail.bathrooms)} theme={theme} />
            )}
            {fieldFlags.beds && detail.beds != null && (
              <DetailCell icon="moon-outline" label={t('booking.bedsLabel')} value={String(detail.beds)} theme={theme} />
            )}
            {fieldFlags.floorNumber && detail.floorNumber != null && (
              <DetailCell
                icon="layers-outline"
                label={t(detail.bookingType === 'furnished_villa' ? 'booking.numberOfFloorsLabel' : 'booking.floorLabel')}
                value={String(detail.floorNumber)}
                theme={theme}
              />
            )}
            {fieldFlags.hallFields && detail.hallType && (
              <DetailCell icon="business-outline" label={t('booking.hallTypeLabel')} value={t(HALL_TYPE_LABEL_KEY[detail.hallType])} theme={theme} />
            )}
            {fieldFlags.hallFields && detail.numberOfHalls != null && (
              <DetailCell icon="layers-outline" label={t('booking.numberOfHallsLabel')} value={String(detail.numberOfHalls)} theme={theme} />
            )}
          </View>

          {amenityNames.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>{t('booking.placeFeaturesLabel')}</Text>
              <View style={styles.tagsRow}>
                {amenityNames.map((name) => (
                  <View key={name} style={styles.statusTag}>
                    <Text style={styles.statusTagText}>{name}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={styles.sectionTitle}>{t('postListing.descriptionLabel')}</Text>
          <Text style={styles.descriptionText} numberOfLines={descriptionExpanded ? undefined : 4}>
            {detail.description}
          </Text>
          {detail.description.length > 160 && (
            <Pressable onPress={() => setDescriptionExpanded((v) => !v)} hitSlop={8}>
              <Text style={styles.readMoreText}>{descriptionExpanded ? t('booking.readLess') : t('booking.readMore')}</Text>
            </Pressable>
          )}

          <Text style={styles.sectionTitle}>{t('booking.bookingRulesLabel')}</Text>
          <View style={styles.rulesCard}>
            {accommodation && (
              <RuleRow label={t('booking.minimumStayLabel')} value={t('booking.minimumStayValue', { count: detail.minimumNights })} theme={theme} />
            )}
            {accommodation && detail.maximumNights != null && (
              <RuleRow label={t('booking.maximumNightsLabel')} value={t('booking.nightsCount', { count: detail.maximumNights })} theme={theme} />
            )}
            {detail.checkInTime && <RuleRow label={t('booking.checkInTimeLabel')} value={detail.checkInTime.slice(0, 5)} theme={theme} />}
            {detail.checkOutTime && <RuleRow label={t('booking.checkOutTimeLabel')} value={detail.checkOutTime.slice(0, 5)} theme={theme} />}
            {detail.securityDepositUsd != null && (
              <RuleRow label={t('booking.securityDepositLabel')} value={`$${groupThousands(detail.securityDepositUsd)}`} theme={theme} />
            )}
            {detail.cancellationPolicy && <RuleRow label={t('booking.cancellationPolicyLabel')} value={detail.cancellationPolicy} theme={theme} />}
            {detail.bookingInstructions && <RuleRow label={t('booking.bookingInstructionsLabel')} value={detail.bookingInstructions} theme={theme} />}
          </View>

          <Pressable style={styles.posterCard} onPress={() => router.push(`/profile/${detail.ownerId}`)}>
            {detail.ownerAvatarUrl ? (
              <Image source={{ uri: detail.ownerAvatarUrl }} style={styles.posterAvatar} />
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

          <View style={styles.contactRow}>
            <Pressable style={styles.callButton} onPress={callOwner}>
              <Ionicons name="call-outline" size={15} color={theme.white} />
              <Text style={styles.callButtonText}>{t('listingDetail.call')}</Text>
            </Pressable>
            <Pressable style={styles.whatsappButton} onPress={openWhatsApp}>
              <Ionicons name="logo-whatsapp" size={16} color={theme.white} />
              <Text style={styles.whatsappButtonText}>{t('listingDetail.whatsapp')}</Text>
            </Pressable>
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
          </View>
        </View>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        {bookingError && <Text style={styles.footerError}>{bookingError}</Text>}
        {checkIn && checkOut && total != null && (
          <View style={styles.footerSummaryRow}>
            <View>
              <Text style={styles.footerSummaryDates}>{formatDateRange(checkIn, checkOut, locale)}</Text>
              {accommodation && nights != null && <Text style={styles.footerSummaryNights}>{t('booking.nightsCount', { count: nights })}</Text>}
            </View>
            <Text style={styles.footerSummaryTotal}>${groupThousands(total)}</Text>
          </View>
        )}
        <Pressable style={[styles.bookButton, !canBook && styles.bookButtonDisabled]} onPress={handleBook} disabled={!canBook || booking}>
          {booking ? (
            <ActivityIndicator size="small" color={theme.onBrandFill} />
          ) : (
            <Text style={styles.bookButtonText}>{currentUserId ? t('booking.bookNow') : t('booking.loginToBook')}</Text>
          )}
        </Pressable>
      </SafeAreaView>

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
            <DateRangeCalendar
              checkIn={draftCheckIn}
              checkOut={draftCheckOut}
              onChange={(ci, co) => {
                setDraftCheckIn(ci);
                setDraftCheckOut(co);
                setDateSheetError(null);
              }}
              unavailableRanges={unavailableRanges}
              minimumNights={detail.minimumNights}
            />
            {dateSheetError && <Text style={styles.dateSheetError}>{dateSheetError}</Text>}
            <View style={styles.sheetFooter}>
              <PrimaryButton label={t('booking.applyFilters')} onPress={applyDates} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <AuthPromptModal visible={authPromptVisible} onClose={hideAuthPrompt} intent={authPromptIntent} />
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
    scrollContent: { paddingBottom: spacing.xxl },

    galleryWrap: { height: 280, backgroundColor: theme.surfaceAlt },
    heroPhoto: { width, height: 280, backgroundColor: theme.surfaceAlt },
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
    circleButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
    galleryTopRightRow: { flexDirection: 'row', gap: spacing.sm },
    galleryBottomRow: { position: 'absolute', bottom: spacing.md, left: spacing.lg, right: spacing.lg, alignItems: 'flex-end' },
    pageIndicator: { backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill },
    pageIndicatorText: { fontFamily: fonts.bodyMedium, fontSize: 9, color: '#fff' },

    content: { padding: spacing.lg },
    categoryEyebrow: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.accentGold, marginBottom: 4 },
    title: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.screenTitle, color: theme.headingText, marginBottom: spacing.xs },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm },
    locationText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText },
    price: { fontFamily: fonts.headingBlack, fontSize: fontSizes.screenTitle, color: theme.headingText, marginTop: spacing.md, marginBottom: spacing.md },

    dateCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      ...shadow,
    },
    dateCardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
    dateCardText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    dateCardChange: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.headingText },

    selectDatesHint: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText, marginTop: spacing.sm },
    priceBreakdown: { backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md, marginTop: spacing.sm },
    priceBreakdownTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.sm, marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: theme.border },
    priceBreakdownTotalLabel: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    priceBreakdownTotalValue: { fontFamily: fonts.headingBlack, fontSize: fontSizes.sectionTitle, color: theme.headingText },

    sectionTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText, marginTop: spacing.lg, marginBottom: spacing.md },
    detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    detailCell: { width: '31%', backgroundColor: theme.surface, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center', gap: 4 },
    detailCellValue: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    detailCellLabel: { fontFamily: fonts.bodyRegular, fontSize: 9, color: theme.mutedText, textAlign: 'center' },

    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    statusTag: { backgroundColor: theme.surfaceAlt, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
    statusTagText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.bodyText },

    descriptionText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.body, color: theme.bodyText, lineHeight: 22 },
    readMoreText: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.headingText, marginTop: spacing.xs },

    rulesCard: { backgroundColor: theme.surface, borderRadius: radii.lg, paddingHorizontal: spacing.md },
    ruleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.border, gap: spacing.md },
    ruleLabel: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText, flexShrink: 1 },
    ruleValue: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.bodyText, flexShrink: 1, textAlign: 'right' },

    mapSectionLabel: { fontFamily: fonts.bodyMedium, fontSize: 10.5, color: theme.mutedText, marginBottom: spacing.xs },
    mapPreview: { height: 160, borderRadius: radii.lg, overflow: 'hidden' },
    navigateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.brandFill, borderRadius: radii.md, paddingVertical: spacing.md, marginTop: spacing.sm },
    navigateButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.onBrandFill },

    posterCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md, marginTop: spacing.lg },
    posterAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.surfaceAlt },
    posterAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    posterInfo: { flex: 1, gap: 2 },
    posterName: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText },
    posterVerifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    posterVerifiedText: { fontFamily: fonts.bodyMedium, fontSize: 10, color: theme.mutedText },

    contactRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    callButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.brandFill, borderRadius: radii.md, paddingVertical: spacing.md },
    callButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.white },
    chatButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: theme.headingText, borderRadius: radii.md, paddingVertical: spacing.md },
    chatButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText },
    whatsappButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.success, borderRadius: radii.md, paddingVertical: spacing.md },
    whatsappButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.white },

    footer: { backgroundColor: theme.background, borderTopWidth: 1, borderTopColor: theme.border, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs },
    footerError: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.danger, textAlign: 'center' },
    footerSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    footerSummaryDates: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    footerSummaryNights: { fontFamily: fonts.bodyRegular, fontSize: 10.5, color: theme.mutedText, marginTop: 1 },
    footerSummaryTotal: { fontFamily: fonts.headingBlack, fontSize: fontSizes.sectionTitle, color: theme.headingText },
    bookButton: { backgroundColor: theme.brandFill, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    bookButtonDisabled: { backgroundColor: theme.surfaceAlt },
    bookButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.onBrandFill },

    overlay: { flex: 1, backgroundColor: 'rgba(11,43,33,0.28)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: theme.background, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, maxHeight: '85%', padding: spacing.lg },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: theme.surfaceAlt, alignSelf: 'center', marginBottom: spacing.sm },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
    sheetTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.sectionTitle, color: theme.headingText },
    sheetFooter: { paddingTop: spacing.sm },
    dateSheetError: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.danger, textAlign: 'center', marginTop: spacing.sm },

    confirmScroll: { flexGrow: 1, padding: spacing.xl, alignItems: 'center', justifyContent: 'center' },
    confirmIconWrap: { marginBottom: spacing.md },
    confirmTitle: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.sectionTitle, color: theme.headingText, textAlign: 'center', marginBottom: spacing.xs },
    confirmBody: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText, textAlign: 'center', marginBottom: spacing.lg },
    confirmCard: { width: '100%', backgroundColor: theme.surface, borderRadius: radii.lg, paddingHorizontal: spacing.md, marginBottom: spacing.lg },
    confirmPrimaryButton: { width: '100%' },
    confirmActionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, width: '100%' },
    confirmActionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1.5,
      borderColor: theme.headingText,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
    },
    confirmActionText: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.headingText },
  });
}
