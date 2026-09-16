import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { PROJECT_TYPE_LABEL_KEY } from '@/src/lib/projectTypes';
import { useI18n } from '@/src/i18n';
import { decideAdminProject, fetchAdminProjectsQueue, type AdminPendingProject } from '@/src/lib/admin';
import { AppHeader } from '@/src/components/AppHeader';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default function AdminProjectsQueueScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [projects, setProjects] = useState<AdminPendingProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    const result = await fetchAdminProjectsQueue();
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
    setProjects(result.data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const applyDecision = async (projectId: string, decision: 'published' | 'rejected', reason?: string) => {
    setBusyId(projectId);
    const result = await decideAdminProject(projectId, decision, reason);
    setBusyId(null);
    if (result.forbidden) {
      Alert.alert('غير مصرح', 'ليس لديك صلاحية لاتخاذ هذا الإجراء.');
      return;
    }
    if (result.error) {
      const message =
        result.error === 'not_enough_photos'
          ? 'لا يمكن نشر هذا المشروع — يحتاج إلى صورة واحدة على الأقل.'
          : 'حدث خطأ، يرجى المحاولة مرة أخرى.';
      Alert.alert('خطأ', message);
      return;
    }
    load();
  };

  const confirmPublish = (item: AdminPendingProject) => {
    Alert.alert('نشر المشروع', `هل تريد نشر مشروع "${item.title}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'نشر', onPress: () => applyDecision(item.id, 'published') },
    ]);
  };

  const confirmReject = (item: AdminPendingProject) => {
    Alert.alert('رفض المشروع', `هل تريد رفض مشروع "${item.title}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'رفض', style: 'destructive', onPress: () => applyDecision(item.id, 'rejected') },
    ]);
  };

  return (
    <View style={styles.flex}>
      <AppHeader title="مراجعة المشاريع" />

      {loading ? (
        <LoadingState />
      ) : forbidden ? (
        <EmptyState icon="lock-closed-outline" message="غير مصرح لك بالوصول إلى هذه الصفحة" />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" message={error} />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState icon="business-outline" message="لا توجد مشاريع قيد المراجعة حاليًا" />}
          renderItem={({ item }) => {
            const images = (item.project_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
            const photoUrl = images[0] ? supabase.storage.from('project-photos').getPublicUrl(images[0].storage_path).data.publicUrl : null;
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
                    <Text style={styles.category}>{t(PROJECT_TYPE_LABEL_KEY[item.project_type])}</Text>
                    <View style={styles.locationRow}>
                      <Ionicons name="location-outline" size={11} color={theme.mutedText} />
                      <Text style={styles.location} numberOfLines={1}>
                        {[item.district, item.city].filter(Boolean).join('، ')}
                      </Text>
                    </View>
                    {item.min_price_usd != null && (
                      <Text style={styles.price}>
                        {t('projects.startingFrom')} ${groupThousands(item.min_price_usd)}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.ownerRow}>
                  <Ionicons name="person-circle-outline" size={16} color={theme.mutedText} />
                  <Text style={styles.ownerText}>{item.profiles?.full_name ?? 'مطوّر عقاري'}</Text>
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
                  <Text style={styles.photoCount}>{images.length} صور</Text>
                </View>

                <Text style={styles.description} numberOfLines={3}>
                  {item.description}
                </Text>

                <View style={styles.actionsRow}>
                  <Pressable style={[styles.actionButton, styles.publishButton]} onPress={() => confirmPublish(item)} disabled={busy}>
                    {busy ? <ActivityIndicator size="small" color={theme.white} /> : <Text style={styles.publishButtonText}>نشر المشروع</Text>}
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

    actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    actionButton: { flex: 1, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: 'center' },
    publishButton: { backgroundColor: theme.success },
    publishButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.white },
    rejectButton: { backgroundColor: theme.danger },
    rejectButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.white },
  });
}
