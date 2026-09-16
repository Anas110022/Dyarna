import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { isValidLocalNumber, splitE164, toE164 } from '@/src/lib/phone';
import { DEFAULT_COUNTRY, type CountryCode } from '@/src/lib/countryCodes';
import { PhoneInput } from '@/src/components/PhoneInput';
import { fetchGovernorates, fetchOwnProfile, type Governorate } from '@/src/lib/listings';
import { reverseGeocode } from '@/src/lib/geocoding';
import { SYRIA_DEFAULT_REGION } from '@/src/lib/mapRegion';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import type { AdvertiserType } from '@/src/lib/account';
import { AdvertiserRequirementsStep, AdvertiserTypeStep } from '@/src/components/AdvertiserVerificationFlow';
import { TimePicker } from '@/src/components/TimePicker';
import { AvailabilityToggleCalendar } from '@/src/components/AvailabilityToggleCalendar';
import { AppHeader } from '@/src/components/AppHeader';
import { LoadingState } from '@/src/components/LoadingState';
import { FormInput } from '@/src/components/FormInput';
import { SelectInput } from '@/src/components/SelectInput';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import {
  ALL_HALL_TYPES,
  BOOKING_TYPE_FIELDS,
  BOOKING_TYPE_LABEL_KEY,
  HALL_TYPE_LABEL_KEY,
  isAccommodationType,
  priceUnitForType,
  type BookingListingType,
  type HallType,
} from '@/src/lib/bookingTypes';
import {
  addBookingListingBlackoutDates,
  attachBookingListingPhotos,
  createBookingListing,
  fetchBookingAmenityTypes,
  publishBookingListingIfEligible,
  uploadBookingListingPhoto,
  type BookingAmenityType,
} from '@/src/lib/bookings';

const TOTAL_STEPS = 8;

const CATEGORY_OPTIONS = ['booking.categoryEconomy', 'booking.categoryStandard', 'booking.categoryLuxury', 'booking.categoryVip'];

const AMENITY_PREVIEW_CAP = 8;

// New listings can only be created as one of these 3 types. Existing
// chalet/wedding_hall listings (if any) and the customer-facing browse
// filters are untouched — this only narrows what a NEW posting can pick.
const POSTABLE_BOOKING_TYPES: BookingListingType[] = ['furnished_apartment', 'furnished_studio', 'furnished_villa'];

// Fixed two-column arrangement for step 7's مميزات الوحدة grid — identical
// for all 3 postable types, since every one of these amenity keys now
// applies to all 3 (see 20260921000000_booking_amenities_v3.sql).
const RIGHT_FEATURE_ORDER = ['kitchen', 'family_section', 'sewage', 'car_entrance', 'wifi', 'garden'];
const LEFT_FEATURE_ORDER = ['pool', 'ac', 'water_supply', 'electricity_supply', 'parking', 'near_bus_station', 'elevator'];

function orderAmenities(amenities: BookingAmenityType[], order: string[]): BookingAmenityType[] {
  return order.map((key) => amenities.find((a) => a.key === key)).filter((a): a is BookingAmenityType => Boolean(a));
}

const TYPE_ICON: Record<BookingListingType, keyof typeof Ionicons.glyphMap> = {
  furnished_apartment: 'business-outline',
  furnished_studio: 'square-outline',
  furnished_villa: 'home-outline',
  chalet: 'leaf-outline',
  wedding_hall: 'sparkles-outline',
};

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function parseIntOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

type WizardForm = {
  advertiserType: AdvertiserType | null;
  bookingType: BookingListingType | null;
  photos: { uri: string }[];
  title: string;
  contactPhoneLocal: string;
  contactPhoneCountry: CountryCode;
  governorateId: string | null;
  pin: { lat: number; lng: number } | null;
  city: string | null;
  area: string | null;
  street: string | null;
  description: string;
  priceUsd: string;
  minimumNights: string;
  maximumNights: string;
  bedrooms: string;
  bathrooms: string;
  beds: string;
  hallType: HallType | null;
  numberOfHalls: string;
  areaSqm: string;
  livingRooms: string;
  floorNumber: string;
  streetWidthM: string;
  propertyAgeYears: string;
  category: string;
  masterBedrooms: string;
  receptionRooms: string;
  amenities: string[];
  checkInTime: string | null;
  checkOutTime: string | null;
  cancellationPolicy: string;
  securityDepositUsd: string;
  bookingInstructions: string;
  blockedDates: string[];
};

const INITIAL_FORM: WizardForm = {
  advertiserType: null,
  bookingType: null,
  photos: [],
  title: '',
  contactPhoneLocal: '',
  contactPhoneCountry: DEFAULT_COUNTRY,
  governorateId: null,
  pin: null,
  city: null,
  area: null,
  street: null,
  description: '',
  priceUsd: '',
  minimumNights: '1',
  maximumNights: '',
  bedrooms: '',
  bathrooms: '',
  beds: '',
  hallType: null,
  numberOfHalls: '',
  areaSqm: '',
  livingRooms: '',
  floorNumber: '',
  streetWidthM: '',
  propertyAgeYears: '',
  category: '',
  masterBedrooms: '',
  receptionRooms: '',
  amenities: [],
  checkInTime: null,
  checkOutTime: null,
  cancellationPolicy: '',
  securityDepositUsd: '',
  bookingInstructions: '',
  blockedDates: [],
};

function FeatureCheckboxCard({ label, active, onPress, theme }: { label: string; active: boolean; onPress: () => void; theme: ThemeColors }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Pressable style={styles.featureCard} onPress={onPress}>
      <Ionicons name={active ? 'checkmark-circle' : 'square-outline'} size={20} color={active ? theme.success : theme.mutedText} />
      <Text style={styles.featureCardText}>{label}</Text>
    </Pressable>
  );
}

function ReviewRow({ label, value, theme }: { label: string; value: string; theme: ThemeColors }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (!value) return null;
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewRowLabel}>{label}</Text>
      <Text style={styles.reviewRowValue}>{value}</Text>
    </View>
  );
}

