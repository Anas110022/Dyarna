import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { isValidLocalNumber, splitE164, toE164 } from '@/src/lib/phone';
import type { CountryCode } from '@/src/lib/countryCodes';
import { PhoneInput } from '@/src/components/PhoneInput';
import { fetchGovernorates, type Governorate } from '@/src/lib/listings';
import { reverseGeocode } from '@/src/lib/geocoding';
import { BOOKING_TYPE_FIELDS, BOOKING_TYPE_LABEL_KEY, HALL_TYPE_LABEL_KEY, ALL_HALL_TYPES, isAccommodationType, type HallType } from '@/src/lib/bookingTypes';
import {
  addBookingListingBlackoutDates,
  attachBookingListingPhotos,
  deleteBookingListing,
  deleteBookingListingPhotoRow,
  fetchBookingAmenityTypes,
  fetchBookingListingBlackoutDates,
  fetchBookingListingDetail,
  fetchBookingListingPhotoRows,
  fetchUnavailableRanges,
  pauseBookingListing,
  removeBookingListingBlackoutDate,
  updateBookingListingFull,
  uploadBookingListingPhoto,
  type BookingAmenityType,
  type BookingListingDetail,
  type BookingListingPhotoRow,
  type UnavailableRange,
} from '@/src/lib/bookings';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { TimePicker } from '@/src/components/TimePicker';
import { AvailabilityToggleCalendar } from '@/src/components/AvailabilityToggleCalendar';
import { AppHeader } from '@/src/components/AppHeader';
import { LoadingState } from '@/src/components/LoadingState';
import { EmptyState } from '@/src/components/EmptyState';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { FormInput } from '@/src/components/FormInput';
import { SelectInput } from '@/src/components/SelectInput';

function parseIntOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

type NewPhoto = { uri: string };

