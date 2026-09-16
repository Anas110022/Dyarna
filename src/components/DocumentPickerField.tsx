import { useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Image, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { colors, fonts, radii, spacing } from '@/src/theme';
import { ensurePhotoLibraryPermission, openIOSSettings } from '@/src/lib/mediaPermissions';
import { uploadVerificationDoc } from '@/src/lib/account';

// Real, non-AI technical validation only — file size / format / minimum
// resolution, the exact same rule set already used by /verify-account.
// Whether the CONTENT is genuinely a valid ID/deed/office photo is a
// judgment call for a human reviewer, never faked here.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MIN_IMAGE_DIMENSION_PX = 600;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'];

// Full quality — this is an identity/ownership document, not a casual
// photo; the file-size cap above (not compression) is what keeps uploads
// reasonable, so nothing about the real document is degraded first.
const PICK_QUALITY = 1;

// `storagePath` is only ever set for a PDF, uploaded to the real private
// verification-docs bucket the moment it's picked (not deferred to final
// submission) — a bare local file:// PDF can't be reliably opened on iOS
// (Linking.openURL has no handler for it, which is exactly what left the
// previous viewer stuck on "جاري فتح الملف" forever); a real signed
// https:// URL to the already-uploaded file is what the full-screen
// viewer actually opens. Images keep previewing straight from the local
// uri (already reliable, no network round-trip needed) and still upload
// once at final submission, unchanged.
export type PickedDoc = { uri: string; fileName: string | null; mimeType: string | null; isPdf: boolean; storagePath: string | null };

// One real document/photo picker field, reused across the advertiser
// verification flow's several upload slots (ID, green deed) so the same
// permission/validation/action-sheet logic isn't triplicated. `imageOnly`
// drops the Files/PDF option for slots that are always a real photo.
//
// This component deliberately owns no viewer navigation state of its
// own — `onView` is the caller's job (it pushes app/document-viewer.tsx
// with the picked doc as route params) — see AdvertiserVerificationFlow.tsx.
//
// The preview always uses resizeMode="contain" inside a generously tall,
// letterboxed box — the entire real document is always visible, nothing
// is ever cropped regardless of its real aspect ratio (portrait or
// landscape).
export function DocumentPickerField({
  label,
  value,
  onChange,
  onView,
  imageOnly = false,
  userId,
  docKind,
}: {
  label: string;
  value: PickedDoc | null;
  onChange: (doc: PickedDoc | null) => void;
  onView: () => void;
  imageOnly?: boolean;
  // Needed to upload a picked PDF immediately (see PickedDoc.storagePath).
  userId: string;
  docKind: string;
}) {
  const { t } = useI18n();
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const pickFromPhotos = async () => {
    const permission = await ensurePhotoLibraryPermission();
    if (!permission.granted) {
      if (!permission.canAskAgain) {
        Alert.alert(t('editProfile.photoPermissionDenied'), t('editProfile.photoPermissionDeniedSettingsBody'), [
          { text: t('account.cancel'), style: 'cancel' },
          { text: t('editProfile.openSettings'), onPress: openIOSSettings },
        ]);
      } else {
        Alert.alert(t('editProfile.photoPermissionDenied'));
      }
      return;
    }
    // No `allowsEditing` here — this app's own established fix (see
    // src/lib/mediaPermissions.ts usage elsewhere) for the picker silently
    // failing on real devices, and it would otherwise crop the document.
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: PICK_QUALITY });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    if (asset.width && asset.height && (asset.width < MIN_IMAGE_DIMENSION_PX || asset.height < MIN_IMAGE_DIMENSION_PX)) {
      Alert.alert(t('verifyAccount.errorLowQuality'));
      return;
    }
    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE_BYTES) {
      Alert.alert(t('verifyAccount.errorTooLarge'));
      return;
    }
    if (asset.mimeType && !ALLOWED_MIME_TYPES.includes(asset.mimeType.toLowerCase())) {
      Alert.alert(t('verifyAccount.errorUnsupportedFormat'));
      return;
    }

    onChange({ uri: asset.uri, fileName: asset.fileName ?? null, mimeType: asset.mimeType ?? null, isPdf: false, storagePath: null });
  };

  const pickFromFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];

      if (asset.size && asset.size > MAX_FILE_SIZE_BYTES) {
        Alert.alert(t('verifyAccount.errorTooLarge'));
        return;
      }
      if (asset.mimeType && !ALLOWED_MIME_TYPES.includes(asset.mimeType.toLowerCase())) {
        Alert.alert(t('verifyAccount.errorUnsupportedFormat'));
        return;
      }

      const isPdf = asset.mimeType === 'application/pdf';
      if (!isPdf) {
        onChange({ uri: asset.uri, fileName: asset.name, mimeType: asset.mimeType ?? null, isPdf: false, storagePath: null });
        return;
      }

      // A PDF can't be previewed reliably from its local file:// path on
      // iOS — upload the real file to the private bucket right away so
      // the shared viewer can open it via a genuine signed https:// URL
      // (the same reliable pattern the admin review queue already uses).
      setUploadingPdf(true);
      const { path, error } = await uploadVerificationDoc(userId, asset.uri, asset.name, asset.mimeType, docKind);
      setUploadingPdf(false);
      if (error || !path) {
        Alert.alert(t('verifyAccount.uploadError'));
        return;
      }
      onChange({ uri: asset.uri, fileName: asset.name, mimeType: asset.mimeType ?? null, isPdf: true, storagePath: path });
    } catch {
      setUploadingPdf(false);
      Alert.alert(t('verifyAccount.filePickError'));
    }
  };

  const pick = () => {
    if (imageOnly) {
      pickFromPhotos();
      return;
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [t('verifyAccount.chooseFromPhotos'), t('verifyAccount.chooseFromFiles'), t('account.cancel')], cancelButtonIndex: 2 },
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

  // A PDF isn't viewable until its real upload (kicked off the moment it
  // was picked, above) has actually finished — never let the shared
  // viewer open with no real file behind it yet.
  const canView = !!value && (!value.isPdf || (!!value.storagePath && !uploadingPdf));

  // A field still focused elsewhere on this form (company name/address,
  // etc.) can still hold first-responder status the instant the full-
  // screen viewer starts presenting over it — dismissing here, at the
  // exact moment the user asks to view, gives iOS a head start so that
  // race is resolved before the viewer's own close button needs to
  // receive taps. Centralized here since every "view" trigger in every
  // verification flow goes through this one shared field.
  const handleView = () => {
    if (!canView) return;
    Keyboard.dismiss();
    onView();
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.picker} onPress={() => (value ? handleView() : pick())}>
        {uploadingPdf ? (
          <View style={styles.placeholder}>
            <ActivityIndicator color={colors.pine} />
            <Text style={styles.placeholderText}>{t('verifyAccount.uploadingDoc')}</Text>
          </View>
        ) : value && !value.isPdf ? (
          <Image source={{ uri: value.uri }} style={styles.preview} resizeMode="contain" />
        ) : value && value.isPdf ? (
          <View style={styles.placeholder}>
            <Ionicons name="document-text-outline" size={26} color={colors.pine} />
            <Text style={styles.placeholderText} numberOfLines={1}>
              {value.fileName ?? 'PDF'}
            </Text>
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name={imageOnly ? 'camera-outline' : 'document-attach-outline'} size={26} color={colors.pine} />
            <Text style={styles.placeholderText}>{t('verifyAccount.attachDoc')}</Text>
          </View>
        )}
      </Pressable>

      {value && (
        <View style={styles.actionsRow}>
          <Pressable style={[styles.actionButton, !canView && styles.actionButtonDisabled]} onPress={canView ? handleView : undefined}>
            <Ionicons name="eye-outline" size={14} color={colors.pine} />
            <Text style={styles.actionButtonText}>{t('verifyAccount.viewDocument')}</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={pick}>
            <Ionicons name="swap-horizontal-outline" size={14} color={colors.pine} />
            <Text style={styles.actionButtonText}>{t('verifyAccount.changeDocument')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.lg },
  label: { fontFamily: fonts.headingBold, fontSize: 12, color: colors.ink, marginBottom: spacing.sm },
  picker: {
    height: 220,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.ivory2,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
  },
  preview: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  placeholderText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.pine },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.ivory2,
  },
  actionButtonText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.pine },
  actionButtonDisabled: { opacity: 0.5 },
});
