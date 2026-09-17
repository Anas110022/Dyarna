import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { decideAdminReport, fetchAdminReportsQueue, type AdminReport } from '@/src/lib/admin';
import { AppHeader } from '@/src/components/AppHeader';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';

const REASON_LABEL: Record<string, string> = {
  spam: 'محتوى مزعج أو ترويجي',
  fraud: 'احتيال',
  inappropriate: 'محتوى غير لائق',
  fake_listing: 'إعلان وهمي',
  harassment: 'مضايقة',
  other: 'سبب آخر',
};

const TARGET_TYPE_LABEL: Record<string, string> = {
  listing: 'إعلان',
  profile: 'مستخدم',
  review: 'تقييم',
};

const STATUS_LABEL: Record<string, string> = {
  open: 'مفتوح',
  reviewed: 'تمت المراجعة',
  dismissed: 'مرفوض',
  actioned: 'تم اتخاذ إجراء',
};

function TargetSummary({ report, theme }: { report: AdminReport; theme: ThemeColors }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (!report.target) {
    return <Text style={styles.meta}>المحتوى المُبلَّغ عنه لم يعد موجودًا</Text>;
  }
  if (report.target_type === 'listing' && 'title' in report.target) {
    return (
      <Pressable onPress={() => router.push(`/listing/${report.target_id}`)}>
        <Text style={styles.targetLink} numberOfLines={1}>
          {report.target.title} ({report.target.status})
        </Text>
      </Pressable>
    );
  }
  if (report.target_type === 'profile' && 'full_name' in report.target) {
    return (
      <Pressable onPress={() => router.push(`/profile/${report.target_id}`)}>
        <Text style={styles.targetLink}>{report.target.full_name ?? 'مستخدم عقارك'}</Text>
      </Pressable>
    );
  }
  if (report.target_type === 'review' && 'body' in report.target) {
    return (
      <Text style={styles.meta} numberOfLines={3}>
        {'⭐'.repeat(report.target.rating)} — {report.target.body}
      </Text>
    );
  }
  return null;
}

export default function AdminReportsQueueScreen() {
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    const result = await fetchAdminReportsQueue();
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
    setReports(result.data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const decide = (report: AdminReport, status: 'reviewed' | 'dismissed' | 'actioned') => {
    Alert.alert(
      'تأكيد',
      status === 'dismissed' ? 'رفض هذا البلاغ؟' : status === 'actioned' ? 'تمييز هذا البلاغ كمُعالَج؟' : 'تمييز هذا البلاغ كمُراجَع؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'تأكيد', onPress: () => applyDecision(report.id, status) },
      ]
    );
  };

  const applyDecision = async (reportId: string, status: 'reviewed' | 'dismissed' | 'actioned') => {
    setBusyId(reportId);
    const result = await decideAdminReport(reportId, status);
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

  const openReports = reports.filter((r) => r.status === 'open');

  return (
    <View style={styles.flex}>
      <AppHeader title="مراجعة البلاغات" />

      {loading ? (
        <LoadingState />
      ) : forbidden ? (
        <EmptyState icon="lock-closed-outline" message="غير مصرح لك بالوصول لهاي الصفحة" />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" message={error} />
      ) : (
        <FlatList
          data={openReports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState icon="flag-outline" message="ما في بلاغات مفتوحة حاليًا" />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.targetType}>{TARGET_TYPE_LABEL[item.target_type]}</Text>
                <Text style={styles.statusTag}>{STATUS_LABEL[item.status]}</Text>
              </View>

              <TargetSummary report={item} theme={theme} />

              <Text style={styles.reasonText}>{REASON_LABEL[item.reason] ?? item.reason}</Text>
              {item.details && <Text style={styles.meta}>{item.details}</Text>}

              <Text style={styles.meta}>
                المُبلِّغ: {item.reporter?.full_name ?? 'مستخدم عقارك'} · {item.created_at.slice(0, 10)}
              </Text>

              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.actionButton, styles.reviewButton]}
                  onPress={() => decide(item, 'reviewed')}
                  disabled={busyId === item.id}
                >
                  <Text style={styles.reviewButtonText}>تمت المراجعة</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.actionedButton]}
                  onPress={() => decide(item, 'actioned')}
                  disabled={busyId === item.id}
                >
                  <Text style={styles.actionedButtonText}>تم اتخاذ إجراء</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.dismissButton]}
                  onPress={() => decide(item, 'dismissed')}
                  disabled={busyId === item.id}
                >
                  <Text style={styles.dismissButtonText}>رفض</Text>
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
    card: { backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md, gap: 4 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    targetType: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText },
    statusTag: {
      fontFamily: fonts.bodyMedium,
      fontSize: 10,
      color: theme.mutedText,
      backgroundColor: theme.surfaceAlt,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    targetLink: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.headingText, textDecorationLine: 'underline' },
    reasonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.bodyText },
    meta: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },

    actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    actionButton: { flex: 1, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: 'center' },
    reviewButton: { backgroundColor: theme.surfaceAlt },
    reviewButtonText: { fontFamily: fonts.headingBold, fontSize: 10.5, color: theme.headingText },
    actionedButton: { backgroundColor: theme.success },
    actionedButtonText: { fontFamily: fonts.headingBold, fontSize: 10.5, color: theme.white },
    dismissButton: { backgroundColor: theme.danger },
    dismissButtonText: { fontFamily: fonts.headingBold, fontSize: 10.5, color: theme.white },
  });
}
