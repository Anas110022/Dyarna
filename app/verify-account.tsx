import { useCallback, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { fetchOwnProfile } from '@/src/lib/listings';
import {
  fetchLatestVerificationRequest,
  submitVerificationRequest,
  uploadVerificationDoc,
  type VerificationDocumentType,
  type VerificationRequestStatus,
} from '@/src/lib/account';
import { ensurePhotoLibraryPermission, openIOSSettings } from '@/src/lib/mediaPermissions';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { LoadingState } from '@/src/components/LoadingState';
import { PrimaryButton } from '@/src/components/PrimaryButton';

type PickedDoc = { uri: string; fileName: string | null; mimeType: string | null; isPdf: boolean };

// Real, non-AI technical validation only — file size / format / minimum
// resolution. Whether the CONTENT is actually a valid passport/ID is a
// judgment call that genuinely needs either a human reviewer or a real
// third-party identity-verification provider; this app deliberately does
// not fake that with a hardcoded "looks fine" or a pretend classifier.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MIN_IMAGE_DIMENSION_PX = 600;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'];

const DOCUMENT_TYPES: { value: VerificationDocumentType; labelKey: string }[] = [
  { value: 'passport', labelKey: 'verifyAccount.docTypePassport' },
  { value: 'national_id', labelKey: 'verifyAccount.docTypeNationalId' },
  { value: 'residence_id', labelKey: 'verifyAccount.docTypeResidenceId' },
];

export default function VerifyAccountScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [userId, setUserId] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [requestStatus, setRequestStatus] = useState<VerificationRequestStatus | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<VerificationDocumentType>('national_id');
  const [doc, setDoc] = useState<PickedDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        setLoading(true);
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
        if (cancelled) return;
        setUserId(user.id);

        const [profile, latestRequest] = await Promise.all([fetchOwnProfile(user.id), fetchLatestVerificationRequest(user.id)]);
        if (cancelled) return;
        setIsVerified(profile.isVerified);
        setRequestStatus(latestRequest.status);
        setFailureReason(latestRequest.failureReason);
        setLoading(false);
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const pickFromPhotos = async () => {
    setError(null);
    try {
      const permission = await ensurePhotoLibraryPermission();
      if (!permission.granted) {
        if (!permission.canAskAgain) {
          Alert.alert(t('editProfile.photoPermissionDenied'), t('editProfile.photoPermissionDeniedSettingsBody'), [
            { text: t('account.cancel'), style: 'cancel' },
            { text: t('editProfile.openSettings'), onPress: openIOSSettings },
          ]);
        } else {
          setError(t('editProfile.photoPermissionDenied'));
        }
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];

      if (asset.width && asset.height && (asset.width < MIN_IMAGE_DIMENSION_PX || asset.height < MIN_IMAGE_DIMENSION_PX)) {
        setError(t('verifyAccount.errorLowQuality'));
        return;
      }
      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE_BYTES) {
        setError(t('verifyAccount.errorTooLarge'));
        return;
      }
      if (asset.mimeType && !ALLOWED_MIME_TYPES.includes(asset.mimeType.toLowerCase())) {
        setError(t('verifyAccount.errorUnsupportedFormat'));
        return;
      }

      setDoc({ uri: asset.uri, fileName: asset.fileName ?? null, mimeType: asset.mimeType ?? null, isPdf: false });
    } catch {
      setError(t('editProfile.photoPickError'));
    }
  };

  const pickFromFiles = async () => {
    setError(null);
    try {
      // No permission prompt needed on iOS — UIDocumentPickerViewController
      // is sandboxed file access, not a privacy-gated resource.
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];

      if (asset.size && asset.size > MAX_FILE_SIZE_BYTES) {
        setError(t('verifyAccount.errorTooLarge'));
        return;
      }
      if (asset.mimeType && !ALLOWED_MIME_TYPES.includes(asset.mimeType.toLowerCase())) {
        setError(t('verifyAccount.errorUnsupportedFormat'));
        return;
      }

      setDoc({ uri: asset.uri, fileName: asset.name, mimeType: asset.mimeType ?? null, isPdf: asset.mimeType === 'application/pdf' });
    } catch {
      setError(t('verifyAccount.filePickError'));
    }
  };

  const pickDoc = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t('verifyAccount.chooseFromPhotos'), t('verifyAccount.chooseFromFiles'), t('account.cancel')],
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) pickFromPhotos();
          if (index === 1) pickFromFiles();
        }
      );
    } else {
      Alert.alert(t('verifyAccount.attachDoc'), undefined, [
        { text: t('verifyAccount.chooseFromPhotos'), onPress: pickFromPhotos },
        { text: t('verifyAccount.chooseFromFiles'), onPress: pickFromFiles },
        { text: t('account.cancel'), style: 'cancel' },
      ]);
    }
  };

  const handleSubmit = async () => {
    if (!userId || !doc) return;
    setSubmitting(true);
    setError(null);
    const { path, error: uploadError } = await uploadVerificationDoc(userId, doc.uri, doc.fileName, doc.mimeType);
    if (uploadError || !path) {
      setError(t('verifyAccount.uploadError'));
      setSubmitting(false);
      return;
    }
    const { error: submitError } = await submitVerificationRequest(userId, path, documentType);
    setSubmitting(false);
    if (submitError === 'duplicate_active_request') {
      setError(t('verifyAccount.errorDuplicateRequest'));
      setRequestStatus('pending');
      return;
    }
    if (submitError) {
      setError(t('verifyAccount.submitError'));
      return;
    }
    setRequestStatus('pending');
    setFailureReason(null);
    setDoc(null);
  };

  // failureReason is real, human-written admin feedback (not a raw
  // technical/provider error), so it's safe and more useful to show
  // directly when the admin left one — fall back to a generic message
  // otherwise.
  const rejectionMessage = failureReason || t('verifyAccount.rejectedNoticeGeneric');

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  return (
    <View style={styles.flex}>
      <AppHeader title={t('verifyAccount.title')} />

      {loading ? (
        <LoadingState />
      ) : (
        <View style={styles.content}>
          {isVerified ? (
            <View style={styles.statusCard}>
              <Ionicons name="shield-checkmark" size={36} color={theme.accentGold} />
              <Text style={styles.statusTitle}>{t('verifyAccount.verifiedTitle')}</Text>
              <Text style={styles.statusBody}>{t('verifyAccount.verifiedBody')}</Text>
            </View>
          ) : requestStatus === 'pending' || requestStatus === 'processing' ? (
            <View style={styles.statusCard}>
              <Ionicons name="time-outline" size={36} color={theme.headingText} />
              <Text style={styles.statusTitle}>{t('verifyAccount.pendingTitle')}</Text>
              <Text style={styles.statusBody}>{t('verifyAccount.pendingBody')}</Text>
            </View>
          ) : requestStatus === 'requires_review' ? (
            <View style={styles.statusCard}>
              <Ionicons name="alert-circle-outline" size={36} color={theme.headingText} />
              <Text style={styles.statusTitle}>{t('verifyAccount.requiresReviewTitle')}</Text>
              <Text style={styles.statusBody}>{t('verifyAccount.requiresReviewBody')}</Text>
            </View>
          ) : (
            <>
              {(requestStatus === 'rejected' || requestStatus === 'failed') && (
                <View style={styles.rejectedBanner}>
                  <Text style={styles.rejectedText}>{rejectionMessage}</Text>
                </View>
              )}
              <Text style={styles.instructions}>{t('verifyAccount.instructions')}</Text>

              <Text style={styles.fieldLabel}>{t('verifyAccount.documentTypeLabel')}</Text>
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

              <Pressable style={styles.docPicker} onPress={pickDoc}>
                {doc && !doc.isPdf ? (
                  <Image source={{ uri: doc.uri }} style={styles.docPreview} />
                ) : doc && doc.isPdf ? (
                  <View style={styles.docPlaceholder}>
                    <Ionicons name="document-text-outline" size={28} color={theme.headingText} />
                    <Text style={styles.docPlaceholderText} numberOfLines={1}>
                      {doc.fileName ?? 'PDF'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.docPlaceholder}>
                    <Ionicons name="document-attach-outline" size={28} color={theme.headingText} />
                    <Text style={styles.docPlaceholderText}>{t('verifyAccount.attachDoc')}</Text>
                  </View>
                )}
              </Pressable>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <PrimaryButton
                label={t('verifyAccount.submit')}
                onPress={handleSubmit}
                loading={submitting}
                disabled={!doc}
                style={styles.submitButton}
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    content: { padding: spacing.lg, flex: 1 },

    statusCard: { alignItems: 'center', gap: spacing.sm, backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.xxl, marginTop: spacing.xl },
    statusTitle: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.bodySmall, color: theme.headingText, textAlign: 'center' },
    statusBody: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, textAlign: 'center', lineHeight: 19 },

    rejectedBanner: { backgroundColor: `${theme.danger}18`, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md },
    rejectedText: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: theme.danger },

    instructions: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.bodyText, lineHeight: 20, marginBottom: spacing.lg },

    fieldLabel: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.bodyText, marginBottom: spacing.sm },
    docTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    docTypeChip: { backgroundColor: theme.surface, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    docTypeChipActive: { backgroundColor: theme.brandFill },
    docTypeChipText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.mutedText },
    docTypeChipTextActive: { fontFamily: fonts.headingBold, color: theme.onBrandFill },

    docPicker: { height: 180, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: theme.surface },
    docPreview: { width: '100%', height: '100%' },
    docPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
    docPlaceholderText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.headingText },

    errorText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.danger, marginTop: spacing.md },

    submitButton: { marginTop: spacing.xl },
  });
}
