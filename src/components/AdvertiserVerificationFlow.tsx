import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useI18n } from '@/src/i18n';
import { colors, fonts, radii, spacing } from '@/src/theme';
import { fetchOwnProfile } from '@/src/lib/listings';
import {
  submitVerificationRequest,
  uploadVerificationDoc,
  type AdvertiserType,
  type VerificationDocumentType,
} from '@/src/lib/account';
import { DocumentPickerField, type PickedDoc } from '@/src/components/DocumentPickerField';

const ADVERTISER_TYPES: { value: AdvertiserType; labelKey: string }[] = [
  { value: 'owner', labelKey: 'advertiserVerification.typeOwner' },
  { value: 'broker', labelKey: 'advertiserVerification.typeBroker' },
  { value: 'host', labelKey: 'advertiserVerification.typeHost' },
];

const DOCUMENT_TYPES: { value: VerificationDocumentType; labelKey: string }[] = [
  { value: 'passport', labelKey: 'verifyAccount.docTypePassport' },
  { value: 'national_id', labelKey: 'verifyAccount.docTypeNationalId' },
  { value: 'residence_id', labelKey: 'verifyAccount.docTypeResidenceId' },
];

// "هل أنت؟" — the real, absolute first screen of إضافة إعلان, every single
// time (see app/post-listing.tsx), never gated by whether the user has
// verified before. Only the DOCUMENTS step after this one is skipped once
// a real verification_requests row already exists — the type choice
// itself always happens, and is stored in the wizard's own form state so
// it persists through the rest of the posting flow.
export function AdvertiserTypeStep({
  value,
  onNext,
}: {
  value: AdvertiserType | null;
  onNext: (type: AdvertiserType) => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<AdvertiserType | null>(value);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('advertiserVerification.whoAreYouTitle')}</Text>
      <View style={styles.typeList}>
        {ADVERTISER_TYPES.map((option) => {
          const active = selected === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.typeCard, active && styles.typeCardActive]}
              onPress={() => setSelected(option.value)}
            >
              <Text style={[styles.typeCardText, active && styles.typeCardTextActive]}>{t(option.labelKey)}</Text>
              {active && <Ionicons name="checkmark-circle" size={20} color={colors.gold} />}
            </Pressable>
          );
        })}
      </View>
      <Pressable
        style={[styles.primaryButton, !selected && styles.primaryButtonDisabled]}
        onPress={() => selected && onNext(selected)}
        disabled={!selected}
      >
        <Text style={styles.primaryButtonText}>{t('advertiserVerification.next')}</Text>
      </Pressable>
    </View>
  );
}

