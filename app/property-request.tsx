import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, FlatList, Modal, Alert } from 'react-native';
import { router } from 'expo-router';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { fetchGovernorates, fetchAmenityTypes, type Governorate, type AmenityType } from '@/src/lib/listings';
import { ALL_CATEGORIES, CATEGORY_LABEL_KEY, type ListingCategory, type DealType } from '@/src/lib/listingTypes';
import { createPropertyRequest } from '@/src/lib/propertyRequests';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { LoadingState } from '@/src/components/LoadingState';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { FormInput } from '@/src/components/FormInput';
import { SelectInput } from '@/src/components/SelectInput';

function parseIntOrNull(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export default function PropertyRequestScreen() {
  const { t, locale } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [initializing, setInitializing] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [amenityTypes, setAmenityTypes] = useState<AmenityType[]>([]);

  const [requestType, setRequestType] = useState<DealType | null>(null);
  const [propertyType, setPropertyType] = useState<ListingCategory | null>(null);
  const [governorateId, setGovernorateId] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minRooms, setMinRooms] = useState('');
  const [minBathrooms, setMinBathrooms] = useState('');
  const [features, setFeatures] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [governoratePickerOpen, setGovernoratePickerOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        setAuthRequired(true);
        setInitializing(false);
        return;
      }
      setUserId(user.id);
      const [{ data: govs }, { data: amenities }] = await Promise.all([fetchGovernorates(), fetchAmenityTypes()]);
      setGovernorates(govs);
      setAmenityTypes(amenities);
      setInitializing(false);
    })();
  }, []);

  const selectedGovernorate = governorates.find((g) => g.id === governorateId) ?? null;

  const toggleFeature = (key: string) => {
    setFeatures((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const validate = (): string | null => {
    if (!requestType) return t('propertyRequest.requestTypeRequired');
    if (!propertyType) return t('propertyRequest.propertyTypeRequired');
    if (!governorateId) return t('propertyRequest.governorateRequired');
    if (minPrice && (parseIntOrNull(minPrice) === null || Number(minPrice) < 0)) return t('propertyRequest.priceInvalid');
    if (maxPrice && (parseIntOrNull(maxPrice) === null || Number(maxPrice) < 0)) return t('propertyRequest.priceInvalid');
    if (minPrice && maxPrice && Number(minPrice) > Number(maxPrice)) return t('propertyRequest.priceRangeInvalid');
    if (minRooms && Number(minRooms) < 0) return t('propertyRequest.roomsInvalid');
    if (minBathrooms && Number(minBathrooms) < 0) return t('propertyRequest.bathroomsInvalid');
    if (notes.length > 1000) return t('propertyRequest.notesTooLong');
    return null;
  };

  const handleSubmit = async () => {
    if (submitting || !userId) return;
    const validationError = validate();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }
    // validate() above already guarantees these are set — re-checked here
    // only so TypeScript can narrow them past the null branch of validate().
    if (!requestType || !propertyType) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const { id, error } = await createPropertyRequest({
        userId,
        requestType,
        propertyType,
        governorateId,
        city: city.trim() || null,
        neighborhood: neighborhood.trim() || null,
        minPriceUsd: minPrice ? parseIntOrNull(minPrice) : null,
        maxPriceUsd: maxPrice ? parseIntOrNull(maxPrice) : null,
        minRooms: minRooms ? parseIntOrNull(minRooms) : null,
        minBathrooms: minBathrooms ? parseIntOrNull(minBathrooms) : null,
        requestedFeatures: features,
        notes: notes.trim() || null,
      });

      if (error || !id) {
        setSubmitError(t('propertyRequest.submitError'));
        return;
      }

      Alert.alert(t('propertyRequest.submitSuccess'));
      router.replace(`/property-request/${id}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (initializing) {
    return <LoadingState />;
  }

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader title={t('propertyRequest.title')} />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.formCard}>
          <Text style={styles.formCardHeading}>{t('propertyRequest.requestTypeLabel')}</Text>
          <View style={styles.rowWrap}>
            <Pressable
              style={[styles.choiceChip, requestType === 'rent' && styles.choiceChipActive]}
              onPress={() => setRequestType('rent')}
            >
              <Text style={[styles.choiceChipText, requestType === 'rent' && styles.choiceChipTextActive]}>
                {t('propertyRequest.requestTypeRent')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.choiceChip, requestType === 'sale' && styles.choiceChipActive]}
              onPress={() => setRequestType('sale')}
            >
              <Text style={[styles.choiceChipText, requestType === 'sale' && styles.choiceChipTextActive]}>
                {t('propertyRequest.requestTypeSale')}
              </Text>
            </Pressable>
          </View>

          <SelectInput
            label={t('propertyRequest.propertyTypeLabel')}
            required
            value={propertyType ? t(CATEGORY_LABEL_KEY[propertyType]) : null}
            placeholder={t('propertyRequest.propertyTypePlaceholder')}
            onPress={() => setCategoryPickerOpen(true)}
            containerStyle={styles.field}
          />
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formCardHeading}>{t('propertyRequest.locationLabel')}</Text>
          <SelectInput
            label={t('postListing.governorateLabel')}
            required
            value={selectedGovernorate ? (locale === 'ar' ? selectedGovernorate.name_ar : selectedGovernorate.name_en) : null}
            placeholder={t('postListing.governoratePlaceholder')}
            onPress={() => setGovernoratePickerOpen(true)}
            containerStyle={styles.field}
          />

          <FormInput
            label={t('postListing.cityLabel')}
            value={city}
            onChangeText={setCity}
            placeholder={t('postListing.cityPlaceholder')}
            containerStyle={styles.field}
          />

          <FormInput
            label={t('propertyRequest.neighborhoodLabel')}
            value={neighborhood}
            onChangeText={setNeighborhood}
            placeholder={t('propertyRequest.neighborhoodPlaceholder')}
            containerStyle={styles.field}
          />
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formCardHeading}>{t('propertyRequest.budgetLabel')}</Text>
          <View style={styles.row}>
            <View style={styles.flexHalf}>
              <Text style={styles.fieldLabel}>{t('propertyRequest.minPriceLabel')}</Text>
              <View style={styles.priceInputRow}>
                <FormInput keyboardType="numeric" value={minPrice} onChangeText={setMinPrice} containerStyle={styles.priceInput} />
                <View style={styles.currencyBadge}>
                  <Text style={styles.currencyBadgeText}>USD</Text>
                </View>
              </View>
            </View>
            <View style={styles.flexHalf}>
              <Text style={styles.fieldLabel}>{t('propertyRequest.maxPriceLabel')}</Text>
              <View style={styles.priceInputRow}>
                <FormInput keyboardType="numeric" value={maxPrice} onChangeText={setMaxPrice} containerStyle={styles.priceInput} />
                <View style={styles.currencyBadge}>
                  <Text style={styles.currencyBadgeText}>USD</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.row}>
            <FormInput
              label={t('propertyRequest.roomsLabel')}
              keyboardType="numeric"
              value={minRooms}
              onChangeText={setMinRooms}
              containerStyle={styles.flexHalf}
            />
            <FormInput
              label={t('propertyRequest.bathroomsLabel')}
              keyboardType="numeric"
              value={minBathrooms}
              onChangeText={setMinBathrooms}
              containerStyle={styles.flexHalf}
            />
          </View>
        </View>

        {amenityTypes.length > 0 && (
          <View style={styles.formCard}>
            <Text style={styles.formCardHeading}>{t('propertyRequest.featuresLabel')}</Text>
            <View style={styles.rowWrap}>
              {amenityTypes.map((a) => {
                const active = features.includes(a.key);
                return (
                  <Pressable key={a.key} style={[styles.choiceChip, active && styles.choiceChipActive]} onPress={() => toggleFeature(a.key)}>
                    <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{locale === 'ar' ? a.nameAr : a.nameEn}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.formCard}>
          <Text style={styles.formCardHeading}>{t('propertyRequest.notesLabel')}</Text>
          <FormInput
            value={notes}
            onChangeText={(v) => setNotes(v.slice(0, 1000))}
            placeholder={t('propertyRequest.notesPlaceholder')}
            multiline
            numberOfLines={5}
            maxLength={1000}
          />
          <Text style={styles.counterText}>{notes.length}/1000</Text>
        </View>

        {submitError && <Text style={styles.errorText}>{submitError}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label={t('propertyRequest.submitButton')} onPress={handleSubmit} loading={submitting} />
      </View>

      <Modal visible={categoryPickerOpen} transparent animationType="fade" onRequestClose={() => setCategoryPickerOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setCategoryPickerOpen(false)}>
          <View style={styles.modalSheet}>
            <FlatList
              data={ALL_CATEGORIES}
              keyExtractor={(c) => c}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setPropertyType(item);
                    setCategoryPickerOpen(false);
                  }}
                >
                  <Text style={styles.modalRowText}>{t(CATEGORY_LABEL_KEY[item])}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>

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

    formCard: { backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
    formCardHeading: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.sectionTitle, color: theme.headingText, marginBottom: spacing.xs },
    fieldLabel: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, marginBottom: spacing.sm },
    field: { marginTop: spacing.md },
    counterText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, marginTop: 2 },
    errorText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.body, color: theme.danger, marginBottom: spacing.md, textAlign: 'center' },

    row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    flexHalf: { flex: 1 },

    priceInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    priceInput: { flex: 1 },
    currencyBadge: { backgroundColor: theme.surfaceAlt, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
    currencyBadgeText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText },

    choiceChip: { backgroundColor: theme.background, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    choiceChipActive: { backgroundColor: theme.brandFill },
    choiceChipText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.mutedText },
    choiceChipTextActive: { fontFamily: fonts.headingBold, color: theme.onBrandFill },

    footer: { padding: spacing.lg, backgroundColor: theme.background },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(11,43,33,0.35)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    modalSheet: { width: '100%', maxHeight: '70%', backgroundColor: theme.background, borderRadius: radii.lg, overflow: 'hidden' },
    modalRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: theme.border },
    modalRowText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.body, color: theme.bodyText },
  });
}
