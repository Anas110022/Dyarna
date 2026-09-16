import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { CATEGORY_LABEL_KEY } from '@/src/lib/listingTypes';
import { fetchAmenityTypes, type AmenityType } from '@/src/lib/listings';
import {
  cancelPropertyRequest,
  fetchPropertyRequest,
  fetchResponsesForRequest,
  type PropertyRequest,
  type PropertyRequestResponse,
  type PropertyRequestStatus,
} from '@/src/lib/propertyRequests';
import { AppHeader } from '@/src/components/AppHeader';
import { LoadingState } from '@/src/components/LoadingState';
import { EmptyState } from '@/src/components/EmptyState';
import { StatusBadge } from '@/src/components/StatusBadge';
import { SectionTitle } from '@/src/components/SectionTitle';

const STATUS_LABEL_KEY: Record<PropertyRequestStatus, string> = {
  active: 'propertyRequest.statusActive',
  closed: 'propertyRequest.statusClosed',
  cancelled: 'propertyRequest.statusCancelled',
};

const STATUS_TONE: Record<PropertyRequestStatus, 'pending' | 'success' | 'danger' | 'neutral'> = {
  active: 'success',
  closed: 'neutral',
  cancelled: 'danger',
};

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default function PropertyRequestDetailsScreen() {
  const { t, locale } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [request, setRequest] = useState<PropertyRequest | null>(null);
  const [amenityTypes, setAmenityTypes] = useState<AmenityType[]>([]);
  const [responses, setResponses] = useState<PropertyRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        setLoading(true);
        setNotFound(false);
        const [{ data, error }, { data: amenities }, { data: responseData }] = await Promise.all([
          fetchPropertyRequest(id),
          fetchAmenityTypes(),
          fetchResponsesForRequest(id),
        ]);
        if (cancelled) return;
        if (error || !data) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setRequest(data);
        setAmenityTypes(amenities);
        setResponses(responseData);
        setLoading(false);
      }
      if (id) load();
      return () => {
        cancelled = true;
      };
    }, [id])
  );

  const handleCancel = () => {
    Alert.alert(t('propertyRequest.cancelConfirmTitle'), t('propertyRequest.cancelConfirmMessage'), [
      { text: t('account.cancel'), style: 'cancel' },
      {
        text: t('propertyRequest.cancelButton'),
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          const { error } = await cancelPropertyRequest(id);
          setCancelling(false);
          if (error) {
            Alert.alert(t('propertyRequest.cancelError'));
            return;
          }
          setRequest((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
          Alert.alert(t('propertyRequest.cancelSuccess'));
        },
      },
    ]);
  };

  return (
    <View style={styles.flex}>
      <AppHeader title={t('propertyRequest.detailsTitle')} />

      {loading ? (
        <LoadingState />
      ) : notFound || !request ? (
        <EmptyState icon="alert-circle-outline" message={t('propertyRequest.notFound')} />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>
                {t(request.requestType === 'rent' ? 'propertyRequest.requestTypeRent' : 'propertyRequest.requestTypeSale')} ·{' '}
                {t(CATEGORY_LABEL_KEY[request.propertyType])}
              </Text>
              <StatusBadge label={t(STATUS_LABEL_KEY[request.status])} tone={STATUS_TONE[request.status]} />
            </View>

            <DetailRow
              label={t('propertyRequest.locationLabel')}
              value={[request.neighborhood, request.city, locale === 'ar' ? request.governorateNameAr : request.governorateNameEn].filter(Boolean).join('، ') || '—'}
              theme={theme}
            />
            <DetailRow
              label={t('propertyRequest.budgetLabel')}
              value={
                request.minPriceUsd == null && request.maxPriceUsd == null
                  ? t('propertyRequest.budgetNotSpecified')
                  : `${request.minPriceUsd != null ? `$${groupThousands(request.minPriceUsd)}` : '—'} - ${
                      request.maxPriceUsd != null ? `$${groupThousands(request.maxPriceUsd)}` : '—'
                    }`
              }
              theme={theme}
            />
            {request.minRooms != null && <DetailRow label={t('propertyRequest.roomsLabel')} value={String(request.minRooms)} theme={theme} />}
            {request.minBathrooms != null && <DetailRow label={t('propertyRequest.bathroomsLabel')} value={String(request.minBathrooms)} theme={theme} />}
            <DetailRow label={t('propertyRequest.createdAtLabel')} value={new Date(request.createdAt).toLocaleDateString(locale === 'ar' ? 'ar-SY' : 'en-US')} theme={theme} />

            {request.requestedFeatures.length > 0 && (
              <>
                <SectionTitle style={styles.sectionTitle}>{t('propertyRequest.featuresLabel')}</SectionTitle>
                <View style={styles.rowWrap}>
                  {request.requestedFeatures.map((key) => {
                    const amenity = amenityTypes.find((a) => a.key === key);
                    return (
                      <View key={key} style={styles.featureTag}>
                        <Text style={styles.featureTagText}>{amenity ? (locale === 'ar' ? amenity.nameAr : amenity.nameEn) : key}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {request.notes && (
              <>
                <SectionTitle style={styles.sectionTitle}>{t('propertyRequest.notesLabel')}</SectionTitle>
                <Text style={styles.notesText}>{request.notes}</Text>
              </>
            )}
          </View>

          <SectionTitle style={styles.responsesTitle}>{t('propertyRequest.responsesTitle')}</SectionTitle>
          {responses.length === 0 ? (
            <Text style={styles.responsesEmpty}>{t('propertyRequest.responsesEmpty')}</Text>
          ) : (
            responses.map((r) => (
              <Pressable key={r.id} style={styles.responseCard} onPress={() => router.push(`/listing/${r.listingId}`)}>
                {r.listingPhotoUrl ? (
                  <Image source={{ uri: r.listingPhotoUrl }} style={styles.responsePhoto} />
                ) : (
                  <View style={[styles.responsePhoto, styles.responsePhotoPlaceholder]}>
                    <Ionicons name="image-outline" size={18} color={theme.mutedText} />
                  </View>
                )}
                <View style={styles.responseInfo}>
                  <Text style={styles.responseListingTitle} numberOfLines={1}>
                    {r.listingTitle}
                  </Text>
                  <Text style={styles.responseLocation} numberOfLines={1}>
                    {[r.listingArea, r.listingCity].filter(Boolean).join('، ')}
                  </Text>
                  <Text style={styles.responsePrice}>${groupThousands(r.listingPriceUsd)}</Text>
                  {r.message && <Text style={styles.responseMessage}>{r.message}</Text>}
                  <Text style={styles.responseFrom}>
                    {t('propertyRequest.responseFrom')} {r.ownerFullName ?? '—'} · {new Date(r.createdAt).toLocaleDateString(locale === 'ar' ? 'ar-SY' : 'en-US')}
                  </Text>
                </View>
                <Ionicons name="chevron-back" size={16} color={theme.mutedText} />
              </Pressable>
            ))
          )}

          {request.status === 'active' && (
            <Pressable style={[styles.cancelButton, cancelling && styles.cancelButtonDisabled]} onPress={handleCancel} disabled={cancelling}>
              {cancelling ? <ActivityIndicator color={theme.danger} /> : <Text style={styles.cancelButtonText}>{t('propertyRequest.cancelButton')}</Text>}
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function DetailRow({ label, value, theme }: { label: string; value: string; theme: ThemeColors }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },

    scrollContent: { padding: spacing.lg, flexGrow: 1 },
    card: { backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
    cardTitle: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.sectionTitle, color: theme.headingText, flexShrink: 1 },

    detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: theme.border },
    detailLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.mutedText },
    detailValue: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText, flexShrink: 1, textAlign: 'right' },

    sectionTitle: { marginTop: spacing.md, marginBottom: spacing.xs },
    rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    featureTag: { backgroundColor: theme.background, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
    featureTagText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.bodyText },
    notesText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.body, color: theme.bodyText, lineHeight: 20 },

    responsesTitle: { marginTop: spacing.lg, marginBottom: spacing.sm },
    responsesEmpty: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.mutedText },
    responseCard: {
      flexDirection: 'row',
      gap: spacing.sm,
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      alignItems: 'flex-start',
    },
    responsePhoto: { width: 60, height: 60, borderRadius: radii.md, backgroundColor: theme.surfaceAlt },
    responsePhotoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    responseInfo: { flex: 1, gap: 2 },
    responseListingTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText },
    responseLocation: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText },
    responsePrice: { fontFamily: fonts.headingBlack, fontSize: fontSizes.body, color: theme.headingText, marginTop: 2 },
    responseMessage: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.bodyText, marginTop: 4, lineHeight: 16 },
    responseFrom: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, marginTop: 4 },

    cancelButton: { marginTop: spacing.lg, borderRadius: radii.md, borderWidth: 1.5, borderColor: theme.danger, paddingVertical: spacing.md, alignItems: 'center' },
    cancelButtonDisabled: { opacity: 0.5 },
    cancelButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.button, color: theme.danger },
  });
}