// The real "المتطلبات" step — only ever shown once, the first time a user
// has no verification_requests row at all yet (see app/post-listing.tsx).
// `advertiserType` is already decided by AdvertiserTypeStep above; this
// component never lets it be changed, only submits real documents/details
// for it. Reuses the same verification_requests row/lifecycle and the
// same private verification-docs storage bucket as /verify-account — not
// a separate system (see 20260910000000_advertiser_verification.sql).
export function AdvertiserRequirementsStep({
  advertiserType,
  userId,
  onSubmitted,
  onBack,
}: {
  advertiserType: AdvertiserType;
  userId: string;
  onSubmitted: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();

  const [profile, setProfile] = useState<{ fullName: string | null; phone: string | null; email: string | null } | null>(null);
  const [documentType, setDocumentType] = useState<VerificationDocumentType>('national_id');
  const [idDoc, setIdDoc] = useState<PickedDoc | null>(null);
  const [secondaryDoc, setSecondaryDoc] = useState<PickedDoc | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyLicenseNumber, setCompanyLicenseNumber] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // The full-screen viewer is a real pushed route (app/document-viewer.tsx),
  // not an inline <Modal> — a WebView inside RN's own <Modal> was proven
  // (via instrumented touch logging) to swallow every touch in the screen
  // before React Native's own touch system ever saw it, including taps on
  // the close button. A real navigator screen doesn't have that problem.
  // Passing the doc as route params also means at most one viewer screen
  // ever exists at a time, same guarantee the old shared-modal-instance
  // design gave for the owner's two document slots (ID + green deed).
  const openViewer = (doc: PickedDoc | null) => {
    if (!doc) return;
    router.push({
      pathname: '/document-viewer',
      params: {
        uri: doc.uri,
        isPdf: doc.isPdf ? '1' : '0',
        ...(doc.storagePath ? { pdfStoragePath: doc.storagePath } : {}),
        ...(doc.fileName ? { fileName: doc.fileName } : {}),
      },
    });
  };

  useEffect(() => {
    fetchOwnProfile(userId).then((p) => setProfile({ fullName: p.fullName, phone: p.phone, email: p.email }));
  }, [userId]);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!idDoc) {
      setError(t('advertiserVerification.errorMissingDocs'));
      return;
    }
    if (advertiserType === 'owner' && !secondaryDoc) {
      setError(t('advertiserVerification.errorMissingDocs'));
      return;
    }
    if (advertiserType === 'broker' && (!companyName.trim() || !companyAddress.trim())) {
      setError(t('advertiserVerification.errorMissingCompanyInfo'));
      return;
    }

    setSubmitting(true);
    setError(null);

    // A picked PDF is already uploaded to the real storage bucket the
    // moment it was selected (see DocumentPickerField) — its storagePath
    // is the genuine file, so reuse it instead of uploading it twice.
    // Images still upload here, at submission time, same as before.
    let idPath: string | null = idDoc.isPdf ? idDoc.storagePath : null;
    if (!idPath) {
      const { path, error: idUploadError } = await uploadVerificationDoc(userId, idDoc.uri, idDoc.fileName, idDoc.mimeType, 'id-doc');
      if (idUploadError || !path) {
        setSubmitting(false);
        setError(t('verifyAccount.uploadError'));
        return;
      }
      idPath = path;
    }

    // Only owner has a secondary document at all now (الطابو الأخضر) —
    // broker no longer requires an office photo.
    let secondaryPath: string | null = null;
    if (advertiserType === 'owner' && secondaryDoc) {
      secondaryPath = secondaryDoc.isPdf ? secondaryDoc.storagePath : null;
      if (!secondaryPath) {
        const { path, error: secondaryUploadError } = await uploadVerificationDoc(
          userId,
          secondaryDoc.uri,
          secondaryDoc.fileName,
          secondaryDoc.mimeType,
          'green-deed'
        );
        if (secondaryUploadError || !path) {
          setSubmitting(false);
          setError(t('verifyAccount.uploadError'));
          return;
        }
        secondaryPath = path;
      }
    }

    const { error: submitError } = await submitVerificationRequest(userId, idPath, documentType, {
      advertiserType,
      secondaryDocStoragePath: secondaryPath,
      secondaryDocType: advertiserType === 'owner' ? 'green_deed' : null,
      companyName: advertiserType === 'broker' ? companyName.trim() : null,
      companyAddress: advertiserType === 'broker' ? companyAddress.trim() : null,
      companyLicenseNumber: advertiserType === 'broker' && companyLicenseNumber.trim() ? companyLicenseNumber.trim() : null,
    });
    setSubmitting(false);

    // A real active request already exists (e.g. from a previous attempt) —
    // that's still a real, pending submission, so show the same real
    // "قيد المراجعة" confirmation rather than an error.
    if (submitError && submitError !== 'duplicate_active_request') {
      setError(t('verifyAccount.submitError'));
      return;
    }
    setSubmitted(true);
  };

  // Real confirmation — status is genuinely "قيد المراجعة" (pending) the
  // moment this shows, never "موثّق". Continuing takes the user into the
  // normal listing wizard; publish itself stays blocked server-side until
  // an admin actually approves this request (see
  // 20260911000000_advertiser_verification_gate.sql).
  if (submitted) {
    return (
      <View style={styles.confirmationContainer}>
        <View style={styles.iconCircle}>
          <Ionicons name="time-outline" size={30} color={colors.pine} />
        </View>
        <Text style={[styles.title, styles.confirmationTitle]}>{t('advertiserVerification.submittedTitle')}</Text>
        <Text style={styles.confirmationBody}>{t('advertiserVerification.submittedBody')}</Text>
        <Pressable style={styles.primaryButton} onPress={onSubmitted}>
          <Text style={styles.primaryButtonText}>{t('advertiserVerification.continue')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Pressable style={styles.backLink} onPress={onBack}>
        <Ionicons name="chevron-forward" size={16} color={colors.pine} />
        <Text style={styles.backLinkText}>{t('advertiserVerification.back')}</Text>
      </Pressable>

      <Text style={styles.title}>{t('advertiserVerification.requirementsTitle')}</Text>
      <Text style={styles.intro}>{t('advertiserVerification.requirementsIntro')}</Text>

      {/* Real identity details from the authenticated account — shown for
          all three types (owner, broker, host), not just broker. */}
      <Text style={styles.sectionLabel}>{t('advertiserVerification.personalDataLabel')}</Text>
      <View style={styles.infoCard}>
        <Text style={styles.infoText}>{t('advertiserVerification.personalDataNotice')}</Text>
        <Text style={styles.infoValue}>{profile?.fullName ?? '—'}</Text>
        <Text style={styles.infoValue}>{profile?.phone ?? '—'}</Text>
        {profile?.email && <Text style={styles.infoValue}>{profile.email}</Text>}
      </View>

      {advertiserType === 'broker' && (
        <>
          <Text style={styles.sectionLabel}>{t('advertiserVerification.companyNameLabel')}</Text>
          <TextInput
            style={styles.input}
            value={companyName}
            onChangeText={setCompanyName}
            placeholder={t('advertiserVerification.companyNamePlaceholder')}
            placeholderTextColor={colors.inkSoft}
          />

          <Text style={styles.sectionLabel}>{t('advertiserVerification.companyAddressLabel')}</Text>
          <TextInput
            style={styles.input}
            value={companyAddress}
            onChangeText={setCompanyAddress}
            placeholder={t('advertiserVerification.companyAddressPlaceholder')}
            placeholderTextColor={colors.inkSoft}
          />

          <Text style={styles.sectionLabel}>{t('advertiserVerification.companyLicenseLabel')}</Text>
          <TextInput
            style={styles.input}
            value={companyLicenseNumber}
            onChangeText={setCompanyLicenseNumber}
            placeholder={t('advertiserVerification.companyLicensePlaceholder')}
            placeholderTextColor={colors.inkSoft}
          />
        </>
      )}

      <Text style={styles.sectionLabel}>{t('advertiserVerification.personalIdLabel')}</Text>
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
        label={t('advertiserVerification.personalIdLabel')}
        value={idDoc}
        onChange={setIdDoc}
        onView={() => openViewer(idDoc)}
        userId={userId}
        docKind="id-doc"
      />

      {advertiserType === 'owner' && (
        <DocumentPickerField
          label={t('advertiserVerification.greenDeedLabel')}
          value={secondaryDoc}
          onChange={setSecondaryDoc}
          onView={() => openViewer(secondaryDoc)}
          userId={userId}
          docKind="green-deed"
        />
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={colors.goldSoft} /> : <Text style={styles.primaryButtonText}>{t('advertiserVerification.submit')}</Text>}
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

  typeList: { gap: spacing.sm, marginBottom: spacing.xl },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.ivory2,
  },
  typeCardActive: { borderColor: colors.pine },
  typeCardText: { fontFamily: fonts.headingBold, fontSize: 14, color: colors.ink },
  typeCardTextActive: { color: colors.pine },

  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.md, alignSelf: 'flex-start' },
  backLinkText: { fontFamily: fonts.headingBold, fontSize: 12, color: colors.pine },

  sectionLabel: { fontFamily: fonts.headingBold, fontSize: 12, color: colors.ink, marginBottom: spacing.sm, marginTop: spacing.md },
  infoCard: { backgroundColor: colors.white, borderRadius: radii.md, padding: spacing.md, gap: 4, marginBottom: spacing.sm },
  infoText: { fontFamily: fonts.bodyRegular, fontSize: 11, color: colors.inkSoft },
  infoValue: { fontFamily: fonts.headingBold, fontSize: 13, color: colors.ink },

  input: {
    backgroundColor: colors.ivory2,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.ink,
  },
  inputSpaced: { marginTop: spacing.sm },

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
