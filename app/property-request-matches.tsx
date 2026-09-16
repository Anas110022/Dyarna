import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { fetchAmenityTypes, type AmenityType } from '@/src/lib/listings';
import { CATEGORY_LABEL_KEY } from '@/src/lib/listingTypes';
import {
  fetchOwnerPropertyRequestMatches,
  fetchMatchedCustomerPhone,
  getOrCreateConversationForMatch,
  respondToPropertyRequest,
  type OwnerMatchedListing,
  type OwnerPropertyRequestMatch,
} from '@/src/lib/propertyRequests';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { LoadingState } from '@/src/components/LoadingState';
import { EmptyState } from '@/src/components/EmptyState';
import { FormInput } from '@/src/components/FormInput';
import { PrimaryButton } from '@/src/components/PrimaryButton';

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default function PropertyRequestMatchesScreen() {
  const { t, locale } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [userId, setUserId] = useState<string | null>(null);
  const [matches, setMatches] = useState<OwnerPropertyRequestMatch[]>([]);
  const [amenityTypes, setAmenityTypes] = useState<AmenityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);

  const [respondTarget, setRespondTarget] = useState<OwnerPropertyRequestMatch | null>(null);
  const [selectedListing, setSelectedListing] = useState<OwnerMatchedListing | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const [contactBusyId, setContactBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        setLoading(true);
        setError(false);
        setAuthRequired(false);
        const { data: authData } = await supabase.auth.getUser();
        const user = authData.user;
        if (!user) {
          if (!cancelled) {
            setLoading(false);
            setAuthRequired(true);
          }
          return;
        }
        setUserId(user.id);
        const [{ data, error: fetchError }, { data: amenities }] = await Promise.all([
          fetchOwnerPropertyRequestMatches(user.id),
          fetchAmenityTypes(),
        ]);
        if (cancelled) return;
        if (fetchError) {
          setError(true);
          setLoading(false);
          return;
        }
        setMatches(data);
        setAmenityTypes(amenities);
        setLoading(false);
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const openRespond = (item: OwnerPropertyRequestMatch) => {
    setRespondTarget(item);
    setSelectedListing(item.matchedListings.find((l) => !item.respondedListingIds.includes(l.id)) ?? null);
    setMessage('');
  };

  const closeRespond = () => {
    setRespondTarget(null);
    setSelectedListing(null);
    setMessage('');
  };

  const handleSend = async () => {
    if (!respondTarget || !userId || sending) return;
    if (!selectedListing) {
      Alert.alert(t('propertyRequest.selectListingRequired'));
      return;
    }
    setSending(true);
    const { error: sendError } = await respondToPropertyRequest(respondTarget.request.id, selectedListing.id, userId, message.trim() || null);
    setSending(false);
    if (sendError) {
      Alert.alert(sendError === 'already_responded' ? t('propertyRequest.alreadyRespondedError') : t('propertyRequest.responseError'));
      return;
    }
    Alert.alert(t('propertyRequest.responseSent'));
    setMatches((prev) =>
      prev.map((m) =>
        m.request.id === respondTarget.request.id ? { ...m, respondedListingIds: [...m.respondedListingIds, selectedListing.id] } : m
      )
    );
    closeRespond();
  };

  // Step 2 — owner contacting the matched customer. Each call re-verifies
  // the real property_request_matches relationship server-side (see
  // 20260926000000_property_request_owner_contact.sql); the client never
  // reads the customer's phone or id directly. The first matched listing
  // is used as the real conversation's listing context, matching how a
  // real conversation is always tied to one specific listing.
  const contactChat = async (item: OwnerPropertyRequestMatch) => {
    const listing = item.matchedListings[0];
    if (!listing || !userId || contactBusyId) return;
    setContactBusyId(item.request.id);
    const { conversationId, error } = await getOrCreateConversationForMatch(item.request.id, listing.id);
    setContactBusyId(null);
    if (error || !conversationId) {
      Alert.alert(error === 'cannot_message_self' ? t('propertyRequest.cannotMessageSelf') : t('propertyRequest.contactChatError'));
      return;
    }
    router.push(`/chat/${conversationId}`);
  };

  const contactWhatsApp = async (item: OwnerPropertyRequestMatch) => {
    if (contactBusyId) return;
    setContactBusyId(item.request.id);
    const { phone, error } = await fetchMatchedCustomerPhone(item.request.id);
    setContactBusyId(null);
    if (error || !phone) {
      Alert.alert(t('propertyRequest.customerNoPhone'));
      return;
    }
    Linking.openURL(`https://wa.me/${phone.replace(/[^0-9]/g, '')}`);
  };

  const contactCall = async (item: OwnerPropertyRequestMatch) => {
    if (contactBusyId) return;
    setContactBusyId(item.request.id);
    const { phone, error } = await fetchMatchedCustomerPhone(item.request.id);
    setContactBusyId(null);
    if (error || !phone) {
      Alert.alert(t('propertyRequest.customerNoPhone'));
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  return (
    <View style={styles.flex}>
      <AppHeader title={t('propertyRequest.matchesTitle')} />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" message={t('propertyRequest.loadError')} />
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.request.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState icon="search-outline" message={t('propertyRequest.matchesEmpty')} />}
          renderItem={({ item }) => {
            const req = item.request;
            const allResponded = item.matchedListings.every((l) => item.respondedListingIds.includes(l.id));
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {t(req.requestType === 'rent' ? 'propertyRequest.requestTypeRent' : 'propertyRequest.requestTypeSale')} ·{' '}
                  {t(CATEGORY_LABEL_KEY[req.propertyType])}
                </Text>
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={12} color={theme.mutedText} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {[req.neighborhood, req.city, locale === 'ar' ? req.governorateNameAr : req.governorateNameEn].filter(Boolean).join('، ')}
                  </Text>
                </View>
                {(req.minPriceUsd != null || req.maxPriceUsd != null) && (
                  <Text style={styles.budgetText}>
                    {req.minPriceUsd != null ? `$${groupThousands(req.minPriceUsd)}` : '—'} - {req.maxPriceUsd != null ? `$${groupThousands(req.maxPriceUsd)}` : '—'}
                  </Text>
                )}
                <View style={styles.specsRow}>
                  {req.minRooms != null && <Text style={styles.specText}>{t('propertyRequest.roomsLabel')}: {req.minRooms}+</Text>}
                  {req.minBathrooms != null && <Text style={styles.specText}>{t('propertyRequest.bathroomsLabel')}: {req.minBathrooms}+</Text>}
                </View>
                {req.requestedFeatures.length > 0 && (
                  <View style={styles.rowWrap}>
                    {req.requestedFeatures.map((key) => {
                      const amenity = amenityTypes.find((a) => a.key === key);
                      return (
                        <View key={key} style={styles.featureTag}>
                          <Text style={styles.featureTagText}>{amenity ? (locale === 'ar' ? amenity.nameAr : amenity.nameEn) : key}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
                {req.notes && <Text style={styles.notesText}>{req.notes}</Text>}

                <Text style={styles.matchedListingsLabel}>{t('propertyRequest.matchedListingsLabel')}</Text>
                {item.matchedListings.map((l) => (
                  <View key={l.id} style={styles.matchedListingRow}>
                    {l.photoUrl ? (
                      <Image source={{ uri: l.photoUrl }} style={styles.matchedListingPhoto} />
                    ) : (
                      <View style={[styles.matchedListingPhoto, styles.matchedListingPhotoPlaceholder]}>
                        <Ionicons name="image-outline" size={14} color={theme.mutedText} />
                      </View>
                    )}
                    <Text style={styles.matchedListingTitle} numberOfLines={1}>
                      {l.title}
                    </Text>
                    <Text style={styles.matchedListingPrice}>${groupThousands(l.priceUsd)}</Text>
                  </View>
                ))}

                <Text style={styles.contactSectionTitle}>{t('propertyRequest.contactCustomerTitle')}</Text>
                <View style={styles.contactRow}>
                  <Pressable style={styles.chatButton} onPress={() => contactChat(item)} disabled={contactBusyId === item.request.id}>
                    <Ionicons name="chatbubble-outline" size={14} color={theme.headingText} />
                    <Text style={styles.chatButtonText}>{t('listingDetail.chatInApp')}</Text>
                  </Pressable>
                  <Pressable style={styles.whatsappButton} onPress={() => contactWhatsApp(item)} disabled={contactBusyId === item.request.id}>
                    <Ionicons name="logo-whatsapp" size={15} color={theme.white} />
                    <Text style={styles.whatsappButtonText}>{t('listingDetail.whatsapp')}</Text>
                  </Pressable>
                  <Pressable style={styles.callButton} onPress={() => contactCall(item)} disabled={contactBusyId === item.request.id}>
                    <Ionicons name="call-outline" size={14} color={theme.white} />
                    <Text style={styles.callButtonText}>{t('listingDetail.call')}</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={[styles.respondButton, allResponded && styles.respondButtonDisabled]}
                  onPress={() => openRespond(item)}
                  disabled={allResponded}
                >
                  <Text style={[styles.respondButtonText, allResponded && styles.respondButtonTextDisabled]}>
                    {allResponded ? t('propertyRequest.alreadyResponded') : t('propertyRequest.haveMatchingProperty')}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}

      <Modal visible={!!respondTarget} transparent animationType="fade" onRequestClose={closeRespond}>
        <Pressable style={styles.modalOverlay} onPress={closeRespond}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t('propertyRequest.respondModalTitle')}</Text>
            <ScrollView>
              <Text style={styles.fieldLabel}>{t('propertyRequest.selectListingLabel')}</Text>
              {respondTarget?.matchedListings.map((l) => {
                const responded = respondTarget.respondedListingIds.includes(l.id);
                const active = selectedListing?.id === l.id;
                return (
                  <Pressable
                    key={l.id}
                    style={[styles.listingOption, active && styles.listingOptionActive, responded && styles.listingOptionDisabled]}
                    onPress={() => !responded && setSelectedListing(l)}
                    disabled={responded}
                  >
                    <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={responded ? theme.mutedText : theme.headingText} />
                    <Text style={styles.listingOptionText} numberOfLines={1}>
                      {l.title} — ${groupThousands(l.priceUsd)}
                    </Text>
                    {responded && <Text style={styles.listingOptionBadge}>{t('propertyRequest.alreadyResponded')}</Text>}
                  </Pressable>
                );
              })}

              <FormInput
                label={t('propertyRequest.messageToCustomerLabel')}
                value={message}
                onChangeText={(v) => setMessage(v.slice(0, 500))}
                placeholder={t('propertyRequest.messageToCustomerPlaceholder')}
                multiline
                numberOfLines={4}
                maxLength={500}
                containerStyle={styles.field}
              />
              <Text style={styles.counterText}>{message.length}/500</Text>

              <PrimaryButton label={t('propertyRequest.sendResponse')} onPress={handleSend} loading={sending} style={styles.sendButton} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },

    listContent: { padding: spacing.lg, flexGrow: 1 },
    card: { backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md, gap: 6 },
    cardTitle: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.body, color: theme.headingText },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    locationText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText, flexShrink: 1 },
    budgetText: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText },
    specsRow: { flexDirection: 'row', gap: spacing.md },
    specText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    featureTag: { backgroundColor: theme.background, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
    featureTagText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.bodyText },
    notesText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.bodyText, lineHeight: 18 },

    matchedListingsLabel: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.headingText, marginTop: spacing.xs },
    matchedListingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    matchedListingPhoto: { width: 36, height: 36, borderRadius: radii.sm, backgroundColor: theme.surfaceAlt },
    matchedListingPhotoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    matchedListingTitle: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    matchedListingPrice: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.headingText },

    respondButton: { backgroundColor: theme.brandFill, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.xs },
    respondButtonDisabled: { backgroundColor: theme.surfaceAlt },
    respondButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.onBrandFill },
    respondButtonTextDisabled: { color: theme.mutedText },

    contactSectionTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.bodyText, marginTop: spacing.sm },
    contactRow: { flexDirection: 'row', gap: spacing.xs },
    chatButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      borderWidth: 1.5,
      borderColor: theme.headingText,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
    },
    chatButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText },
    whatsappButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: theme.success,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
    },
    whatsappButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.white },
    callButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: theme.brandFill,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
    },
    callButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.white },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(11,43,33,0.35)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    modalCard: { width: '100%', maxHeight: '80%', backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.lg },
    modalTitle: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.sectionTitle, color: theme.headingText, marginBottom: spacing.md },
    fieldLabel: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.bodyText, marginTop: spacing.md, marginBottom: spacing.xs },
    field: { marginTop: spacing.md },
    counterText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, marginTop: 2 },

    listingOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: theme.background,
      borderRadius: radii.md,
      padding: spacing.sm,
      marginBottom: spacing.xs,
    },
    listingOptionActive: { borderWidth: 1.5, borderColor: theme.headingText },
    listingOptionDisabled: { opacity: 0.5 },
    listingOptionText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.bodyText },
    listingOptionBadge: { fontFamily: fonts.bodyRegular, fontSize: 9.5, color: theme.mutedText },

    sendButton: { marginTop: spacing.md },
  });
}
