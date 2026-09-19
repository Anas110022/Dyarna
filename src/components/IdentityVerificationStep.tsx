import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useI18n } from '@/src/i18n';
import { colors, fonts, radii, spacing } from '@/src/theme';
import { submitVerificationRequest, uploadVerificationDoc, type VerificationDocumentType } from '@/src/lib/account';
import { DocumentPickerField, type PickedDoc } from '@/src/components/DocumentPickerField';

const DOCUMENT_TYPES: { value: VerificationDocumentType; labelKey: string }[] = [
  { value: 'passport', labelKey: 'verifyAccount.docTypePassport' },
  { value: 'national_id', labelKey: 'verifyAccount.docTypeNationalId' },
  { value: 'residence_id', labelKey: 'verifyAccount.docTypeResidenceId' },
];

// The one universal "attach your ID to continue" step shown the first time
// an unverified user tries to post a listing (real estate or booking) —
// see app/post-listing.tsx / app/post-booking-listing.tsx. Replaces the
// old two-step "هل أنت؟" (owner/broker/host) + type-specific requirements
// flow (src/components/AdvertiserVerificationFlow.tsx, removed) now that
// there's only one kind of verification.
//
// Submits through the exact same verification_requests row and admin
// review queue as /verify-account (advertiser_type stays null — nothing
// client-side sets it anymore), so an admin approving it flips the same
// real profiles.is_verified flag that publish_listing_if_eligible /
// publish_booking_listing_if_eligible already gate on. No backend change
// needed: both functions only ever checked is_verified, never advertiser
// type.
export function IdentityVerificationStep({ userId, onSubmitted }: { userId: string; onSubmitted: () => void }) {
  const { t } = useI18n();
  const router = useRouter();

  const [documentType, setDocumentType] = useState<VerificationDocumentType>('national_id');
  const [doc, setDoc] = useState<PickedDoc | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Same real pushed viewer route every other verification doc uses (see
  // AdvertiserVerificationFlow.tsx's now-removed openViewer for why this
  // is a real navigator screen, not an inline <Modal>).
  const openViewer = (value: PickedDoc | null) => {
    if (!value) return;
    router.push({
      pathname: '/document-viewer',
      params: {
        uri: value.uri,
        isPdf: value.isPdf ? '1' : '0',
        ...(value.storagePath ? { pdfStoragePath: value.storagePath } : {}),
        ...(value.fileName ? { fileName: value.fileName } : {}),
      },
    });
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!doc) {
      setError(t('identityVerification.errorMissingDoc'));
      return;
    }

    setSubmitting(true);
    setError(null);

    // A picked PDF is already uploaded the moment it was selected (see
    // DocumentPickerField) — reuse its storagePath instead of uploading it
    // twice. Images still upload here, at submission time.
    let path: string | null = doc.isPdf ? doc.storagePath : null;
    if (!path) {
      const { path: uploadedPath, error: uploadError } = await uploadVerificationDoc(userId, doc.uri, doc.fileName, doc.mimeType, 'id-doc');
      if (uploadError || !uploadedPath) {
        setSubmitting(false);
        setError(t('verifyAccount.uploadError'));
        return;
      }
      path = uploadedPath;
    }

    // No advertiser param — a real active request already existing (e.g.
    // from a previous attempt, or one submitted through /verify-account
    // directly) is still a real pending submission, so 'duplicate_active_
    // request' shows the same real "قيد المراجعة" confirmation rather than
    // an error.
    const { error: submitError } = await submitVerificationRequest(userId, path, documentType);
    setSubmitting(false);

    if (submitError && submitError !== 'duplicate_active_request') {
      setError(t('verifyAccount.submitError'));
      return;
    }
    setSubmitted(true);
  };

  // Real confirmation — status is genuinely "قيد المراجعة" (pending) the
  // moment this shows, never "موثّق". Continuing takes the user into the
  // normal listing wizard; publish itself stays blocked server-side until
  // an admin actually approves this request.
  if (submitted) {
    return (
      <View style={styles.confirmationContainer}>
        <View style={styles.iconCircle}>
          <Ionicons name="time-outline" size={30} color={colors.pine} />
        </View>
        <Text style={[styles.title, styles.confirmationTitle]}>{t('verifyAccount.pendingTitle')}</Text>
        <Text style={styles.confirmationBody}>{t('verifyAccount.pendingBody')}</Text>
        <Pressable style={styles.primaryButton} onPress={onSubmitted}>
          <Text style={styles.primaryButtonText}>{t('identityVerification.continue')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>{t('verifyAccount.instructions')}</Text>

      <Text style={styles.sectionLabel}>{t('verifyAccount.documentTypeLabel')}</Text>
      <View style={styles.docTypeRow}>
        {DOCUMENT_TYPES.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.docTypeChip, documentType === option.value && styles.docTypeChipActive]}
            onPress={() => setDocumentType(option.value)}
          >
            <Text style={[styles.docTypeChipText, documentType === option.value && styles.docTypeChipTextActive]}>
              {t(option.labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>

      <DocumentPickerField
        label={t('verifyAccount.documentTypeLabel')}
        value={doc}
        onChange={setDoc}
        onView={() => openViewer(doc)}
        userId={userId}
        docKind="id-doc"
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={colors.goldSoft} /> : <Text style={styles.primaryButtonText}>{t('verifyAccount.submit')}</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, flexGrow: 1 },
  title: { fontFamily: fonts.headingExtraBold, fontSize: 18, color: colors.pine, marginBottom: spacing.lg },
  intro: { fontFamily: fonts.bodyRegular, fontSize: 12.5, color: colors.inkSoft, lineHeight: 19, marginBottom: spacing.lg },

  confirmationContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  confirmationTitle: { textAlign: 'center' },
  confirmationBody: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ivory2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },

  sectionLabel: { fontFamily: fonts.headingBold, fontSize: 12, color: colors.ink, marginBottom: spacing.sm, marginTop: spacing.md },

  docTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  docTypeChip: { backgroundColor: colors.white, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  docTypeChipActive: { backgroundColor: colors.pine },
  docTypeChipText: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.inkSoft },
  docTypeChipTextActive: { fontFamily: fonts.headingBold, color: colors.goldSoft },

  errorText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: '#B5482C', marginBottom: spacing.md },

  primaryButton: { backgroundColor: colors.pine, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { fontFamily: fonts.headingBold, fontSize: 14, color: colors.goldSoft },
});
