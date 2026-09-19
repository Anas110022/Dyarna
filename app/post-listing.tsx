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
import {
  attachListingPhotos,
  createListing,
  fetchAmenityTypes,
  fetchGovernorates,
  fetchOwnProfile,
  publishListingIfEligible,
  updateListingOwnershipDocUrl,
  uploadListingPhoto,
  uploadOwnershipDoc,
  type AmenityType,
  type Governorate,
} from '@/src/lib/listings';
import { reverseGeocode } from '@/src/lib/geocoding';
import {
  ALL_CATEGORIES,
  BED_BATH_CATEGORIES,
  CATEGORY_LABEL_KEY,
  LAND_LIKE_CATEGORIES,
  type DealType,
  type ListingCategory,
} from '@/src/lib/listingTypes';
import { SYRIA_DEFAULT_REGION } from '@/src/lib/mapRegion';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { IdentityVerificationStep } from '@/src/components/IdentityVerificationStep';
import { AppHeader } from '@/src/components/AppHeader';
import { LoadingState } from '@/src/components/LoadingState';
import { FormInput } from '@/src/components/FormInput';
import { SelectInput } from '@/src/components/SelectInput';
import { PrimaryButton } from '@/src/components/PrimaryButton';

const TOTAL_STEPS = 5;

type Condition = 'good' | 'needs_renovation';
type LandType = 'residential' | 'agricultural' | 'commercial';
type Furnished = 'unfurnished' | 'partial' | 'full';

type WizardForm = {
  dealType: DealType | null;
  category: ListingCategory | null;
  photos: { uri: string }[];
  title: string;
  contactPhoneLocal: string;
  contactPhoneCountry: CountryCode;
  ownershipDocUri: string | null;
  governorateId: string | null;
  pin: { lat: number; lng: number } | null;
  city: string | null;
  area: string | null;
  street: string | null;
  description: string;
  bedrooms: string;
  bathrooms: string;
  livingRooms: string;
  floor: string;
  yearBuilt: string;
  condition: Condition | null;
  areaSqm: string;
  landType: LandType | null;
  frontageM: string;
  roadAccessDescription: string;
  hasBuildingPermit: boolean | null;
  ceilingHeight: string;
  furnished: Furnished | null;
  leaseTerm: string;
  downPaymentUsd: string;
  ownershipDocType: string;
  priceUsd: string;
  amenities: string[];
  licenseNumber: string;
  licenseExpiryDate: string;
  adSource: string;
  deedAreaSqm: string;
};

