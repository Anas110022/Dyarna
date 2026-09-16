import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';

export type PhotoPermissionResult = { granted: boolean; canAskAgain: boolean };

// Checks the REAL current iOS permission state first (getMediaLibraryPermissionsAsync)
// rather than always calling requestMediaLibraryPermissionsAsync — once iOS has
// already been asked once and denied, calling "request" again silently
// resolves to denied without showing any UI, so the caller needs to know
// whether it can still prompt (canAskAgain) or must send the user to
// Settings instead.
export async function ensurePhotoLibraryPermission(): Promise<PhotoPermissionResult> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return { granted: true, canAskAgain: current.canAskAgain };
  if (!current.canAskAgain) return { granted: false, canAskAgain: false };

  const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return { granted: requested.granted, canAskAgain: requested.canAskAgain };
}

export function openIOSSettings(): void {
  Linking.openSettings();
}