export default function BookingSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mapRef = useRef<MapView>(null);

  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [notAuthorized, setNotAuthorized] = useState(false);
  const [listing, setListing] = useState<BookingListingDetail | null>(null);
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [amenityTypes, setAmenityTypes] = useState<BookingAmenityType[]>([]);
  const [governoratePickerOpen, setGovernoratePickerOpen] = useState(false);

  const [existingPhotos, setExistingPhotos] = useState<BookingListingPhotoRow[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<NewPhoto[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [governorateId, setGovernorateId] = useState<string | null>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [contactPhoneLocal, setContactPhoneLocal] = useState('');
  const [contactPhoneCountry, setContactPhoneCountry] = useState<CountryCode | null>(null);

  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [beds, setBeds] = useState('');
  const [areaSqm, setAreaSqm] = useState('');
  const [livingRooms, setLivingRooms] = useState('');
  const [floorNumber, setFloorNumber] = useState('');
  const [streetWidthM, setStreetWidthM] = useState('');
  const [propertyAgeYears, setPropertyAgeYears] = useState('');
  const [category, setCategory] = useState('');
  const [masterBedrooms, setMasterBedrooms] = useState('');
  const [receptionRooms, setReceptionRooms] = useState('');
  const [hallType, setHallType] = useState<HallType | null>(null);
  const [numberOfHalls, setNumberOfHalls] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);

  const [priceUsd, setPriceUsd] = useState('');
  const [minimumNights, setMinimumNights] = useState('1');
  const [maximumNights, setMaximumNights] = useState('');
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);
  const [cancellationPolicy, setCancellationPolicy] = useState('');
  const [securityDeposit, setSecurityDeposit] = useState('');
  const [bookingInstructions, setBookingInstructions] = useState('');

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [availabilitySheetOpen, setAvailabilitySheetOpen] = useState(false);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [reservedRanges, setReservedRanges] = useState<UnavailableRange[]>([]);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        if (!cancelled) {
          setAuthRequired(true);
          setLoading(false);
        }
        return;
      }
      const [{ data }, { data: photoRows }, { data: amenityData }, { data: govs }] = await Promise.all([
        fetchBookingListingDetail(id),
        fetchBookingListingPhotoRows(id),
        fetchBookingAmenityTypes(),
        fetchGovernorates(),
      ]);
      if (cancelled) return;
      if (!data || data.ownerId !== user.id) {
        setNotAuthorized(true);
        setLoading(false);
        return;
      }
      setListing(data);
      setExistingPhotos(photoRows);
      setAmenityTypes(amenityData);
      setGovernorates(govs);

      setTitle(data.title);
      setDescription(data.description);
      setGovernorateId(data.governorateId ?? null);
      setPin({ lat: data.lat, lng: data.lng });
      setCity(data.city);
      setArea(data.area);
      const { country, local } = splitE164(data.contactPhone);
      setContactPhoneCountry(country);
      setContactPhoneLocal(local);

      setBedrooms(data.bedrooms != null ? String(data.bedrooms) : '');
      setBathrooms(data.bathrooms != null ? String(data.bathrooms) : '');
      setBeds(data.beds != null ? String(data.beds) : '');
      setAreaSqm(data.areaSqm != null ? String(data.areaSqm) : '');
      setLivingRooms(data.livingRooms != null ? String(data.livingRooms) : '');
      setFloorNumber(data.floorNumber != null ? String(data.floorNumber) : '');
      setStreetWidthM(data.streetWidthM != null ? String(data.streetWidthM) : '');
      setPropertyAgeYears(data.propertyAgeYears != null ? String(data.propertyAgeYears) : '');
      setCategory(data.category ?? '');
      setMasterBedrooms(data.masterBedrooms != null ? String(data.masterBedrooms) : '');
      setReceptionRooms(data.receptionRooms != null ? String(data.receptionRooms) : '');
      setHallType(data.hallType);
      setNumberOfHalls(data.numberOfHalls != null ? String(data.numberOfHalls) : '');
      setAmenities(data.amenities);

      setPriceUsd(String(data.priceUsd));
      setMinimumNights(String(data.minimumNights));
      setMaximumNights(data.maximumNights != null ? String(data.maximumNights) : '');
      setCheckInTime(data.checkInTime);
      setCheckOutTime(data.checkOutTime);
      setCancellationPolicy(data.cancellationPolicy ?? '');
      setSecurityDeposit(data.securityDepositUsd != null ? String(data.securityDepositUsd) : '');
      setBookingInstructions(data.bookingInstructions ?? '');
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handlePinChange = useCallback(
    async (coordinate: { latitude: number; longitude: number }) => {
      setPin({ lat: coordinate.latitude, lng: coordinate.longitude });
      setGeocoding(true);
      const { result } = await reverseGeocode(coordinate.latitude, coordinate.longitude, locale);
      setGeocoding(false);
      if (result) {
        setCity(result.city);
        setArea(result.area);
      }
    },
    [locale]
  );

  const pickPhotos = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 0, quality: 0.7 });
    if (!result.canceled) {
      setNewPhotos((prev) => [...prev, ...result.assets.map((a) => ({ uri: a.uri }))]);
    }
  }, []);

  const removeExistingPhoto = (photoId: string) => {
    setExistingPhotos((prev) => prev.filter((p) => p.id !== photoId));
    setRemovedPhotoIds((prev) => [...prev, photoId]);
  };

  const removeNewPhoto = (uri: string) => {
    setNewPhotos((prev) => prev.filter((p) => p.uri !== uri));
  };

  const totalPhotoCount = existingPhotos.length + newPhotos.length;

  const accommodation = listing ? isAccommodationType(listing.bookingType) : true;
  const fieldFlags = listing ? BOOKING_TYPE_FIELDS[listing.bookingType] : null;
  const applicableAmenities = listing ? amenityTypes.filter((a) => a.applicableBookingTypes.includes(listing.bookingType)) : [];
  const selectedGovernorate = governorates.find((g) => g.id === governorateId) ?? null;

  const openAvailabilitySheet = async () => {
    if (!listing) return;
    setAvailabilitySheetOpen(true);
    const [{ data: blocked }, { data: unavailable }] = await Promise.all([
      fetchBookingListingBlackoutDates(listing.id),
      fetchUnavailableRanges(listing.id),
    ]);
    setBlockedDates(blocked);
    setReservedRanges(unavailable.filter((r) => !blocked.includes(r.checkIn)));
  };

  const toggleAvailabilityDate = async (iso: string) => {
    if (!listing || availabilityBusy) return;
    setAvailabilityBusy(true);
    if (blockedDates.includes(iso)) {
      const { error } = await removeBookingListingBlackoutDate(listing.id, iso);
      setAvailabilityBusy(false);
      if (error) {
        Alert.alert(t('booking.availabilityError'));
        return;
      }
      setBlockedDates((prev) => prev.filter((d) => d !== iso));
    } else {
      const { error } = await addBookingListingBlackoutDates(listing.id, [iso]);
      setAvailabilityBusy(false);
      if (error) {
        Alert.alert(t('booking.availabilityError'));
        return;
      }
      setBlockedDates((prev) => [...prev, iso].sort());
    }
  };

  const handleSave = async () => {
    if (!listing || !fieldFlags || saving || !contactPhoneCountry) return;
    setFormError(null);

    const priceNum = Number(priceUsd);
    const minNum = accommodation ? Number(minimumNights) : 1;
    const maxNum = accommodation ? (maximumNights.trim() ? Number(maximumNights) : null) : 1;
    const depositNum = securityDeposit.trim() ? Number(securityDeposit) : null;

    if (title.trim().length === 0) {
      setFormError(t('postListing.titleLabel'));
      return;
    }
    if (description.trim().length < 20) {
      setFormError(t('booking.descriptionTooShort'));
      return;
    }
    if (!governorateId || !pin) {
      setFormError(t('postListing.mapLabel'));
      return;
    }
    if (!isValidLocalNumber(contactPhoneLocal, contactPhoneCountry)) {
      setFormError(t('postListing.contactPhoneLabel'));
      return;
    }
    if (totalPhotoCount < 3) {
      setFormError(t('postListing.errorPhotoUpload'));
      return;
    }
    if (!accommodation && !hallType) {
      setFormError(t('booking.hallTypeLabel'));
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setFormError(t('booking.nightlyPriceInvalid'));
      return;
    }
    if (!Number.isFinite(minNum) || minNum < 1) {
      setFormError(t('booking.minimumNightsInvalid'));
      return;
    }
    if (maxNum != null && (!Number.isFinite(maxNum) || maxNum < minNum)) {
      setFormError(t('booking.maximumNightsInvalid'));
      return;
    }

    setSaving(true);

    for (const photoId of removedPhotoIds) {
      await deleteBookingListingPhotoRow(photoId);
    }

    const uploadedPaths: string[] = [];
    for (let i = 0; i < newPhotos.length; i += 1) {
      const { path } = await uploadBookingListingPhoto(listing.ownerId, listing.id, existingPhotos.length + i + Date.now(), newPhotos[i].uri);
      if (path) uploadedPaths.push(path);
    }
    if (uploadedPaths.length > 0) {
      await attachBookingListingPhotos(listing.id, uploadedPaths);
    }

    const fallbackCity = selectedGovernorate ? (locale === 'ar' ? selectedGovernorate.name_ar : selectedGovernorate.name_en) : listing.city;

    const { error } = await updateBookingListingFull(listing.id, {
      title: title.trim(),
      description: description.trim(),
      governorateId,
      city: city ?? fallbackCity,
      area,
      lat: pin.lat,
      lng: pin.lng,
      priceUsd: Math.round(priceNum),
      minimumNights: Math.round(minNum),
      maximumNights: maxNum != null ? Math.round(maxNum) : null,
      bedrooms: fieldFlags.bedrooms ? parseIntOrNull(bedrooms) : null,
      bathrooms: fieldFlags.bathrooms ? parseIntOrNull(bathrooms) : null,
      beds: fieldFlags.beds ? parseIntOrNull(beds) : null,
      hallType: fieldFlags.hallFields ? hallType : null,
      numberOfHalls: fieldFlags.hallFields ? parseIntOrNull(numberOfHalls) : null,
      areaSqm: fieldFlags.areaSqm ? parseIntOrNull(areaSqm) : null,
      livingRooms: fieldFlags.livingRooms ? parseIntOrNull(livingRooms) : null,
      floorNumber: fieldFlags.floorNumber ? parseIntOrNull(floorNumber) : null,
      streetWidthM: fieldFlags.streetWidth ? parseIntOrNull(streetWidthM) : null,
      propertyAgeYears: fieldFlags.propertyAge ? parseIntOrNull(propertyAgeYears) : null,
      category: fieldFlags.category ? category.trim() || null : null,
      masterBedrooms: fieldFlags.masterBedrooms ? parseIntOrNull(masterBedrooms) : null,
      receptionRooms: fieldFlags.receptionRooms ? parseIntOrNull(receptionRooms) : null,
      amenities: applicableAmenities.length > 0 ? amenities : [],
      checkInTime,
      checkOutTime,
      cancellationPolicy: cancellationPolicy.trim() || null,
      securityDepositUsd: depositNum != null ? Math.round(depositNum) : null,
      bookingInstructions: bookingInstructions.trim() || null,
      contactPhone: toE164(contactPhoneLocal, contactPhoneCountry),
    });

    setSaving(false);
    if (error) {
      setFormError(t('booking.bookingSettingsError'));
      return;
    }
    Alert.alert(t('booking.changesSaved'));
    router.back();
  };

  const handleDelete = () => {
    if (!listing || deleting) return;
    Alert.alert(t('booking.deleteConfirmTitle'), t('booking.deleteConfirmMessage'), [
      { text: t('account.cancel'), style: 'cancel' },
      {
        text: t('booking.deleteButton'),
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const { error } = await deleteBookingListing(listing.id);
          if (!error) {
            setDeleting(false);
            router.replace('/my-booking-listings');
            return;
          }
          if (error === 'blocked') {
            await pauseBookingListing(listing.id);
            setDeleting(false);
            Alert.alert(t('booking.deleteBlockedMessage'));
            router.replace('/my-booking-listings');
            return;
          }
          setDeleting(false);
          Alert.alert(t('booking.deleteErrorMessage'));
        },
      },
    ]);
  };

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  if (loading) {
    return <LoadingState />;
  }

  if (notAuthorized || !listing || !fieldFlags) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        message={t('listingDetail.notFound')}
        actionLabel={t('postListing.back')}
        onAction={() => router.back()}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader
        title={t('booking.editBookingListingTitle')}
        rightElement={
          <Pressable style={styles.headerAction} onPress={handleDelete} disabled={deleting} hitSlop={12}>
            {deleting ? <ActivityIndicator size="small" color={theme.danger} /> : <Ionicons name="trash-outline" size={22} color={theme.danger} />}
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{t(BOOKING_TYPE_LABEL_KEY[listing.bookingType])}</Text>
        </View>

        <Text style={styles.fieldLabel}>
          {t('postListing.photosLabel')} *
        </Text>
        <Text style={styles.counterText}>{t('postListing.photosCount', { count: totalPhotoCount })}</Text>
        <View style={styles.rowWrap}>
          {existingPhotos.map((p) => (
            <View key={p.id} style={styles.photoThumbWrap}>
              <Image source={{ uri: p.publicUrl }} style={styles.photoThumb} />
              <Pressable style={styles.photoRemove} onPress={() => removeExistingPhoto(p.id)} hitSlop={8}>
                <Ionicons name="close" size={12} color={theme.white} />
              </Pressable>
            </View>
          ))}
          {newPhotos.map((p) => (
            <View key={p.uri} style={styles.photoThumbWrap}>
              <Image source={{ uri: p.uri }} style={styles.photoThumb} />
              <Pressable style={styles.photoRemove} onPress={() => removeNewPhoto(p.uri)} hitSlop={8}>
                <Ionicons name="close" size={12} color={theme.white} />
              </Pressable>
            </View>
          ))}
          <Pressable style={styles.addPhotoTile} onPress={pickPhotos}>
            <Ionicons name="add" size={22} color={theme.headingText} />
            <Text style={styles.addPhotoText}>{t('postListing.addPhoto')}</Text>
          </Pressable>
        </View>
        {totalPhotoCount < 3 && (
          <Text style={styles.missingItem}>
            • {t('postListing.photosLabel')} ({totalPhotoCount}/3)
          </Text>
        )}

        <FormInput label={t('postListing.titleLabel')} required value={title} onChangeText={setTitle} containerStyle={styles.field} />

        <Text style={styles.fieldLabel}>
          {t('postListing.contactPhoneLabel')} *
        </Text>
        {contactPhoneCountry && (
          <View style={styles.phoneRow}>
            <View style={styles.flexHalf}>
              <PhoneInput country={contactPhoneCountry} onCountryChange={setContactPhoneCountry} value={contactPhoneLocal} onChangeText={setContactPhoneLocal} placeholder="9XX XXX XXX" />
            </View>
          </View>
        )}

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
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
            initialRegion={{ latitude: pin?.lat ?? listing.lat, longitude: pin?.lng ?? listing.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
            onPress={(e) => handlePinChange(e.nativeEvent.coordinate)}
          >
            {pin && <Marker coordinate={{ latitude: pin.lat, longitude: pin.lng }} draggable onDragEnd={(e) => handlePinChange(e.nativeEvent.coordinate)} />}
          </MapView>
        </View>
        {geocoding ? (
          <View style={styles.addressRow}>
            <ActivityIndicator size="small" color={theme.headingText} />
            <Text style={styles.addressText}>{t('postListing.detectingAddress')}</Text>
          </View>
        ) : (
          <Text style={styles.addressText}>{[area, city].filter(Boolean).join('، ')}</Text>
        )}

        <Text style={styles.sectionHeading}>{t('booking.basicInfoLabel')}</Text>
        {fieldFlags.areaSqm && (
          <FormInput label={t('booking.areaLabel')} keyboardType="numeric" value={areaSqm} onChangeText={setAreaSqm} containerStyle={styles.field} />
        )}
        {fieldFlags.streetWidth && (
          <FormInput label={t('booking.streetWidthLabel')} keyboardType="numeric" value={streetWidthM} onChangeText={setStreetWidthM} containerStyle={styles.field} />
        )}
        {fieldFlags.propertyAge && (
          <FormInput label={t('booking.propertyAgeLabel')} keyboardType="numeric" value={propertyAgeYears} onChangeText={setPropertyAgeYears} containerStyle={styles.field} />
        )}
        {fieldFlags.category && (
          <FormInput label={t('booking.categoryLabel')} value={category} onChangeText={setCategory} containerStyle={styles.field} />
        )}

        {(fieldFlags.bedrooms || fieldFlags.livingRooms || fieldFlags.bathrooms || fieldFlags.beds) && (
          <Text style={styles.sectionHeading}>{t('booking.specsLabelForm')}</Text>
        )}
        {fieldFlags.bedrooms && (
          <FormInput label={t('postListing.bedroomsLabel')} keyboardType="numeric" value={bedrooms} onChangeText={setBedrooms} containerStyle={styles.field} />
        )}
        {fieldFlags.livingRooms && (
          <FormInput label={t('booking.livingRoomsLabel')} keyboardType="numeric" value={livingRooms} onChangeText={setLivingRooms} containerStyle={styles.field} />
        )}
        {fieldFlags.bathrooms && (
          <FormInput label={t('postListing.bathroomsLabel')} keyboardType="numeric" value={bathrooms} onChangeText={setBathrooms} containerStyle={styles.field} />
        )}
        {fieldFlags.beds && (
          <FormInput label={t('booking.bedsLabel')} keyboardType="numeric" value={beds} onChangeText={setBeds} containerStyle={styles.field} />
        )}

        {(fieldFlags.floorNumber || fieldFlags.masterBedrooms || fieldFlags.receptionRooms) && (
          <Text style={styles.sectionHeading}>{t('booking.additionalDetailsLabel')}</Text>
        )}
        {fieldFlags.floorNumber && (
          <FormInput
            label={t(listing.bookingType === 'furnished_villa' ? 'booking.numberOfFloorsLabel' : 'booking.floorLabel')}
            keyboardType="numeric"
            value={floorNumber}
            onChangeText={setFloorNumber}
            containerStyle={styles.field}
          />
        )}
        {fieldFlags.masterBedrooms && (
          <FormInput label={t('booking.masterBedroomsLabel')} keyboardType="numeric" value={masterBedrooms} onChangeText={setMasterBedrooms} containerStyle={styles.field} />
        )}
        {fieldFlags.receptionRooms && (
          <FormInput label={t('booking.receptionRoomsLabel')} keyboardType="numeric" value={receptionRooms} onChangeText={setReceptionRooms} containerStyle={styles.field} />
        )}
        {fieldFlags.hallFields && (
          <>
            <Text style={styles.fieldLabel}>
              {t('booking.hallTypeLabel')} *
            </Text>
            <View style={styles.rowWrap}>
              {ALL_HALL_TYPES.map((ht) => (
                <Pressable key={ht} style={[styles.choiceChip, hallType === ht && styles.choiceChipActive]} onPress={() => setHallType(ht)}>
                  <Text style={[styles.choiceChipText, hallType === ht && styles.choiceChipTextActive]}>{t(HALL_TYPE_LABEL_KEY[ht])}</Text>
                </Pressable>
              ))}
            </View>
            <FormInput label={t('booking.numberOfHallsLabel')} keyboardType="numeric" value={numberOfHalls} onChangeText={setNumberOfHalls} containerStyle={styles.field} />
          </>
        )}

        {applicableAmenities.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>{t('booking.placeFeaturesLabel')}</Text>
            <View style={styles.rowWrap}>
              {applicableAmenities.map((a) => {
                const active = amenities.includes(a.key);
                return (
                  <Pressable
                    key={a.key}
                    style={[styles.choiceChip, active && styles.choiceChipActive]}
                    onPress={() => setAmenities((prev) => (active ? prev.filter((k) => k !== a.key) : [...prev, a.key]))}
                  >
                    <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{locale === 'ar' ? a.nameAr : a.nameEn}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.sectionHeading}>{t('postListing.descriptionLabel')}</Text>
        <FormInput value={description} onChangeText={setDescription} multiline numberOfLines={5} containerStyle={styles.field} />
        <Text style={styles.counterText}>{description.trim().length}</Text>

        <Text style={styles.sectionHeading}>{accommodation ? t('booking.nightlyPriceLabel') : t('booking.priceUsdLabel')}</Text>
        {!accommodation && <Text style={styles.helperText}>{t('booking.hallPriceHint')}</Text>}
        <FormInput keyboardType="numeric" value={priceUsd} onChangeText={setPriceUsd} containerStyle={styles.field} />

        {accommodation && (
          <View style={styles.row}>
            <FormInput
              label={t('booking.minimumNightsLabel')}
              keyboardType="numeric"
              value={minimumNights}
              onChangeText={setMinimumNights}
              containerStyle={styles.flexHalf}
            />
            <FormInput
              label={t('booking.maximumNightsLabel')}
              keyboardType="numeric"
              value={maximumNights}
              onChangeText={setMaximumNights}
              containerStyle={styles.flexHalf}
            />
          </View>
        )}

        <Pressable style={styles.availabilityButton} onPress={openAvailabilitySheet}>
          <Ionicons name="calendar-outline" size={16} color={theme.headingText} />
          <Text style={styles.availabilityButtonText}>{t('booking.manageAvailability')}</Text>
          <Ionicons name="chevron-back" size={16} color={theme.mutedText} />
        </Pressable>

        <Text style={styles.sectionHeading}>{t('booking.bookingRulesLabel')}</Text>
        <TimePicker label={t('booking.checkInTimeInputLabel')} value={checkInTime} onChange={setCheckInTime} />
        <TimePicker label={t('booking.checkOutTimeInputLabel')} value={checkOutTime} onChange={setCheckOutTime} />

        <FormInput
          label={t('booking.securityDepositInputLabel')}
          keyboardType="numeric"
          value={securityDeposit}
          onChangeText={setSecurityDeposit}
          containerStyle={styles.field}
        />

        <FormInput
          label={t('booking.cancellationPolicyInputLabel')}
          value={cancellationPolicy}
          onChangeText={setCancellationPolicy}
          multiline
          containerStyle={styles.field}
        />

        <FormInput
          label={t('booking.bookingInstructionsInputLabel')}
          value={bookingInstructions}
          onChangeText={setBookingInstructions}
          multiline
          containerStyle={styles.field}
        />

        {formError && <Text style={styles.formError}>{formError}</Text>}

        <PrimaryButton label={t('booking.saveChanges')} onPress={handleSave} loading={saving} style={styles.saveButton} />
      </ScrollView>

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
                    setGovernorateId(item.id);
                    setGovernoratePickerOpen(false);
                  }}
                >
                  <Text style={styles.modalRowText}>{locale === 'ar' ? item.name_ar : item.name_en}</Text>
                  {governorateId === item.id && <Ionicons name="checkmark" size={18} color={theme.headingText} />}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>

      <Modal visible={availabilitySheetOpen} transparent animationType="slide" onRequestClose={() => setAvailabilitySheetOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setAvailabilitySheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>{t('booking.manageAvailability')}</Text>
              <Pressable onPress={() => setAvailabilitySheetOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={18} color={theme.mutedText} />
              </Pressable>
            </View>
            <Text style={styles.helperText}>{t('booking.availabilityHint')}</Text>
            <View style={{ marginTop: spacing.md }}>
              <AvailabilityToggleCalendar blockedDates={blockedDates} onToggle={toggleAvailabilityDate} reservedRanges={reservedRanges} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    headerAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

    content: { padding: spacing.lg, paddingBottom: spacing.xxl },

    typeBadge: { alignSelf: 'flex-start', backgroundColor: `${theme.accentGold}20`, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 6, marginBottom: spacing.md },
    typeBadgeText: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.accentGold },

    sectionHeading: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.sectionTitle, color: theme.headingText, marginTop: spacing.xl, marginBottom: spacing.sm },
    fieldLabel: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, marginTop: spacing.lg, marginBottom: spacing.xs },
    field: { marginTop: spacing.md },
    helperText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    counterText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, marginTop: 2 },
    missingItem: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.danger, marginTop: spacing.sm },

    rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
    row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
    flexHalf: { flex: 1 },
    phoneRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },

    choiceChip: { backgroundColor: theme.surface, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    choiceChipActive: { backgroundColor: theme.brandFill },
    choiceChipText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.mutedText },
    choiceChipTextActive: { fontFamily: fonts.headingBold, color: theme.onBrandFill },

    photoThumbWrap: { width: 72, height: 72, borderRadius: radii.md, overflow: 'hidden' },
    photoThumb: { width: '100%', height: '100%' },
    photoRemove: { position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(11,43,33,0.7)', alignItems: 'center', justifyContent: 'center' },
    addPhotoTile: { width: 72, height: 72, borderRadius: radii.md, borderWidth: 1.5, borderColor: theme.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
    addPhotoText: { fontFamily: fonts.bodyMedium, fontSize: 9, color: theme.headingText, marginTop: 2 },

    mapContainer: { height: 180, borderRadius: radii.lg, overflow: 'hidden', marginTop: spacing.sm },
    addressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
    addressText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.bodyText, marginTop: spacing.sm },

    availabilityButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: theme.surface, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginTop: spacing.xl },
    availabilityButtonText: { flex: 1, fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },

    overlay: { flex: 1, backgroundColor: 'rgba(11,43,33,0.28)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: theme.background, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, maxHeight: '85%', padding: spacing.lg },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: theme.surfaceAlt, alignSelf: 'center', marginBottom: spacing.sm },
    sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
    sheetTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.sectionTitle, color: theme.headingText },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(11,43,33,0.35)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    modalSheet: { width: '100%', maxHeight: '70%', backgroundColor: theme.background, borderRadius: radii.lg, overflow: 'hidden' },
    modalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: theme.border },
    modalRowText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.body, color: theme.bodyText },

    formError: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.danger, textAlign: 'center', marginTop: spacing.lg },
    saveButton: { marginTop: spacing.lg },
  });
}