const INITIAL_FORM: WizardForm = {
  dealType: null,
  category: null,
  photos: [],
  title: '',
  contactPhoneLocal: '',
  contactPhoneCountry: DEFAULT_COUNTRY,
  ownershipDocUri: null,
  governorateId: null,
  pin: null,
  city: null,
  area: null,
  street: null,
  description: '',
  bedrooms: '',
  bathrooms: '',
  livingRooms: '',
  floor: '',
  yearBuilt: '',
  condition: null,
  areaSqm: '',
  landType: null,
  frontageM: '',
  roadAccessDescription: '',
  hasBuildingPermit: null,
  ceilingHeight: '',
  furnished: null,
  leaseTerm: '',
  downPaymentUsd: '',
  ownershipDocType: '',
  priceUsd: '',
  amenities: [],
  licenseNumber: '',
  licenseExpiryDate: '',
  adSource: '',
  deedAreaSqm: '',
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

function parseFloatOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export default function PostListingScreen() {
  const { t, locale } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mapRef = useRef<MapView>(null);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardForm>(INITIAL_FORM);
  const [userId, setUserId] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [initializing, setInitializing] = useState(true);
  // The real identity-verification gate. Defaults to false (gate shown)
  // and only starts true if the init effect below finds the user's REAL
  // profiles.is_verified already true — the one flag only the
  // admin-verification Edge Function ever sets, after an admin actually
  // approves a submitted request. This is deliberately NOT "has the user
  // ever submitted any verification_requests row" (that was an earlier,
  // real bug: submitting — even a still-pending or since-rejected
  // request — silently skipped the gate). Uploading a document is never
  // enough on its own here; only a real admin approval is. Also becomes
  // true the normal way, mid-session, once IdentityVerificationStep's own
  // real upload+submit succeeds.
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [governoratePickerOpen, setGovernoratePickerOpen] = useState(false);
  const [amenityTypes, setAmenityTypes] = useState<AmenityType[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [published, setPublished] = useState(false);
  // Set only when the listing + photos are already safely saved and just
  // the final publish-eligibility call itself failed — lets the owner
  // retry that one real step without re-submitting the whole form or
  // re-uploading photos a second time.
  const [publishRetryId, setPublishRetryId] = useState<string | null>(null);
  const [retryingPublish, setRetryingPublish] = useState(false);

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
      // Real, admin-approved verification already on file — skip straight
      // to the listing wizard instead of asking again.
      if (isVerified) {
        setVerificationSubmitted(true);
      }

      const { data: govs } = await fetchGovernorates();
      setGovernorates(govs);

      const { data: amenities } = await fetchAmenityTypes();
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

  const pickOwnershipDoc = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      update('ownershipDocUri', result.assets[0].uri);
    }
  }, [update]);

  const showBedBath = form.category !== null && BED_BATH_CATEGORIES.includes(form.category);
  const showFloor = form.category === 'apartment';
  const showLandFields = form.category !== null && LAND_LIKE_CATEGORIES.includes(form.category);
  const showCeilingHeight = form.category === 'warehouse';
  const showOwnershipDocType = form.category !== 'office' && form.category !== 'shop' && form.category !== 'building';
  const showRentFields = form.dealType === 'rent';
  const formCategory = form.category;
  const applicableAmenities =
    formCategory === null ? [] : amenityTypes.filter((a) => a.applicableCategories.includes(formCategory));

  const step1Valid = form.dealType !== null && form.category !== null;

  // form.pin (the real dropped/dragged coordinates) is the actual location
  // requirement — form.city is a best-effort label from reverse geocoding
  // and must never block the user just because that lookup failed or is
  // still loading. The real lat/lng are always what gets saved.
  const step2Valid = useMemo(
    () =>
      form.photos.length >= 3 &&
      form.title.trim().length > 0 &&
      isValidLocalNumber(form.contactPhoneLocal, form.contactPhoneCountry) &&
      form.governorateId !== null &&
      form.pin !== null &&
      form.description.trim().length >= 40,
    [form]
  );

  const step3Valid = useMemo(() => {
    if (!form.areaSqm || Number(form.areaSqm) <= 0) return false;
    if (showBedBath && (!form.bedrooms || !form.bathrooms)) return false;
    if (showLandFields && !form.landType) return false;
    if (showRentFields && !form.furnished) return false;
    return true;
  }, [form, showBedBath, showLandFields, showRentFields]);

  const step4Valid = !!form.priceUsd && Number(form.priceUsd) > 0;

  // Everything must still hold by the final review step, in case a user
  // navigated back and cleared something after already validating it once.
  const formValid = step1Valid && step2Valid && step3Valid && step4Valid;

  const canGoNext =
    step === 1 ? step1Valid : step === 2 ? step2Valid : step === 3 ? step3Valid : step === 4 ? step4Valid : formValid;

  const goNext = () => {
    if (!canGoNext) return;
    if (step < TOTAL_STEPS) setStep(step + 1);
  };

  const goBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      router.back();
    }
  };

  const handleSubmit = async () => {
    if (!userId || !form.category || !form.dealType || !form.governorateId || !form.pin) return;
    setSubmitting(true);
    setSubmitError(null);

    // city is required (not null) by the listings table. Normally it comes
    // from reverse geocoding the real pin; if that lookup never succeeded,
    // fall back to the real governorate the user actually picked (never an
    // invented address) so the real coordinates are never blocked from
    // being saved just because the geocoder failed.
    const fallbackCity = selectedGovernorate ? (locale === 'ar' ? selectedGovernorate.name_ar : selectedGovernorate.name_en) : null;
    const cityToSave = form.city ?? fallbackCity;
    if (!cityToSave) return;

    const { id, error: createError } = await createListing({
      ownerId: userId,
      listingType: form.dealType,
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim(),
      priceUsd: Math.trunc(Number(form.priceUsd)),
      governorateId: form.governorateId,
      city: cityToSave,
      area: form.area,
      lat: form.pin.lat,
      lng: form.pin.lng,
      areaSqm: Number(form.areaSqm),
      bedrooms: showBedBath ? parseIntOrNull(form.bedrooms) : null,
      bathrooms: showBedBath ? parseIntOrNull(form.bathrooms) : null,
      livingRooms: showBedBath ? parseIntOrNull(form.livingRooms) : null,
      floor: showFloor ? parseIntOrNull(form.floor) : null,
      yearBuilt: showBedBath ? parseIntOrNull(form.yearBuilt) : null,
      condition: showBedBath ? form.condition : null,
      landType: showLandFields ? form.landType : null,
      frontageM: showLandFields ? parseFloatOrNull(form.frontageM) : null,
      roadAccessDescription: showLandFields ? form.roadAccessDescription.trim() || null : null,
      hasBuildingPermit: showLandFields ? form.hasBuildingPermit : null,
      ceilingHeightM: showCeilingHeight ? parseFloatOrNull(form.ceilingHeight) : null,
      furnished: showRentFields ? form.furnished : null,
      leaseTerm: showRentFields ? form.leaseTerm.trim() || null : null,
      downPaymentUsd: showRentFields ? parseIntOrNull(form.downPaymentUsd) : null,
      ownershipDocType: showOwnershipDocType ? form.ownershipDocType.trim() || null : null,
      ownershipDocUrl: null,
      contactPhone: toE164(form.contactPhoneLocal, form.contactPhoneCountry),
      amenities: applicableAmenities.length > 0 ? form.amenities : [],
      licenseNumber: form.licenseNumber.trim() || null,
      licenseExpiryDate: form.licenseExpiryDate.trim() || null,
      adSource: form.adSource.trim() || null,
      deedAreaSqm: parseFloatOrNull(form.deedAreaSqm),
    });

    if (createError || !id) {
      setSubmitError(t('postListing.errorSubmitGeneric'));
      setSubmitting(false);
      return;
    }

    if (form.ownershipDocUri) {
      const { url } = await uploadOwnershipDoc(userId, id, form.ownershipDocUri);
      if (url) await updateListingOwnershipDocUrl(id, url);
    }

    const uploadedPaths: string[] = [];
    for (let i = 0; i < form.photos.length; i += 1) {
      const { path } = await uploadListingPhoto(userId, id, i, form.photos[i].uri);
      if (path) uploadedPaths.push(path);
    }

    if (uploadedPaths.length < 3) {
      setSubmitError(t('postListing.errorPhotoUpload'));
      setSubmitting(false);
      return;
    }

    const { error: attachError } = await attachListingPhotos(id, uploadedPaths);
    if (attachError) {
      setSubmitError(t('postListing.errorPhotoUpload'));
      setSubmitting(false);
      return;
    }

    // Real photos are attached now, so ask the server (which re-validates
    // ownership + real photo count itself, not trusting this client) to
    // publish immediately. `published: false` with no error is the real,
    // legitimate "not eligible yet" outcome (e.g. owner not verified) —
    // the listing is still safely saved as pending_review either way. A
    // real `error` here is a genuine call failure (expired session,
    // network drop, a server-side exception) and must never be treated
    // as that same legitimate case — silently swallowing it previously
    // left real, fully-eligible listings stranded at pending_review with
    // no way for the owner to even know something had gone wrong.
    const { published: didPublish, error: publishError } = await publishListingIfEligible(id);

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
    const { published: didPublish, error: publishError } = await publishListingIfEligible(publishRetryId);
    setRetryingPublish(false);

    if (publishError) {
      setSubmitError(t('postListing.errorPublishGeneric'));
      return;
    }

    setPublishRetryId(null);
    setPublished(didPublish);
    setSubmitted(true);
  };

  const selectedGovernorate = governorates.find((g) => g.id === form.governorateId) ?? null;

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  if (initializing) {
    return <LoadingState />;
  }

  // The real identity-verification step — the absolute first screen of
  // إضافة إعلان, shown before the property type/بيع-إيجار/any of the
  // existing 5 steps, unless the init effect above already found a real
  // admin-approved profiles.is_verified=true for this user. Uploading a
  // document here is never enough on its own — publish itself stays
  // blocked server-side (publish_listing_if_eligible) until an admin
  // actually approves the resulting verification_requests row.
  if (!verificationSubmitted && userId) {
    return (
      <View style={styles.flex}>
        <AppHeader title={t('verifyAccount.title')} onBack={() => router.back()} />
        <IdentityVerificationStep userId={userId} onSubmitted={() => setVerificationSubmitted(true)} />
      </View>
    );
  }

  if (submitted) {
    return (
      <View style={styles.successContainer}>
        <Ionicons name="checkmark-circle" size={64} color={theme.accentGold} />
        <Text style={styles.successTitle}>
          {published ? t('postListing.publishedTitle') : t('postListing.submitSuccessTitle')}
        </Text>
        <Text style={styles.successBody}>{published ? t('postListing.publishedBody') : t('postListing.submitSuccessBody')}</Text>
        <PrimaryButton label={t('postListing.backToHome')} onPress={() => router.replace('/(tabs)')} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader
        title={t('postListing.title')}
        subtitle={t('postListing.stepOf', { current: step, total: TOTAL_STEPS })}
        onBack={goBack}
      />

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>{t('postListing.step1Title')}</Text>

            <Text style={styles.fieldLabel}>{t('postListing.dealTypeLabel')}</Text>
            <View style={styles.rowWrap}>
              {(['sale', 'rent'] as DealType[]).map((dt) => (
                <Pressable
                  key={dt}
                  style={[styles.choiceChip, form.dealType === dt && styles.choiceChipActive]}
                  onPress={() => update('dealType', dt)}
                >
                  <Text style={[styles.choiceChipText, form.dealType === dt && styles.choiceChipTextActive]}>
                    {t(dt === 'sale' ? 'home.forSale' : 'home.forRent')}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>{t('postListing.categoryLabel')}</Text>
            <View style={styles.rowWrap}>
              {ALL_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.choiceChip, form.category === cat && styles.choiceChipActive]}
                  onPress={() => update('category', cat)}
                >
                  <Text style={[styles.choiceChipText, form.category === cat && styles.choiceChipTextActive]}>
                    {t(CATEGORY_LABEL_KEY[cat])}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.stepTitle}>{t('postListing.step2Title')}</Text>

            <Text style={styles.fieldLabel}>{t('postListing.photosLabel')}</Text>
            <Text style={styles.helperText}>{t('postListing.photosHelper')}</Text>
            <Text style={styles.counterText}>{t('postListing.photosCount', { count: form.photos.length })}</Text>
            <View style={styles.rowWrap}>
              {form.photos.map((p) => (
                <View key={p.uri} style={styles.photoThumbWrap}>
                  <Image source={{ uri: p.uri }} style={styles.photoThumb} />
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

            <FormInput
              label={t('postListing.titleLabel')}
              required
              value={form.title}
              onChangeText={(v) => update('title', v)}
              placeholder={t('postListing.titlePlaceholder')}
              containerStyle={styles.field}
            />

            <Text style={styles.fieldLabel}>
              {t('postListing.contactPhoneLabel')} *
            </Text>
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

            <Text style={styles.fieldLabel}>{t('postListing.ownershipDocLabel')}</Text>
            <Pressable style={styles.secondaryButton} onPress={pickOwnershipDoc}>
              <Ionicons name="document-attach-outline" size={16} color={theme.headingText} />
              <Text style={styles.secondaryButtonText}>
                {form.ownershipDocUri ? t('postListing.ownershipDocAttached') : t('postListing.ownershipDocAttach')}
              </Text>
            </Pressable>

            <SelectInput
              label={t('postListing.governorateLabel')}
              required
              value={selectedGovernorate ? (locale === 'ar' ? selectedGovernorate.name_ar : selectedGovernorate.name_en) : null}
              placeholder={t('postListing.governoratePlaceholder')}
              onPress={() => setGovernoratePickerOpen(true)}
              containerStyle={styles.field}
            />

            <Text style={styles.fieldLabel}>
              {t('postListing.mapLabel')} *
            </Text>
            <Text style={styles.helperText}>{t('postListing.mapHelper')}</Text>
            <View style={styles.mapContainer}>
              <MapView
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={StyleSheet.absoluteFill}
                initialRegion={SYRIA_DEFAULT_REGION}
                // initialRegion alone isn't reliable for PROVIDER_GOOGLE on
                // iOS — it can render its own default camera (visibly
                // outside Syria) before applying it, or skip it entirely.
                // The Home map never showed this because its own camera
                // boundary (setMapBoundaries) snaps any stray initial
                // position back into Syria; this picker has no such
                // boundary, so it needs its own explicit fix: force the
                // real Syria region imperatively once the native view is
                // actually ready, with a 0ms "animation" so it's an
                // instant snap, not a visible fly-over from wherever it
                // first rendered — Syria is what the user sees on open.
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
                    {t('postListing.coordinatesSaved', {
                      lat: form.pin.lat.toFixed(5),
                      lng: form.pin.lng.toFixed(5),
                    })}
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

            <Text style={styles.fieldLabel}>
              {t('postListing.descriptionLabel')} *
            </Text>
            <Text style={styles.helperText}>{t('postListing.descriptionPlaceholder')}</Text>
            <FormInput
              value={form.description}
              onChangeText={(v) => update('description', v)}
              multiline
              numberOfLines={5}
              containerStyle={styles.field}
            />
            <Text style={styles.counterText}>{t('postListing.descriptionCount', { count: form.description.trim().length })}</Text>
            <Text style={styles.helperText}>{t('postListing.descriptionHelper')}</Text>

            {step2Valid ? (
              <View style={styles.validBanner}>
                <Ionicons name="checkmark-circle" size={16} color={theme.headingText} />
                <Text style={styles.validBannerText}>{t('postListing.allFieldsValid')}</Text>
              </View>
            ) : (
              <View style={styles.missingBanner}>
                <Text style={styles.missingBannerTitle}>{t('postListing.missingRequirements')}</Text>
                {form.photos.length < 3 && (
                  <Text style={styles.missingItem}>
                    • {t('postListing.photosLabel')} ({form.photos.length}/3)
                  </Text>
                )}
                {form.title.trim().length === 0 && <Text style={styles.missingItem}>• {t('postListing.titleLabel')}</Text>}
                {!isValidLocalNumber(form.contactPhoneLocal, form.contactPhoneCountry) && (
                  <Text style={styles.missingItem}>• {t('postListing.contactPhoneLabel')}</Text>
                )}
                {form.governorateId === null && <Text style={styles.missingItem}>• {t('postListing.governorateLabel')}</Text>}
                {form.pin === null && <Text style={styles.missingItem}>• {t('postListing.mapLabel')}</Text>}
                {form.description.trim().length < 40 && (
                  <Text style={styles.missingItem}>
                    • {t('postListing.descriptionLabel')} ({form.description.trim().length}/40)
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={styles.stepTitle}>{t('postListing.step3Title')}</Text>

            <FormInput
              label={t('postListing.areaSqmLabel')}
              required
              value={form.areaSqm}
              onChangeText={(v) => update('areaSqm', v)}
              keyboardType="numeric"
              containerStyle={styles.field}
            />

            {showBedBath && (
              <>
                <FormInput
                  label={t('postListing.bedroomsLabel')}
                  required
                  value={form.bedrooms}
                  onChangeText={(v) => update('bedrooms', v)}
                  keyboardType="number-pad"
                  containerStyle={styles.field}
                />
                <FormInput
                  label={t('postListing.bathroomsLabel')}
                  required
                  value={form.bathrooms}
                  onChangeText={(v) => update('bathrooms', v)}
                  keyboardType="number-pad"
                  containerStyle={styles.field}
                />
                <FormInput
                  label={t('home.livingRoomsLabel')}
                  value={form.livingRooms}
                  onChangeText={(v) => update('livingRooms', v)}
                  keyboardType="number-pad"
                  containerStyle={styles.field}
                />

                {showFloor && (
                  <FormInput
                    label={t('postListing.floorLabel')}
                    value={form.floor}
                    onChangeText={(v) => update('floor', v)}
                    keyboardType="number-pad"
                    containerStyle={styles.field}
                  />
                )}

                <FormInput
                  label={t('postListing.yearBuiltLabel')}
                  value={form.yearBuilt}
                  onChangeText={(v) => update('yearBuilt', v)}
                  keyboardType="number-pad"
                  containerStyle={styles.field}
                />

                <Text style={styles.fieldLabel}>{t('postListing.conditionLabel')}</Text>
                <View style={styles.rowWrap}>
                  {(['good', 'needs_renovation'] as Condition[]).map((c) => (
                    <Pressable
                      key={c}
                      style={[styles.choiceChip, form.condition === c && styles.choiceChipActive]}
                      onPress={() => update('condition', c)}
                    >
                      <Text style={[styles.choiceChipText, form.condition === c && styles.choiceChipTextActive]}>
                        {t(c === 'good' ? 'postListing.conditionGood' : 'postListing.conditionNeedsRenovation')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {showLandFields && (
              <>
                <Text style={styles.fieldLabel}>
                  {t('postListing.landTypeLabel')} *
                </Text>
                <View style={styles.rowWrap}>
                  {(['residential', 'agricultural', 'commercial'] as LandType[]).map((lt) => (
                    <Pressable
                      key={lt}
                      style={[styles.choiceChip, form.landType === lt && styles.choiceChipActive]}
                      onPress={() => update('landType', lt)}
                    >
                      <Text style={[styles.choiceChipText, form.landType === lt && styles.choiceChipTextActive]}>
                        {t(`postListing.landType${lt === 'residential' ? 'Residential' : lt === 'agricultural' ? 'Agricultural' : 'Commercial'}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <FormInput
                  label={t('postListing.frontageLabel')}
                  value={form.frontageM}
                  onChangeText={(v) => update('frontageM', v)}
                  keyboardType="numeric"
                  containerStyle={styles.field}
                />

                <FormInput
                  label={t('postListing.roadAccessLabel')}
                  value={form.roadAccessDescription}
                  onChangeText={(v) => update('roadAccessDescription', v)}
                  placeholder={t('postListing.roadAccessPlaceholder')}
                  containerStyle={styles.field}
                />

                <Text style={styles.fieldLabel}>{t('postListing.buildingPermitLabel')}</Text>
                <View style={styles.rowWrap}>
                  {[true, false].map((val) => (
                    <Pressable
                      key={String(val)}
                      style={[styles.choiceChip, form.hasBuildingPermit === val && styles.choiceChipActive]}
                      onPress={() => update('hasBuildingPermit', val)}
                    >
                      <Text style={[styles.choiceChipText, form.hasBuildingPermit === val && styles.choiceChipTextActive]}>
                        {t(val ? 'postListing.yes' : 'postListing.no')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {showCeilingHeight && (
              <FormInput
                label={t('home.ceilingHeightLabel')}
                value={form.ceilingHeight}
                onChangeText={(v) => update('ceilingHeight', v)}
                keyboardType="numeric"
                containerStyle={styles.field}
              />
            )}

            {applicableAmenities.length > 0 && (
              <>
                <Text style={styles.fieldLabel}>{t('home.amenitiesLabel')}</Text>
                <View style={styles.rowWrap}>
                  {applicableAmenities.map((amenity) => {
                    const active = form.amenities.includes(amenity.key);
                    return (
                      <Pressable
                        key={amenity.key}
                        style={[styles.choiceChip, active && styles.choiceChipActive]}
                        onPress={() =>
                          update(
                            'amenities',
                            active ? form.amenities.filter((k) => k !== amenity.key) : [...form.amenities, amenity.key]
                          )
                        }
                      >
                        <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                          {locale === 'ar' ? amenity.nameAr : amenity.nameEn}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {showRentFields && (
              <>
                <Text style={styles.fieldLabel}>
                  {t('postListing.furnishedLabel')} *
                </Text>
                <View style={styles.rowWrap}>
                  {(['full', 'partial', 'unfurnished'] as Furnished[]).map((f) => (
                    <Pressable
                      key={f}
                      style={[styles.choiceChip, form.furnished === f && styles.choiceChipActive]}
                      onPress={() => update('furnished', f)}
                    >
                      <Text style={[styles.choiceChipText, form.furnished === f && styles.choiceChipTextActive]}>
                        {t(`postListing.furnished${f === 'full' ? 'Full' : f === 'partial' ? 'Partial' : 'Unfurnished'}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <FormInput
                  label={t('postListing.leaseTermLabel')}
                  value={form.leaseTerm}
                  onChangeText={(v) => update('leaseTerm', v)}
                  placeholder={t('postListing.leaseTermPlaceholder')}
                  containerStyle={styles.field}
                />

                <FormInput
                  label={t('postListing.downPaymentLabel')}
                  value={form.downPaymentUsd}
                  onChangeText={(v) => update('downPaymentUsd', v)}
                  keyboardType="numeric"
                  containerStyle={styles.field}
                />
              </>
            )}

            {showOwnershipDocType && (
              <FormInput
                label={t('postListing.ownershipDocTypeLabel')}
                value={form.ownershipDocType}
                onChangeText={(v) => update('ownershipDocType', v)}
                placeholder={t('postListing.ownershipDocTypePlaceholder')}
                containerStyle={styles.field}
              />
            )}

            <Text style={styles.sectionDivider}>{t('postListing.adInfoSectionTitle')}</Text>

            <FormInput
              label={t('postListing.licenseNumberLabel')}
              value={form.licenseNumber}
              onChangeText={(v) => update('licenseNumber', v)}
              placeholder={t('postListing.licenseNumberPlaceholder')}
              containerStyle={styles.field}
            />

            <FormInput
              label={t('postListing.licenseExpiryLabel')}
              value={form.licenseExpiryDate}
              onChangeText={(v) => update('licenseExpiryDate', v)}
              placeholder={t('postListing.licenseExpiryPlaceholder')}
              keyboardType="numbers-and-punctuation"
              containerStyle={styles.field}
            />

            <FormInput
              label={t('postListing.adSourceLabel')}
              value={form.adSource}
              onChangeText={(v) => update('adSource', v)}
              placeholder={t('postListing.adSourcePlaceholder')}
              containerStyle={styles.field}
            />

            <FormInput
              label={t('postListing.deedAreaLabel')}
              value={form.deedAreaSqm}
              onChangeText={(v) => update('deedAreaSqm', v)}
              keyboardType="numeric"
              containerStyle={styles.field}
            />
          </View>
        )}

        {step === 4 && (
          <View>
            <Text style={styles.stepTitle}>{t('postListing.step4Title')}</Text>

            <FormInput
              label={t('postListing.priceLabel')}
              required
              value={form.priceUsd}
              onChangeText={(v) => update('priceUsd', v)}
              placeholder={t('postListing.pricePlaceholder')}
              keyboardType="numeric"
              containerStyle={styles.field}
            />
          </View>
        )}

        {step === 5 && (
          <View>
            <Text style={styles.stepTitle}>{t('postListing.step5Title')}</Text>
            <Text style={styles.helperText}>{t('postListing.reviewNotice')}</Text>

            <Text style={styles.fieldLabel}>{t('postListing.photosLabel')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.rowWrap}>
                {form.photos.map((p) => (
                  <Image key={p.uri} source={{ uri: p.uri }} style={styles.photoThumb} />
                ))}
              </View>
            </ScrollView>

            <View style={styles.reviewCard}>
              <ReviewRow label={t('postListing.categoryLabel')} value={form.category ? t(CATEGORY_LABEL_KEY[form.category]) : ''} theme={theme} />
              <ReviewRow label={t('postListing.dealTypeLabel')} value={form.dealType ? t(form.dealType === 'sale' ? 'home.forSale' : 'home.forRent') : ''} theme={theme} />
              <ReviewRow label={t('postListing.titleLabel')} value={form.title} theme={theme} />
              <ReviewRow
                label={t('postListing.governorateLabel')}
                value={selectedGovernorate ? (locale === 'ar' ? selectedGovernorate.name_ar : selectedGovernorate.name_en) : ''}
                theme={theme}
              />
              <ReviewRow
                label={t('postListing.locationLabel')}
                value={
                  [form.street, form.area, form.city].filter(Boolean).join('، ') ||
                  (form.pin ? t('postListing.coordinatesSaved', { lat: form.pin.lat.toFixed(5), lng: form.pin.lng.toFixed(5) }) : '')
                }
                theme={theme}
              />
              <ReviewRow
                label={t('postListing.contactPhoneLabel')}
                value={form.contactPhoneLocal ? `+${form.contactPhoneCountry.dialCode} ${form.contactPhoneLocal}` : ''}
                theme={theme}
              />
              <ReviewRow label={t('postListing.areaSqmLabel')} value={form.areaSqm ? `${form.areaSqm} ${t('home.sqm')}` : ''} theme={theme} />
              {showBedBath && <ReviewRow label={t('postListing.bedroomsLabel')} value={form.bedrooms} theme={theme} />}
              {showBedBath && <ReviewRow label={t('postListing.bathroomsLabel')} value={form.bathrooms} theme={theme} />}
              {showBedBath && <ReviewRow label={t('home.livingRoomsLabel')} value={form.livingRooms} theme={theme} />}
              {showFloor && <ReviewRow label={t('postListing.floorLabel')} value={form.floor} theme={theme} />}
              {showBedBath && <ReviewRow label={t('postListing.yearBuiltLabel')} value={form.yearBuilt} theme={theme} />}
              {showBedBath && form.condition && (
                <ReviewRow
                  label={t('postListing.conditionLabel')}
                  value={t(form.condition === 'good' ? 'postListing.conditionGood' : 'postListing.conditionNeedsRenovation')}
                  theme={theme}
                />
              )}
              {showLandFields && form.landType && (
                <ReviewRow
                  label={t('postListing.landTypeLabel')}
                  value={t(
                    `postListing.landType${form.landType === 'residential' ? 'Residential' : form.landType === 'agricultural' ? 'Agricultural' : 'Commercial'}`
                  )}
                  theme={theme}
                />
              )}
              {showLandFields && <ReviewRow label={t('postListing.frontageLabel')} value={form.frontageM} theme={theme} />}
              {showLandFields && <ReviewRow label={t('postListing.roadAccessLabel')} value={form.roadAccessDescription} theme={theme} />}
              {showLandFields && form.hasBuildingPermit !== null && (
                <ReviewRow label={t('postListing.buildingPermitLabel')} value={t(form.hasBuildingPermit ? 'postListing.yes' : 'postListing.no')} theme={theme} />
              )}
              {showRentFields && form.furnished && (
                <ReviewRow
                  label={t('postListing.furnishedLabel')}
                  value={t(
                    `postListing.furnished${form.furnished === 'full' ? 'Full' : form.furnished === 'partial' ? 'Partial' : 'Unfurnished'}`
                  )}
                  theme={theme}
                />
              )}
              {showRentFields && <ReviewRow label={t('postListing.leaseTermLabel')} value={form.leaseTerm} theme={theme} />}
              {showRentFields && <ReviewRow label={t('postListing.downPaymentLabel')} value={form.downPaymentUsd} theme={theme} />}
              {showCeilingHeight && <ReviewRow label={t('home.ceilingHeightLabel')} value={form.ceilingHeight} theme={theme} />}
              {applicableAmenities.length > 0 && form.amenities.length > 0 && (
                <ReviewRow
                  label={t('home.amenitiesLabel')}
                  value={applicableAmenities
                    .filter((a) => form.amenities.includes(a.key))
                    .map((a) => (locale === 'ar' ? a.nameAr : a.nameEn))
                    .join('، ')}
                  theme={theme}
                />
              )}
              {showOwnershipDocType && <ReviewRow label={t('postListing.ownershipDocTypeLabel')} value={form.ownershipDocType} theme={theme} />}
              {form.ownershipDocUri && <ReviewRow label={t('postListing.ownershipDocLabel')} value={t('postListing.ownershipDocAttached')} theme={theme} />}
              <ReviewRow label={t('postListing.licenseNumberLabel')} value={form.licenseNumber} theme={theme} />
              <ReviewRow label={t('postListing.licenseExpiryLabel')} value={form.licenseExpiryDate} theme={theme} />
              <ReviewRow label={t('postListing.adSourceLabel')} value={form.adSource} theme={theme} />
              <ReviewRow label={t('postListing.deedAreaLabel')} value={form.deedAreaSqm ? `${form.deedAreaSqm} ${t('home.sqm')}` : ''} theme={theme} />
              <ReviewRow label={t('postListing.priceLabel')} value={form.priceUsd ? `$${groupThousands(Number(form.priceUsd))}` : ''} theme={theme} />
            </View>

            <Text style={styles.fieldLabel}>{t('postListing.descriptionLabel')}</Text>
            <Text style={styles.reviewDescriptionText}>{form.description}</Text>

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
          // second createListing call (which would duplicate the listing).
          <PrimaryButton label={t('postListing.retryPublish')} onPress={handleRetryPublish} loading={retryingPublish} />
        ) : (
          <PrimaryButton label={t('postListing.submit')} onPress={handleSubmit} loading={submitting} disabled={!formValid} />
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

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    progressTrack: { height: 3, backgroundColor: theme.surfaceAlt, marginHorizontal: spacing.lg, borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: theme.accentGold },
    content: { padding: spacing.lg, paddingBottom: spacing.xxl },
    stepTitle: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.sectionTitle, color: theme.headingText, marginBottom: spacing.lg },
    fieldLabel: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, marginTop: spacing.lg, marginBottom: spacing.sm },
    field: { marginTop: spacing.lg },
    sectionDivider: {
      fontFamily: fonts.headingBold,
      fontSize: fontSizes.body,
      color: theme.headingText,
      marginTop: spacing.xl,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    helperText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, lineHeight: 18, marginBottom: spacing.sm },
    counterText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, marginTop: spacing.xs },
    rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    choiceChip: {
      backgroundColor: theme.surface,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    choiceChipActive: { backgroundColor: theme.brandFill },
    choiceChipText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.mutedText },
    choiceChipTextActive: { fontFamily: fonts.headingBold, color: theme.onBrandFill },
    photoThumbWrap: { width: 76, height: 76, borderRadius: radii.md, overflow: 'hidden' },
    photoThumb: { width: '100%', height: '100%' },
    photoRemove: {
      position: 'absolute',
      top: 4,
      end: 4,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: 'rgba(11,43,33,0.65)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addPhotoTile: {
      width: 76,
      height: 76,
      borderRadius: radii.md,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addPhotoText: { fontFamily: fonts.bodyMedium, fontSize: 9, color: theme.headingText, marginTop: 2 },
    phoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    phoneInputFlex: { flex: 1 },
    secondaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: theme.surface,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      alignSelf: 'flex-start',
    },
    secondaryButtonText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.headingText },
    mapContainer: { height: 220, borderRadius: radii.md, overflow: 'hidden' },
    addressBox: { marginTop: spacing.sm },
    addressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    addressText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.bodyText },
    addressPlaceholder: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    addressErrorText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.danger },
    retryText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText, marginTop: spacing.xs },
    validBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: theme.surfaceAlt,
      borderRadius: radii.md,
      padding: spacing.md,
      marginTop: spacing.lg,
    },
    validBannerText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.headingText, flexShrink: 1 },
    missingBanner: {
      backgroundColor: theme.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      marginTop: spacing.lg,
      gap: 4,
    },
    missingBannerTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.bodyText, marginBottom: 2 },
    missingItem: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    reviewCard: {
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
      marginTop: spacing.md,
    },
    reviewRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: spacing.md,
    },
    reviewRowLabel: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    reviewRowValue: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, flexShrink: 1, textAlign: 'right' },
    reviewDescriptionText: {
      fontFamily: fonts.bodyRegular,
      fontSize: fontSizes.bodySmall,
      color: theme.bodyText,
      lineHeight: 20,
      backgroundColor: theme.surface,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    footer: { padding: spacing.lg },
    successContainer: { flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm },
    successTitle: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.sectionTitle, color: theme.headingText, textAlign: 'center' },
    successBody: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText, textAlign: 'center', marginBottom: spacing.lg },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(11,43,33,0.4)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: theme.surface, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, maxHeight: '60%', paddingVertical: spacing.sm },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    modalRowText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.body, color: theme.bodyText },
  });
}
