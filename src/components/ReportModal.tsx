import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { colors, fonts, radii, spacing } from '@/src/theme';
import type { ReportReason } from '@/src/lib/reports';

const REASONS: ReportReason[] = ['spam', 'fraud', 'inappropriate', 'fake_listing', 'harassment', 'other'];

const REASON_LABEL_KEY: Record<ReportReason, string> = {
  spam: 'report.reasonSpam',
  fraud: 'report.reasonFraud',
  inappropriate: 'report.reasonInappropriate',
  fake_listing: 'report.reasonFakeListing',
  harassment: 'report.reasonHarassment',
  other: 'report.reasonOther',
};

// Shared reason-picker + details sheet reused for reporting a listing, a
// user profile, or a review — the only thing that differs per caller is
// the title and what submitReport is called with.
export function ReportModal({
  visible,
  title,
  onClose,
  onSubmit,
  submitting,
  errorText,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (reason: ReportReason, details: string) => void;
  submitting: boolean;
  errorText: string | null;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');

  // Fresh form every time the sheet opens, regardless of how the last one
  // closed (submitted, canceled, or the parent closing it programmatically)
  // — adjusted during render (React's documented pattern for resetting
  // state on a prop change) rather than in an effect, so there's no
  // extra render before the reset takes effect.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setReason(null);
      setDetails('');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardWrapper}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
                <Ionicons name="close" size={18} color={colors.inkSoft} />
              </Pressable>
            </View>

            {REASONS.map((r) => {
              const active = reason === r;
              return (
                <Pressable key={r} style={styles.reasonRow} onPress={() => setReason(r)}>
                  <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioDot} />}</View>
                  <Text style={styles.reasonText}>{t(REASON_LABEL_KEY[r])}</Text>
                </Pressable>
              );
            })}

            <TextInput
              style={styles.detailsInput}
              value={details}
              onChangeText={setDetails}
              placeholder={t('report.detailsPlaceholder')}
              placeholderTextColor={colors.inkSoft}
              multiline
              textAlignVertical="top"
              textAlign="right"
            />

            {errorText && <Text style={styles.errorText}>{errorText}</Text>}

            <Pressable
              style={[styles.submitButton, (!reason || submitting) && styles.submitButtonDisabled]}
              onPress={() => reason && onSubmit(reason, details.trim())}
              disabled={!reason || submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.goldSoft} />
              ) : (
                <Text style={styles.submitText}>{t('report.submit')}</Text>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(11,43,33,0.4)', justifyContent: 'flex-end' },
  keyboardWrapper: { width: '100%' },
  sheet: {
    backgroundColor: colors.ivory,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ivory2,
    marginBottom: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { fontFamily: fonts.headingBold, fontSize: 16, color: colors.pine },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.ivory2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.ivory2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.pine },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.pine },
  reasonText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink },
  detailsInput: {
    backgroundColor: colors.ivory2,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 72,
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.ink,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorText: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: '#B23B3B', marginBottom: spacing.sm },
  submitButton: {
    backgroundColor: colors.pine,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitText: { fontFamily: fonts.headingBold, fontSize: 13, color: colors.goldSoft },
});
