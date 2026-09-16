import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { CATEGORY_LABEL_KEY } from '@/src/lib/listingTypes';
import { useI18n } from '@/src/i18n';
import { decideAdminListing, fetchAdminListingsQueue, type AdminPendingListing } from '@/src/lib/admin';
import { AppHeader } from '@/src/components/AppHeader';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default function AdminListingsQueueScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [listings, setListings] = useState<AdminPendingListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    const result = await fetchAdminListingsQueue();
    if (result.forbidden) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    if (result.error || !result.data) {
      setError(result.error ?? 'حدث خطأ غير معروف');
      setLoading(false);
      return;
    }
    setListings(result.data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const applyDecision = async (listingId: string, decision: 'published' | 'rejected', reason?: string) => {
    setBusyId(listingId);
    const result = await decideAdminListing(listingId, decision, reason);
    setBusyId(null);
    if (result.forbidden) {
      Alert.alert('غير مصرح', 'ليس لديك صلاحية لاتخاذ هذا الإجراء.');
      return;
    }
    if (result.error) {
      const message =
        result.error === 'not_enough_photos'
          ? 'لا يمكن نشر هذا الإعلان — يحتاج إلى 3 صور على الأقل.'
          : 'حدث خطأ، يرجى المحاولة مرة أخرى.';
      Alert.alert('خطأ', message);
      return;
    }
    load();
  };

  const confirmPublish = (item: AdminPendingListing) => {
    Alert.alert('نشر الإعلان', `هل تريد نشر إعلان "${item.title}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'نشر', onPress: () => applyDecision(item.id, 'published') },
    ]);
  };

  const confirmReject = (item: AdminPendingListing) => {
    Alert.alert('رفض الإعلان', `هل تريد رفض إعلان "${item.title}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'رفض', style: 'destructive', onPress: () => applyDecision(item.id, 'rejected') },
    ]);
  };

  return (
    <View style={styles.flex}>
      <AppHeader title="مراجعة الإعلانات" />

      {loading ? (
        <LoadingState />
      ) : forbidden ? (
        <EmptyState icon="lock-closed-outline" message="غير مصرح لك بالوصول إلى هذه الصفحة" />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" message={error} />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState icon="home-outline" message="لا توجد إعلانات قيد المراجعة حاليًا" />}
          renderItem={({ item }) => {
            const photos = (item.listing_photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
            const photoUrl = photos[0] ? supabase.storage.from('listing-photos').getPublicUrl(photos[0].storage_path).data.publicUrl : null;
            const busy = busyId === item.id;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  {photoUrl ? (
                    <Image source={{ uri: photoUrl }} style={styles.photo} />
                  ) : (
                    <View style={[styles.photo, styles.photoPlaceholder]}>
                      <Ionicons name="image-outline" size={18} color={theme.mutedText} />
                    </View>
                  )}
                  <View style={styles.cardInfo}>
                    <Text style={styles.title} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.category}>
                      {t(CATEGORY_LABEL_KEY[item.category])} · {item.listing_type === 'rent' ? 'للإيجار' : 'للبيع'}
                    </Text>
                    <View style={styles.locationRow}>
                      <Ionicons name="location-outline" size={11} color={theme.mutedText} />
                      <Text style={styles.location} numberOfLines={1}>
                        {[item.area, item.city].filter(Boolean).join('، ')}
                      </Text>
                    </View>
                    <Text style={styles.price}>${groupThousands(item.price_usd)}</Text>
                  </View>
                </View>

                <View style={styles.ownerRow}>
                  <Ionicons name="person-circle-outline" size={16} color={theme.mutedText} />
                  <Text style={styles.ownerText}>{item.profiles?.full_name ?? 'مستخدم ديارنا'}</Text>
                  {item.profiles?.is_verified ? (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="shield-checkmark-outline" size={11} color={theme.accentGold} />
                      <Text style={styles.verifiedBadgeText}>موثّق</Text>
                    </View>
                  ) : (
                    <View style={styles.unverifiedBadge}>
                      <Text style={styles.unverifiedBadgeText}>غير موثّق</Text>
                    </View>
                  )}
                  <Text style={styles.photoCount}>{photos.length} صور</Text>
                </View>

                <Text style={styles.description} numberOfLines={3}>
                  {item.description}
                </Text>

                <Pressable onPress={() => router.push(`/listing/${item.id}`)}>
                  <Text style={styles.viewLink}>عرض تفاصيل الإعلان الكاملة</Text>
                </Pressable>

                <View style={styles.actionsRow}>
                  <Pressable style={[styles.actionButton, styles.publishButton]} onPress={() => confirmPublish(item)} disabled={busy}>
                    {busy ? <ActivityIndicator size="small" color={theme.white} /> : <Text style={styles.publishButtonText}>نشر الإعلان</Text>}
                  </Pressable>
                  <Pressable style={[styles.actionButton, styles.rejectButton]} onPress={() => confirmReject(item)} disabled={busy}>
                    <Text style={styles.rejectButtonText}>رفض</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    listContent: { padding: spacing.lg, flexGrow: 1 },
    card: { backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md, gap: spacing.sm },
    cardTop: { flexDirection: 'row', gap: spacing.sm },
    photo: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: theme.surfaceAlt },
    photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    cardInfo: { flex: 1, justifyContent: 'center', gap: 2 },
    title: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    category: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.accentGold },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    location: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    price: { fontFamily: fonts.headingBlack, fontSize: fontSizes.body, color: theme.headingText, marginTop: 2 },

    ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    ownerText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.bodyText, flexShrink: 1 },
    verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    verifiedBadgeText: { fontFamily: fonts.headingBold, fontSize: 9.5, color: theme.accentGold },
    unverifiedBadge: { backgroundColor: `${theme.danger}20`, borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 1 },
    unverifiedBadgeText: { fontFamily: fonts.headingBold, fontSize: 9, color: theme.danger },
    photoCount: { fontFamily: fonts.bodyRegular, fontSize: 9.5, color: theme.mutedText, marginLeft: 'auto' as const },

    description: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, lineHeight: 16 },
    viewLink: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText, textDecorationLine: 'underline' },

    actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    actionButton: { flex: 1, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: 'center' },
    publishButton: { backgroundColor: theme.success },
    publishButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.white },
    rejectButton: { backgroundColor: theme.danger },
    rejectButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.white },
  });
}
