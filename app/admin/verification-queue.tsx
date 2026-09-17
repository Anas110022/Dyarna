import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import {
  decideAdminVerification,
  fetchAdminDocumentSignedUrl,
  fetchAdminVerificationQueue,
  type AdminVerificationRequest,
} from '@/src/lib/admin';
import { AppHeader } from '@/src/components/AppHeader';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';

const DOC_TYPE_LABEL: Record<string, string> = {
  passport: 'جواز سفر',
  national_id: 'هوية شخصية',
  residence_id: 'وثيقة إقامة',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد الانتظار',
  processing: 'قيد المعالجة',
  requires_review: 'يحتاج مراجعة',
};

const ADVERTISER_TYPE_LABEL: Record<string, string> = {
  owner: 'مالك عقار',
  broker: 'وسيط / مسوق',
  host: 'مضيف',
};

const SECONDARY_DOC_LABEL: Record<string, string> = {
  green_deed: 'عرض الطابو الأخضر',
  office_photo: 'عرض صورة المكتب',
};

export default function AdminVerificationQueueScreen() {
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [requests, setRequests] = useState<AdminVerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    const result = await fetchAdminVerificationQueue();
    if (result.forbidden) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    if (result.error || !result.data) {
      setError(result.error ?? 'unknown_error');
      setLoading(false);
      return;
    }
    setRequests(result.data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const viewDocument = async (request: AdminVerificationRequest, docField: 'primary' | 'secondary' = 'primary') => {
    setBusyId(request.id);
    const result = await fetchAdminDocumentSignedUrl(request.id, docField);
    setBusyId(null);
    if (result.forbidden) {
      Alert.alert('غير مصرح', 'ما عندك صلاحية لعرض هالمستند.');
      return;
    }
    if (result.error || !result.data) {
      Alert.alert('خطأ', 'تعذر فتح المستند، حاول مرة تانية.');
      return;
    }
    Linking.openURL(result.data.signedUrl);
  };

  const decide = async (request: AdminVerificationRequest, decision: 'verified' | 'rejected' | 'requires_review') => {
    if (decision === 'rejected') {
      Alert.prompt(
        'سبب الرفض',
        'اكتب سبب واضح رح يشوفه المستخدم',
        async (reason) => {
          await applyDecision(request.id, decision, reason);
        },
        'plain-text'
      );
      return;
    }
    Alert.alert('تأكيد', decision === 'verified' ? 'توثيق هالحساب؟' : 'تحويل الطلب لمراجعة إضافية؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: () => applyDecision(request.id, decision) },
    ]);
  };

  const applyDecision = async (requestId: string, decision: 'verified' | 'rejected' | 'requires_review', reason?: string) => {
    setBusyId(requestId);
    const result = await decideAdminVerification(requestId, decision, reason);
    setBusyId(null);
    if (result.forbidden) {
      Alert.alert('غير مصرح', 'ما عندك صلاحية تتخذ هالإجراء.');
      return;
    }
    if (result.error) {
      Alert.alert('خطأ', 'صار في خطأ، حاول مرة تانية.');
      return;
    }
    load();
  };

  return (
    <View style={styles.flex}>
      <AppHeader title="مراجعة طلبات التوثيق" />

      {loading ? (
        <LoadingState />
      ) : forbidden ? (
        <EmptyState icon="lock-closed-outline" message="غير مصرح لك بالوصول لهاي الصفحة" />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" message={error} />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState icon="shield-checkmark-outline" message="ما في طلبات توثيق حاليًا" />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.name}>{item.profiles?.full_name ?? 'مستخدم عقارك'}</Text>
              <Text style={styles.meta}>{item.profiles?.email ?? item.profiles?.phone ?? ''}</Text>
              {item.advertiser_type && (
                <Text style={styles.advertiserTypeTag}>{ADVERTISER_TYPE_LABEL[item.advertiser_type] ?? item.advertiser_type}</Text>
              )}
              <Text style={styles.meta}>
                {DOC_TYPE_LABEL[item.document_type ?? ''] ?? '—'} · {STATUS_LABEL[item.status] ?? item.status}
              </Text>
              <Text style={styles.meta}>{item.created_at.slice(0, 10)}</Text>

              {(item.company_name || item.company_description || item.company_address || item.company_license_number) && (
                <View style={styles.companyCard}>
                  {item.company_name && <Text style={styles.companyLine}>الاسم: {item.company_name}</Text>}
                  {item.company_description && <Text style={styles.companyLine}>النشاط: {item.company_description}</Text>}
                  {item.company_address && <Text style={styles.companyLine}>العنوان: {item.company_address}</Text>}
                  {item.company_license_number && <Text style={styles.companyLine}>الترخيص/السجل: {item.company_license_number}</Text>}
                </View>
              )}

              <Pressable style={styles.docButton} onPress={() => viewDocument(item, 'primary')} disabled={busyId === item.id}>
                <Ionicons name="document-attach-outline" size={14} color={theme.headingText} />
                <Text style={styles.docButtonText}>عرض الهوية الشخصية (رابط مؤقت)</Text>
              </Pressable>

              {item.secondary_doc_storage_path && item.secondary_doc_type && (
                <Pressable
                  style={[styles.docButton, styles.secondaryDocButton]}
                  onPress={() => viewDocument(item, 'secondary')}
                  disabled={busyId === item.id}
                >
                  <Ionicons name="document-attach-outline" size={14} color={theme.headingText} />
                  <Text style={styles.docButtonText}>{SECONDARY_DOC_LABEL[item.secondary_doc_type]} (رابط مؤقت)</Text>
                </Pressable>
              )}

              <View style={styles.actionsRow}>
                <Pressable style={[styles.actionButton, styles.approveButton]} onPress={() => decide(item, 'verified')} disabled={busyId === item.id}>
                  <Text style={styles.approveButtonText}>توثيق</Text>
                </Pressable>
                <Pressable style={[styles.actionButton, styles.reviewButton]} onPress={() => decide(item, 'requires_review')} disabled={busyId === item.id}>
                  <Text style={styles.reviewButtonText}>يحتاج مراجعة</Text>
                </Pressable>
                <Pressable style={[styles.actionButton, styles.rejectButton]} onPress={() => decide(item, 'rejected')} disabled={busyId === item.id}>
                  <Text style={styles.rejectButtonText}>رفض</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    listContent: { padding: spacing.lg, flexGrow: 1 },
    card: { backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md, gap: 2 },
    name: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    meta: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    advertiserTypeTag: {
      fontFamily: fonts.headingBold,
      fontSize: 10.5,
      color: theme.headingText,
      backgroundColor: theme.background,
      alignSelf: 'flex-start',
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      marginTop: 2,
    },
    companyCard: { backgroundColor: theme.background, borderRadius: radii.md, padding: spacing.sm, marginTop: spacing.sm, gap: 2 },
    companyLine: { fontFamily: fonts.bodyRegular, fontSize: 10.5, color: theme.bodyText },

    docButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      marginTop: spacing.sm,
      backgroundColor: theme.surfaceAlt,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    secondaryDocButton: { marginTop: spacing.xs },
    docButtonText: { fontFamily: fonts.bodyMedium, fontSize: 10.5, color: theme.headingText },

    actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    actionButton: { flex: 1, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: 'center' },
    approveButton: { backgroundColor: theme.success },
    approveButtonText: { fontFamily: fonts.headingBold, fontSize: 10.5, color: theme.white },
    reviewButton: { backgroundColor: theme.surfaceAlt },
    reviewButtonText: { fontFamily: fonts.headingBold, fontSize: 10.5, color: theme.headingText },
    rejectButton: { backgroundColor: theme.danger },
    rejectButtonText: { fontFamily: fonts.headingBold, fontSize: 10.5, color: theme.white },
  });
}