function PreviewSpec({ icon, label, value, theme }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; theme: ThemeColors }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.previewSpecCell}>
      <Ionicons name={icon} size={16} color={theme.headingText} />
      <Text style={styles.previewSpecValue}>{value}</Text>
      <Text style={styles.previewSpecLabel}>{label}</Text>
    </View>
  );
}

export default function PostBookingListingScreen() {
  const { t, locale } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mapRef = useRef<MapView>(null);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardForm>(INITIAL_FORM);
  const [userId, setUserId] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [typeChosen, setTypeChosen] = useState(false);
  const [requirementsSubmitted, setRequirementsSubmitted] = useState(false);
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [governoratePickerOpen, setGovernoratePickerOpen] = useState(false);
  const [amenityTypes, setAmenityTypes] = useState<BookingAmenityType[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [published, setPublished] = useState(false);
  // Set only when the listing + photos are already safely saved and just
  // the final publish-eligibility call itself failed — same fix as the
  // normal real-estate flow's identical bug (see app/post-listing.tsx).
  const [publishRetryId, setPublishRetryId] = useState<string | null>(null);
  const [retryingPublish, setRetryingPublish] = useState(false);
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState(0);
  const [previewCarouselWidth, setPreviewCarouselWidth] = useState(0);

  const update = useCallback(<K extends keyof WizardForm>(key: K, value: WizardForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        setAuthRequired(true);
        setInitializing(false);
        return;
      }
      setUserId(user.id);

      const { phone, isVerified } = await fetchOwnProfile(user.id);
      if (phone) {
        const { country, local } = splitE164(phone);
        update('contactPhoneCountry', country);
        update('contactPhoneLocal', local);
      }
      if (isVerified) {
        setTypeChosen(true);
        setRequirementsSubmitted(true);
      }

      const { data: govs } = await fetchGovernorates();
      setGovernorates(govs);

      const { data: amenities } = await fetchBookingAmenityTypes();
      setAmenityTypes(amenities);

      setInitializing(false);
    })();
  }, [update]);

  const handlePinChange = useCallback(
    async (coordinate: { latitude: number; longitude: number }) => {
      update('pin', { lat: coordinate.latitude, lng: coordinate.longitude });
      update('city', null);
      update('area', null);
      update('street', null);
      setGeocodeError(false);
      setGeocoding(true);
      const { result, error } = await reverseGeocode(coordinate.latitude, coordinate.longitude, locale);
      setGeocoding(false);
      if (error || !result) {
        setGeocodeError(true);
        return;
      }
      update('city', result.city);
      update('area', result.area);
      update('street', result.street);
    },
    [locale, update]
  );

  const pickPhotos = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 0,
      quality: 0.7,
    });
    if (!result.canceled) {
      update('photos', [...form.photos, ...result.assets.map((a) => ({ uri: a.uri }))]);
    }
  }, [form.photos, update]);

  const removePhoto = useCallback(
    (uri: string) => {
      update(
        'photos',
        form.photos.filter((p) => p.uri !== uri)
      );
    },
    [form.photos, update]
  );

  // The cover/main photo is always index 0 — "setting" a cover just moves
  // that photo to the front, same array the rest of the flow already reads.
  const setCoverPhoto = useCallback(
    (uri: string) => {
      const target = form.photos.find((p) => p.uri === uri);
      if (!target) return;
      update('photos', [target, ...form.photos.filter((p) => p.uri !== uri)]);
    },
    [form.photos, update]
  );

  const toggleBlockedDate = useCallback(
    (iso: string) => {
      update('blockedDates', form.blockedDates.includes(iso) ? form.blockedDates.filter((d) => d !== iso) : [...form.blockedDates, iso].sort());
    },
    [form.blockedDates, update]
  );

  const fieldFlags = form.bookingType ? BOOKING_TYPE_FIELDS[form.bookingType] : null;
  const accommodation = form.bookingType ? isAccommodationType(form.bookingType) : true;
  const applicableAmenities = form.bookingType
    ? amenityTypes.filter((a) => a.applicableBookingTypes.includes(form.bookingType as BookingListingType))
    : [];

  const step1Valid = form.bookingType !== null;
  const step2Valid = form.photos.length >= 3;
  const step3Valid = isValidLocalNumber(form.contactPhoneLocal, form.contactPhoneCountry) && form.governorateId !== null && form.pin !== null;
  const step4Valid = useMemo(() => {
    if (form.title.trim().length === 0) return false;
    if (!accommodation && !form.hallType) return false;
    return true;
  }, [form.title, form.hallType, accommodation]);
  const step5Valid = useMemo(() => {
    if (!form.priceUsd || Number(form.priceUsd) <= 0) return false;
    if (accommodation && (!form.minimumNights || Number(form.minimumNights) < 1)) return false;
    return true;
  }, [form.priceUsd, form.minimumNights, accommodation]);
  const step7Valid = form.description.trim().length >= 20;

  const formValid = step1Valid && step2Valid && step3Valid && step4Valid && step5Valid && step7Valid;

  const stepValidity: Record<number, boolean> = {
    1: step1Valid,
    2: step2Valid,
    3: step3Valid,
    4: step4Valid,
    5: step5Valid,
    6: true,
    7: step7Valid,
    8: formValid,
  };
  const canGoNext = stepValidity[step] ?? false;

  const goNext = () => {
    if (!canGoNext) return;
    if (step < TOTAL_STEPS) setStep(step + 1);
  };

  const goBack = () => {
    if (step > 1) setStep(step - 1);
    else router.back();
  };

  const selectedGovernorate = governorates.find((g) => g.id === form.governorateId) ?? null;

  const handleSubmit = async () => {
    if (!userId || !form.bookingType || !form.governorateId || !form.pin || !fieldFlags || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const fallbackCity = selectedGovernorate ? (locale === 'ar' ? selectedGovernorate.name_ar : selectedGovernorate.name_en) : null;
    const cityToSave = form.city ?? fallbackCity;
    if (!cityToSave) {
      setSubmitting(false);
      return;
    }

    const { id, error: createError } = await createBookingListing({
      ownerId: userId,
      bookingType: form.bookingType,
      title: form.title.trim(),
      description: form.description.trim(),
      governorateId: form.governorateId,
      city: cityToSave,
      area: form.area,
      lat: form.pin.lat,
      lng: form.pin.lng,
      priceUsd: Math.trunc(Number(form.priceUsd)),
      priceUnit: priceUnitForType(form.bookingType),
      minimumNights: accommodation ? Math.max(1, parseIntOrNull(form.minimumNights) ?? 1) : 1,
      maximumNights: accommodation ? parseIntOrNull(form.maximumNights) : 1,
      bedrooms: fieldFlags.bedrooms ? parseIntOrNull(form.bedrooms) : null,
      bathrooms: fieldFlags.bathrooms ? parseIntOrNull(form.bathrooms) : null,
      beds: fieldFlags.beds ? parseIntOrNull(form.beds) : null,
      hallType: fieldFlags.hallFields ? form.hallType : null,
      numberOfHalls: fieldFlags.hallFields ? parseIntOrNull(form.numberOfHalls) : null,
      areaSqm: fieldFlags.areaSqm ? parseIntOrNull(form.areaSqm) : null,
      livingRooms: fieldFlags.livingRooms ? parseIntOrNull(form.livingRooms) : null,
      floorNumber: fieldFlags.floorNumber ? parseIntOrNull(form.floorNumber) : null,
      streetWidthM: fieldFlags.streetWidth ? parseIntOrNull(form.streetWidthM) : null,
      propertyAgeYears: fieldFlags.propertyAge ? parseIntOrNull(form.propertyAgeYears) : null,
      category: fieldFlags.category ? form.category.trim() || null : null,
      masterBedrooms: fieldFlags.masterBedrooms ? parseIntOrNull(form.masterBedrooms) : null,
      receptionRooms: fieldFlags.receptionRooms ? parseIntOrNull(form.receptionRooms) : null,
      amenities: applicableAmenities.length > 0 ? form.amenities : [],
      checkInTime: form.checkInTime,
      checkOutTime: form.checkOutTime,
      cancellationPolicy: form.cancellationPolicy.trim() || null,
      securityDepositUsd: parseIntOrNull(form.securityDepositUsd),
      bookingInstructions: form.bookingInstructions.trim() || null,
      contactPhone: toE164(form.contactPhoneLocal, form.contactPhoneCountry),
    });

    if (createError || !id) {
      setSubmitError(t('postListing.errorSubmitGeneric'));
      setSubmitting(false);
      return;
    }

    const uploadedPaths: string[] = [];
    for (let i = 0; i < form.photos.length; i += 1) {
      const { path } = await uploadBookingListingPhoto(userId, id, i, form.photos[i].uri);
      if (path) uploadedPaths.push(path);
    }

    if (uploadedPaths.length < 3) {
      setSubmitError(t('postListing.errorPhotoUpload'));
      setSubmitting(false);
      return;
    }

    const { error: attachError } = await attachBookingListingPhotos(id, uploadedPaths);
    if (attachError) {
      setSubmitError(t('postListing.errorPhotoUpload'));
      setSubmitting(false);
      return;
    }

    if (form.blockedDates.length > 0) {
      await addBookingListingBlackoutDates(id, form.blockedDates);
    }

    const { published: didPublish, error: publishError } = await publishBookingListingIfEligible(id);

    setSubmitting(false);

    if (publishError) {
      setPublishRetryId(id);
      setSubmitError(t('postListing.errorPublishGeneric'));
      return;
    }

    setPublished(didPublish);
    setSubmitted(true);
  };

  const handleRetryPublish = async () => {
    if (!publishRetryId || retryingPublish) return;
    setRetryingPublish(true);
    setSubmitError(null);
    const { published: didPublish, error: publishError } = await publishBookingListingIfEligible(publishRetryId);
    setRetryingPublish(false);

    if (publishError) {
      setSubmitError(t('postListing.errorPublishGeneric'));
      return;
    }

    setPublishRetryId(null);
    setPublished(didPublish);
    setSubmitted(true);
  };

  if (initializing) {
    return <LoadingState />;
  }

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  if (!typeChosen) {
    return (
      <View style={styles.flex}>
        <AppHeader title={t('advertiserVerification.title')} onBack={() => router.back()} />
        <AdvertiserTypeStep
          value={form.advertiserType}
          onNext={(type) => {
            update('advertiserType', type);
            setTypeChosen(true);
          }}
        />
      </View>
    );
  }

  if (!requirementsSubmitted && userId && form.advertiserType) {
    return (
      <View style={styles.flex}>
        <AppHeader title={t('advertiserVerification.title')} onBack={() => setTypeChosen(false)} />
        <AdvertiserRequirementsStep
          advertiserType={form.advertiserType}
          userId={userId}
          onSubmitted={() => setRequirementsSubmitted(true)}
          onBack={() => setTypeChosen(false)}
        />
      </View>
    );
  }

  if (submitted) {
    return (
      <View style={styles.successContainer}>
        <Ionicons name="checkmark-circle" size={64} color={theme.accentGold} />
        <Text style={styles.successTitle}>{published ? t('postListing.publishedTitle') : t('postListing.submitSuccessTitle')}</Text>
        <Text style={styles.successBody}>{published ? t('postListing.publishedBody') : t('postListing.submitSuccessBody')}</Text>
        <PrimaryButton label={t('postListing.backToHome')} onPress={() => router.replace('/(tabs)')} />
      </View>
    );
  }

  const stepTitleKey: Record<number, string> = {
    1: 'booking.step1TypeTitle',
    2: 'booking.step2PhotosTitle',
    3: 'booking.step3LocationTitle',
    4: 'booking.step4DetailsTitle',
    5: 'booking.step5PriceTitle',
    6: 'booking.step6AvailabilityTitle',
    7: 'booking.step7FeaturesTitle',
    8: 'booking.step8ReviewTitle',
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader title={t('booking.postBookingListingTitle')} onBack={goBack} />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.stepTitle}>{t(stepTitleKey[step])}</Text>

        {step === 1 && (
          <View style={styles.typeGrid}>
            {POSTABLE_BOOKING_TYPES.map((typeOption) => {
              const active = form.bookingType === typeOption;
              return (
                <Pressable
                  key={typeOption}
                  style={[styles.typeCard, active && styles.typeCardActive]}
                  onPress={() => update('bookingType', typeOption)}
                >
                  <Ionicons name={TYPE_ICON[typeOption]} size={26} color={active ? theme.onBrandFill : theme.headingText} />
                  <Text style={[styles.typeCardText, active && styles.typeCardTextActive]}>{t(BOOKING_TYPE_LABEL_KEY[typeOption])}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {step === 2 && (
          <View style={styles.formCard}>
            <Text style={styles.helperText}>{t('postListing.photosHelper')}</Text>
            <Text style={styles.counterText}>{t('postListing.photosCount', { count: form.photos.length })}</Text>
            <View style={styles.rowWrap}>
              {form.photos.map((p, i) => (
                <View key={p.uri} style={styles.photoThumbWrap}>
                  <Image source={{ uri: p.uri }} style={styles.photoThumb} />
                  {i === 0 ? (
                    <View style={styles.coverBadge}>
                      <Text style={styles.coverBadgeText}>{t('postListing.coverPhotoBadge')}</Text>
                    </View>
                  ) : (
                    <Pressable style={styles.setCoverButton} onPress={() => setCoverPhoto(p.uri)} hitSlop={6}>
                      <Ionicons name="star-outline" size={11} color={theme.white} />
                    </Pressable>
                  )}
                  <Pressable style={styles.photoRemove} onPress={() => removePhoto(p.uri)} hitSlop={8}>
                    <Ionicons name="close" size={12} color={theme.white} />
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.addPhotoTile} onPress={pickPhotos}>
                <Ionicons name="add" size={22} color={theme.headingText} />
                <Text style={styles.addPhotoText}>{t('postListing.addPhoto')}</Text>
              </Pressable>
            </View>
            {form.photos.length > 1 && <Text style={styles.helperText}>{t('postListing.coverPhotoHint')}</Text>}
            {form.photos.length < 3 && (
              <Text style={styles.missingItem}>
                • {t('postListing.photosLabel')} ({form.photos.length}/3)
              </Text>
            )}
          </View>
        )}

        {step === 3 && (
          <View>
            <View style={styles.formCard}>
              <Text style={styles.formCardHeading}>{t('postListing.contactPhoneLabel')}</Text>
              <Text style={styles.helperText}>{t('booking.contactStepHint')}</Text>
              <View style={styles.phoneRow}>
                <View style={styles.phoneInputFlex}>
                  <PhoneInput
                    country={form.contactPhoneCountry}
                    onCountryChange={(c) => update('contactPhoneCountry', c)}
                    value={form.contactPhoneLocal}
                    onChangeText={(v) => update('contactPhoneLocal', v)}
                    placeholder="9XX XXX XXX"
                  />
                </View>
                {isValidLocalNumber(form.contactPhoneLocal, form.contactPhoneCountry) && (
                  <Ionicons name="checkmark-circle" size={18} color={theme.success} />
                )}
              </View>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formCardHeading}>{t('postListing.mapLabel')}</Text>
              <SelectInput
                label={t('postListing.governorateLabel')}
                required
                value={selectedGovernorate ? (locale === 'ar' ? selectedGovernorate.name_ar : selectedGovernorate.name_en) : null}
                placeholder={t('postListing.governoratePlaceholder')}
                onPress={() => setGovernoratePickerOpen(true)}
                containerStyle={styles.field}
              />

              <Text style={styles.helperText}>{t('postListing.mapHelper')}</Text>
              <View style={styles.mapContainer}>
                <MapView
                  ref={mapRef}
                  provider={PROVIDER_GOOGLE}
                  style={StyleSheet.absoluteFill}
                  initialRegion={SYRIA_DEFAULT_REGION}
                  onMapReady={() => mapRef.current?.animateToRegion(SYRIA_DEFAULT_REGION, 0)}
                  onPress={(e) => handlePinChange(e.nativeEvent.coordinate)}
                >
                  {form.pin && (
                    <Marker
                      coordinate={{ latitude: form.pin.lat, longitude: form.pin.lng }}
                      draggable
                      onDragEnd={(e) => handlePinChange(e.nativeEvent.coordinate)}
                    />
                  )}
                </MapView>
              </View>
              <View style={styles.addressBox}>
                {geocoding ? (
                  <View style={styles.addressRow}>
                    <ActivityIndicator size="small" color={theme.headingText} />
                    <Text style={styles.addressText}>{t('postListing.detectingAddress')}</Text>
                  </View>
                ) : geocodeError && form.pin ? (
                  <View>
                    <Text style={styles.addressErrorText}>{t('postListing.addressDetectFailed')}</Text>
                    <Text style={styles.addressText}>
                      {t('postListing.coordinatesSaved', { lat: form.pin.lat.toFixed(5), lng: form.pin.lng.toFixed(5) })}
                    </Text>
                    <Pressable onPress={() => handlePinChange({ latitude: form.pin!.lat, longitude: form.pin!.lng })}>
                      <Text style={styles.retryText}>{t('postListing.retryAddressDetection')}</Text>
                    </Pressable>
                  </View>
                ) : form.city ? (
                  <Text style={styles.addressText}>
                    {t('postListing.detectedAddressPrefix')} {[form.street, form.area, form.city].filter(Boolean).join('، ')}
                  </Text>
                ) : (
                  <Text style={styles.addressPlaceholder}>{t('postListing.mapNotSet')}</Text>
                )}
              </View>
            </View>
          </View>
        )}

        {step === 4 && fieldFlags && (
          <View>
            <View style={styles.formCard}>
              <Text style={styles.formCardHeading}>{t('booking.basicInfoLabel')}</Text>
              <FormInput
                label={t('postListing.titleLabel')}
                required
                value={form.title}
                onChangeText={(v) => update('title', v)}
                placeholder={t('postListing.titlePlaceholder')}
                containerStyle={styles.field}
              />

              {fieldFlags.areaSqm && (
                <FormInput
                  label={t('booking.areaLabel')}
                  keyboardType="numeric"
                  value={form.areaSqm}
                  onChangeText={(v) => update('areaSqm', v)}
                  placeholder="80"
                  containerStyle={styles.field}
                />
              )}
              {(fieldFlags.streetWidth || fieldFlags.propertyAge) && (
                <View style={styles.row}>
                  {fieldFlags.streetWidth && (
                    <FormInput
                      label={t('booking.streetWidthLabel')}
                      keyboardType="numeric"
                      value={form.streetWidthM}
                      onChangeText={(v) => update('streetWidthM', v)}
                      containerStyle={styles.flexHalf}
                    />
                  )}
                  {fieldFlags.propertyAge && (
                    <FormInput
                      label={t('booking.propertyAgeLabel')}
                      keyboardType="numeric"
                      value={form.propertyAgeYears}
                      onChangeText={(v) => update('propertyAgeYears', v)}
                      containerStyle={styles.flexHalf}
                    />
                  )}
                </View>
              )}
              {fieldFlags.category && (
                <>
                  <Text style={styles.fieldLabel}>{t('booking.categoryLabel')}</Text>
                  <View style={styles.rowWrap}>
                    {CATEGORY_OPTIONS.map((key) => {
                      const label = t(key);
                      const active = form.category === label;
                      return (
                        <Pressable key={key} style={[styles.choiceChip, active && styles.choiceChipActive]} onPress={() => update('category', active ? '' : label)}>
                          <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}
            </View>

            {!fieldFlags.hallFields && (fieldFlags.bedrooms || fieldFlags.livingRooms || fieldFlags.bathrooms) && (
              <View style={styles.formCard}>
                <Text style={styles.formCardHeading}>{t('booking.specsLabelForm')}</Text>
                {fieldFlags.bedrooms && (
                  <FormInput label={t('postListing.bedroomsLabel')} keyboardType="numeric" value={form.bedrooms} onChangeText={(v) => update('bedrooms', v)} containerStyle={styles.field} />
                )}
                {fieldFlags.livingRooms && (
                  <FormInput label={t('booking.livingRoomsLabel')} keyboardType="numeric" value={form.livingRooms} onChangeText={(v) => update('livingRooms', v)} containerStyle={styles.field} />
                )}
                {fieldFlags.bathrooms && (
                  <FormInput label={t('postListing.bathroomsLabel')} keyboardType="numeric" value={form.bathrooms} onChangeText={(v) => update('bathrooms', v)} containerStyle={styles.field} />
                )}
              </View>
            )}

            {!fieldFlags.hallFields && (fieldFlags.floorNumber || fieldFlags.masterBedrooms || fieldFlags.receptionRooms) && (
              <View style={styles.formCard}>
                <Text style={styles.formCardHeading}>{t('booking.additionalDetailsLabel')}</Text>
                {fieldFlags.floorNumber && (
                  <FormInput
                    label={t(form.bookingType === 'furnished_villa' ? 'booking.numberOfFloorsLabel' : 'booking.floorLabel')}
                    keyboardType="numeric"
                    value={form.floorNumber}
                    onChangeText={(v) => update('floorNumber', v)}
                    containerStyle={styles.field}
                  />
                )}
                {fieldFlags.masterBedrooms && (
                  <FormInput label={t('booking.masterBedroomsLabel')} keyboardType="numeric" value={form.masterBedrooms} onChangeText={(v) => update('masterBedrooms', v)} containerStyle={styles.field} />
                )}
                {fieldFlags.receptionRooms && (
                  <FormInput label={t('booking.receptionRoomsLabel')} keyboardType="numeric" value={form.receptionRooms} onChangeText={(v) => update('receptionRooms', v)} containerStyle={styles.field} />
                )}
              </View>
            )}

            {fieldFlags.hallFields && (
              <View style={styles.formCard}>
                <Text style={styles.formCardHeading}>{t('booking.hallTypeLabel')}</Text>
                <Text style={styles.fieldLabel}>
                  {t('booking.hallTypeLabel')} *
                </Text>
                <View style={styles.rowWrap}>
                  {ALL_HALL_TYPES.map((ht: HallType) => (
                    <Pressable
                      key={ht}
                      style={[styles.choiceChip, form.hallType === ht && styles.choiceChipActive]}
                      onPress={() => update('hallType', ht)}
                    >
                      <Text style={[styles.choiceChipText, form.hallType === ht && styles.choiceChipTextActive]}>{t(HALL_TYPE_LABEL_KEY[ht])}</Text>
                    </Pressable>
                  ))}
                </View>
                <FormInput label={t('booking.numberOfHallsLabel')} keyboardType="numeric" value={form.numberOfHalls} onChangeText={(v) => update('numberOfHalls', v)} containerStyle={styles.field} />
              </View>
            )}
          </View>
        )}

        {step === 5 && (
          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>
              {(accommodation ? t('booking.nightlyPriceLabel') : t('booking.priceUsdLabel'))} *
            </Text>
            {!accommodation && <Text style={styles.helperText}>{t('booking.hallPriceHint')}</Text>}
            <View style={styles.priceInputRow}>
              <FormInput
                keyboardType="numeric"
                value={form.priceUsd}
                onChangeText={(v) => update('priceUsd', v)}
                placeholder="50"
                containerStyle={styles.priceInput}
              />
              <View style={styles.currencyBadge}>
                <Text style={styles.currencyBadgeText}>USD</Text>
              </View>
            </View>

            {accommodation && (
              <View style={styles.row}>
                <FormInput
                  label={t('booking.minimumNightsLabel')}
                  required
                  keyboardType="numeric"
                  value={form.minimumNights}
                  onChangeText={(v) => update('minimumNights', v)}
                  containerStyle={styles.flexHalf}
                />
                <FormInput
                  label={t('booking.maximumNightsLabel')}
                  keyboardType="numeric"
                  value={form.maximumNights}
                  onChangeText={(v) => update('maximumNights', v)}
                  containerStyle={styles.flexHalf}
                />
              </View>
            )}
            {!accommodation && <Text style={styles.helperText}>{t('booking.hallSingleDayNote')}</Text>}
          </View>
        )}

        {step === 6 && (
          <View style={styles.formCard}>
            <Text style={styles.helperText}>
              {form.blockedDates.length > 0 ? t('booking.availabilityBlockedCount', { count: form.blockedDates.length }) : t('booking.availabilityNoneBlocked')}
            </Text>
            <Text style={[styles.helperText, { marginTop: 4 }]}>{t('booking.availabilityHint')}</Text>
            <View style={{ marginTop: spacing.md }}>
              <AvailabilityToggleCalendar blockedDates={form.blockedDates} onToggle={toggleBlockedDate} />
            </View>
          </View>
        )}

        {step === 7 && (
          <View>
            <View style={styles.formCard}>
              <Text style={styles.formCardHeading}>{t('booking.unitFeaturesLabel')}</Text>
              {applicableAmenities.length > 0 ? (
                <View style={styles.featureGrid}>
                  <View style={styles.featureColumn}>
                    {orderAmenities(applicableAmenities, RIGHT_FEATURE_ORDER).map((a) => (
                      <FeatureCheckboxCard
                        key={a.key}
                        label={locale === 'ar' ? a.nameAr : a.nameEn}
                        active={form.amenities.includes(a.key)}
                        onPress={() =>
                          update('amenities', form.amenities.includes(a.key) ? form.amenities.filter((k) => k !== a.key) : [...form.amenities, a.key])
                        }
                        theme={theme}
                      />
                    ))}
                  </View>
                  <View style={styles.featureColumn}>
                    {orderAmenities(applicableAmenities, LEFT_FEATURE_ORDER).map((a) => (
                      <FeatureCheckboxCard
                        key={a.key}
                        label={locale === 'ar' ? a.nameAr : a.nameEn}
                        active={form.amenities.includes(a.key)}
                        onPress={() =>
                          update('amenities', form.amenities.includes(a.key) ? form.amenities.filter((k) => k !== a.key) : [...form.amenities, a.key])
                        }
                        theme={theme}
                      />
                    ))}
                  </View>
                </View>
              ) : (
                <Text style={styles.helperText}>—</Text>
              )}
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formCardHeading}>{t('booking.placeDescriptionLabel')}</Text>
              <FormInput
                value={form.description}
                onChangeText={(v) => update('description', v.slice(0, 1000))}
                placeholder={t('booking.placeDescriptionPlaceholder')}
                multiline
                numberOfLines={6}
                maxLength={1000}
              />
              <Text style={styles.counterText}>{form.description.length}/1000</Text>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formCardHeading}>{t('booking.bookingRulesOptionalLabel')}</Text>
              <TimePicker label={t('booking.checkInTimeInputLabel')} value={form.checkInTime} onChange={(v) => update('checkInTime', v)} />
              <TimePicker label={t('booking.checkOutTimeInputLabel')} value={form.checkOutTime} onChange={(v) => update('checkOutTime', v)} />

              <FormInput
                label={t('booking.securityDepositInputLabel')}
                keyboardType="numeric"
                value={form.securityDepositUsd}
                onChangeText={(v) => update('securityDepositUsd', v)}
                containerStyle={styles.field}
              />

              <FormInput
                label={t('booking.cancellationPolicyInputLabel')}
                value={form.cancellationPolicy}
                onChangeText={(v) => update('cancellationPolicy', v)}
                multiline
                containerStyle={styles.field}
              />

              <FormInput
                label={t('booking.bookingInstructionsInputLabel')}
                value={form.bookingInstructions}
                onChangeText={(v) => update('bookingInstructions', v)}
                multiline
                containerStyle={styles.field}
              />
            </View>
          </View>
        )}

        {step === 8 && form.bookingType && fieldFlags && (
          <View>
            <View style={styles.previewCard}>
              {form.photos.length > 0 && (
                <View
                  style={styles.previewPhotoStrip}
                  onLayout={(e) => setPreviewCarouselWidth(e.nativeEvent.layout.width)}
                >
                  {previewCarouselWidth > 0 && (
                    <>
                      <ScrollView
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        onMomentumScrollEnd={(e) =>
                          setPreviewPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / previewCarouselWidth))
                        }
                      >
                        {form.photos.map((p) => (
                          <Image key={p.uri} source={{ uri: p.uri }} style={{ width: previewCarouselWidth, height: 220 }} />
                        ))}
                      </ScrollView>
                      {form.photos.length > 1 && (
                        <View style={styles.previewPhotoCounter}>
                          <Text style={styles.previewPhotoCounterText}>
                            {previewPhotoIndex + 1}/{form.photos.length}
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}

              <View style={styles.previewBody}>
                <Text style={styles.previewTypeEyebrow}>{t(BOOKING_TYPE_LABEL_KEY[form.bookingType])}</Text>
                <Text style={styles.previewTitle}>{form.title || '—'}</Text>
                <View style={styles.previewLocationRow}>
                  <Ionicons name="location-outline" size={13} color={theme.mutedText} />
                  <Text style={styles.previewLocationText}>
                    {[form.street, form.area, form.city].filter(Boolean).join('، ') ||
                      (selectedGovernorate ? (locale === 'ar' ? selectedGovernorate.name_ar : selectedGovernorate.name_en) : '—')}
                  </Text>
                </View>
                <Text style={styles.previewPrice}>
                  {form.priceUsd
                    ? accommodation
                      ? t('booking.pricePerNight', { price: groupThousands(Number(form.priceUsd)) })
                      : t('booking.pricePerEvent', { price: groupThousands(Number(form.priceUsd)) })
                    : '—'}
                </Text>

                <Text style={styles.previewSectionTitle}>{t('booking.specsLabel')}</Text>
                <View style={styles.previewSpecsGrid}>
                  {fieldFlags.areaSqm && form.areaSqm && <PreviewSpec icon="resize-outline" label={t('booking.areaLabel')} value={`${form.areaSqm} م²`} theme={theme} />}
                  {fieldFlags.bedrooms && form.bedrooms && <PreviewSpec icon="bed-outline" label={t('postListing.bedroomsLabel')} value={form.bedrooms} theme={theme} />}
                  {fieldFlags.livingRooms && form.livingRooms && <PreviewSpec icon="tv-outline" label={t('booking.livingRoomsLabel')} value={form.livingRooms} theme={theme} />}
                  {fieldFlags.bathrooms && form.bathrooms && <PreviewSpec icon="water-outline" label={t('postListing.bathroomsLabel')} value={form.bathrooms} theme={theme} />}
                  {fieldFlags.beds && form.beds && <PreviewSpec icon="moon-outline" label={t('booking.bedsLabel')} value={form.beds} theme={theme} />}
                  {fieldFlags.floorNumber && form.floorNumber && (
                    <PreviewSpec
                      icon="layers-outline"
                      label={t(form.bookingType === 'furnished_villa' ? 'booking.numberOfFloorsLabel' : 'booking.floorLabel')}
                      value={form.floorNumber}
                      theme={theme}
                    />
                  )}
                  {fieldFlags.streetWidth && form.streetWidthM && <PreviewSpec icon="trail-sign-outline" label={t('booking.streetWidthLabel')} value={form.streetWidthM} theme={theme} />}
                  {fieldFlags.propertyAge && form.propertyAgeYears && <PreviewSpec icon="time-outline" label={t('booking.propertyAgeLabel')} value={form.propertyAgeYears} theme={theme} />}
                  {fieldFlags.category && !!form.category && <PreviewSpec icon="pricetag-outline" label={t('booking.categoryLabel')} value={form.category} theme={theme} />}
                  {fieldFlags.masterBedrooms && form.masterBedrooms && <PreviewSpec icon="key-outline" label={t('booking.masterBedroomsLabel')} value={form.masterBedrooms} theme={theme} />}
                  {fieldFlags.receptionRooms && form.receptionRooms && <PreviewSpec icon="people-circle-outline" label={t('booking.receptionRoomsLabel')} value={form.receptionRooms} theme={theme} />}
                  {fieldFlags.hallFields && form.hallType && <PreviewSpec icon="business-outline" label={t('booking.hallTypeLabel')} value={t(HALL_TYPE_LABEL_KEY[form.hallType])} theme={theme} />}
                  {fieldFlags.hallFields && form.numberOfHalls && <PreviewSpec icon="layers-outline" label={t('booking.numberOfHallsLabel')} value={form.numberOfHalls} theme={theme} />}
                </View>

                {applicableAmenities.length > 0 && form.amenities.length > 0 && (
                  <>
                    <Text style={styles.previewSectionTitle}>{t('booking.placeFeaturesLabel')}</Text>
                    <View style={styles.rowWrap}>
                      {applicableAmenities
                        .filter((a) => form.amenities.includes(a.key))
                        .slice(0, AMENITY_PREVIEW_CAP)
                        .map((a) => (
                          <View key={a.key} style={styles.previewFeatureTag}>
                            <Text style={styles.previewFeatureTagText}>{locale === 'ar' ? a.nameAr : a.nameEn}</Text>
                          </View>
                        ))}
                      {form.amenities.length > AMENITY_PREVIEW_CAP && (
                        <View style={styles.previewFeatureTag}>
                          <Text style={styles.previewFeatureTagText}>+{form.amenities.length - AMENITY_PREVIEW_CAP}</Text>
                        </View>
                      )}
                    </View>
                  </>
                )}

                <Text style={styles.previewSectionTitle}>{t('postListing.descriptionLabel')}</Text>
                <Text style={styles.reviewDescriptionText}>{form.description || '—'}</Text>

                {(accommodation || form.checkInTime || form.checkOutTime || form.securityDepositUsd || form.cancellationPolicy || form.bookingInstructions) && (
                  <>
                    <Text style={styles.previewSectionTitle}>{t('booking.bookingRulesLabel')}</Text>
                    <View style={styles.rulesPreviewCard}>
                      {accommodation && <ReviewRow label={t('booking.minimumStayLabel')} value={t('booking.minimumStayValue', { count: Number(form.minimumNights) || 1 })} theme={theme} />}
                      {form.checkInTime && <ReviewRow label={t('booking.checkInTimeLabel')} value={form.checkInTime.slice(0, 5)} theme={theme} />}
                      {form.checkOutTime && <ReviewRow label={t('booking.checkOutTimeLabel')} value={form.checkOutTime.slice(0, 5)} theme={theme} />}
                      {form.securityDepositUsd && <ReviewRow label={t('booking.securityDepositLabel')} value={`$${groupThousands(Number(form.securityDepositUsd))}`} theme={theme} />}
                      {form.cancellationPolicy && <ReviewRow label={t('booking.cancellationPolicyLabel')} value={form.cancellationPolicy} theme={theme} />}
                      {form.bookingInstructions && <ReviewRow label={t('booking.bookingInstructionsLabel')} value={form.bookingInstructions} theme={theme} />}
                    </View>
                  </>
                )}

                <Text style={styles.previewSectionTitle}>{t('booking.step6AvailabilityTitle')}</Text>
                <Text style={styles.helperText}>
                  {form.blockedDates.length > 0 ? t('booking.availabilityBlockedCount', { count: form.blockedDates.length }) : t('booking.availabilityNoneBlocked')}
                </Text>

                <Text style={styles.previewSectionTitle}>{t('postListing.contactPhoneLabel')}</Text>
                <Text style={styles.helperText}>{form.contactPhoneLocal ? `+${form.contactPhoneCountry.dialCode} ${form.contactPhoneLocal}` : '—'}</Text>
              </View>
            </View>

            {submitError && <Text style={styles.addressErrorText}>{submitError}</Text>}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step < TOTAL_STEPS ? (
          <PrimaryButton label={t('postListing.next')} onPress={goNext} disabled={!canGoNext} />
        ) : publishRetryId ? (
          // The listing and its photos are already safely saved — only the
          // publish step itself failed, so retry exactly that, never a
          // second createBookingListing call (which would duplicate it).
          <PrimaryButton label={t('postListing.retryPublish')} onPress={handleRetryPublish} loading={retryingPublish} />
        ) : (
          <PrimaryButton label={t('booking.publishButton')} onPress={handleSubmit} loading={submitting} disabled={!formValid} />
        )}
      </View>

      <Modal visible={governoratePickerOpen} transparent animationType="fade" onRequestClose={() => setGovernoratePickerOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setGovernoratePickerOpen(false)}>
          <View style={styles.modalSheet}>
            <FlatList
              data={governorates}
              keyExtractor={(g) => g.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    update('governorateId', item.id);
                    setGovernoratePickerOpen(false);
                  }}
                >
                  <Text style={styles.modalRowText}>{locale === 'ar' ? item.name_ar : item.name_en}</Text>
                  {form.governorateId === item.id && <Ionicons name="checkmark" size={18} color={theme.headingText} />}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },

    scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xxl },
    stepTitle: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.sectionTitle, color: theme.headingText, marginBottom: spacing.md },

    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    typeCard: {
      width: '47%',
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      paddingVertical: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: 1.5,
      borderColor: theme.border,
    },
    typeCardActive: { backgroundColor: theme.brandFill, borderColor: theme.brandFill },
    typeCardText: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, textAlign: 'center' },
    typeCardTextActive: { color: theme.onBrandFill },

    formCard: { backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
    priceInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    priceInput: { flex: 1 },
    currencyBadge: { backgroundColor: theme.surfaceAlt, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
    currencyBadgeText: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.headingText },
    formCardHeading: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.sectionTitle, color: theme.headingText, marginBottom: spacing.xs },
    fieldLabel: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, marginTop: spacing.lg, marginBottom: spacing.xs },
    field: { marginTop: spacing.lg },
    helperText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    counterText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, marginTop: 2 },

    rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
    row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
    flexHalf: { flex: 1 },

    choiceChip: { backgroundColor: theme.background, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    choiceChipActive: { backgroundColor: theme.brandFill },
    choiceChipText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.mutedText },
    choiceChipTextActive: { fontFamily: fonts.headingBold, color: theme.onBrandFill },

    featureGrid: { flexDirection: 'row', gap: spacing.sm },
    featureColumn: { flex: 1, gap: spacing.sm },
    featureCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: theme.background,
      borderRadius: radii.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      minHeight: 44,
    },
    featureCardText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.bodyText },

    photoThumbWrap: { width: 72, height: 72, borderRadius: radii.md, overflow: 'hidden' },
    photoThumb: { width: '100%', height: '100%' },
    coverBadge: {
      position: 'absolute',
      bottom: 3,
      left: 3,
      right: 3,
      backgroundColor: theme.brandFill,
      borderRadius: radii.sm,
      paddingVertical: 2,
      alignItems: 'center',
    },
    coverBadgeText: { fontFamily: fonts.headingBold, fontSize: 8, color: theme.onBrandFill },
    setCoverButton: {
      position: 'absolute',
      bottom: 3,
      left: 3,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: 'rgba(11,43,33,0.7)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoRemove: {
      position: 'absolute',
      top: 3,
      right: 3,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: 'rgba(11,43,33,0.7)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addPhotoTile: {
      width: 72,
      height: 72,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: theme.border,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addPhotoText: { fontFamily: fonts.bodyMedium, fontSize: 9, color: theme.headingText, marginTop: 2 },
    missingItem: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.danger, marginTop: spacing.sm },

    phoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
    phoneInputFlex: { flex: 1 },

    mapContainer: { height: 200, borderRadius: radii.lg, overflow: 'hidden', marginTop: spacing.sm },
    addressBox: { marginTop: spacing.sm },
    addressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    addressText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    addressPlaceholder: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText },
    addressErrorText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.danger },
    retryText: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.headingText, marginTop: 4 },

    reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.border, gap: spacing.md },
    reviewRowLabel: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText, flexShrink: 1 },
    reviewRowValue: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, flexShrink: 1, textAlign: 'right' },
    reviewDescriptionText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.body, color: theme.bodyText, lineHeight: 20 },

    previewCard: { backgroundColor: theme.surface, borderRadius: radii.lg, overflow: 'hidden' },
    previewPhotoStrip: { height: 220 },
    previewPhotoCounter: {
      position: 'absolute',
      bottom: spacing.sm,
      left: spacing.sm,
      backgroundColor: 'rgba(11,43,33,0.7)',
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    previewPhotoCounterText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.white },
    previewBody: { padding: spacing.md },
    previewTypeEyebrow: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.accentGold, marginBottom: 2 },
    previewTitle: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.button, color: theme.headingText, marginBottom: 4 },
    previewLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm },
    previewLocationText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText, flexShrink: 1 },
    previewPrice: { fontFamily: fonts.headingBlack, fontSize: fontSizes.sectionTitle, color: theme.headingText },
    previewSectionTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText, marginTop: spacing.lg, marginBottom: spacing.sm },
    previewSpecsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    previewSpecCell: { width: '31%', backgroundColor: theme.background, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: 'center', gap: 3 },
    previewSpecValue: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    previewSpecLabel: { fontFamily: fonts.bodyRegular, fontSize: 8.5, color: theme.mutedText, textAlign: 'center' },
    previewFeatureTag: { backgroundColor: theme.background, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
    previewFeatureTagText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.bodyText },
    rulesPreviewCard: { backgroundColor: theme.background, borderRadius: radii.md, paddingHorizontal: spacing.md },

    footer: { padding: spacing.lg, backgroundColor: theme.background },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(11,43,33,0.35)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    modalSheet: { width: '100%', maxHeight: '70%', backgroundColor: theme.background, borderRadius: radii.lg, overflow: 'hidden' },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    modalRowText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.body, color: theme.bodyText },

    successContainer: { flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
    successTitle: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.sectionTitle, color: theme.headingText, textAlign: 'center' },
    successBody: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.body, color: theme.mutedText, textAlign: 'center', marginBottom: spacing.lg },
  });
}
