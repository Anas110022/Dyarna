import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { fetchOwnProfile } from '@/src/lib/listings';
import { updateOwnProfile, uploadAvatar } from '@/src/lib/account';
import { ensurePhotoLibraryPermission, openIOSSettings } from '@/src/lib/mediaPermissions';
import { isValidLocalNumber, splitE164, toE164 } from '@/src/lib/phone';
import { DEFAULT_COUNTRY, type CountryCode } from '@/src/lib/countryCodes';
import { PhoneInput } from '@/src/components/PhoneInput';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { LoadingState } from '@/src/components/LoadingState';
import { PrimaryButton } from '@/src/components/PrimaryButton';
import { FormInput } from '@/src/components/FormInput';

export default function EditProfileScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [hadPhone, setHadPhone] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [avatarPickError, setAvatarPickError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        setLoading(false);
        setAuthRequired(true);
        return;
      }
      if (cancelled) return;
      setUserId(user.id);

      const own = await fetchOwnProfile(user.id);
      if (cancelled) return;
      if (own.error) {
        setError(t('account.loadError'));
        setLoading(false);
        return;
      }
      setFullName(own.fullName ?? '');
      if (own.phone) {
        const { country, local } = splitE164(own.phone);
        setPhoneCountry(country);
        setPhoneLocal(local);
      }
      setHadPhone(!!own.phone);
      setAvatarUri(own.avatarUrl);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const pickAvatar = async () => {
    setAvatarPickError(null);
    try {
      const permission = await ensurePhotoLibraryPermission();
      if (!permission.granted) {
        if (!permission.canAskAgain) {
          Alert.alert(t('editProfile.photoPermissionDenied'), t('editProfile.photoPermissionDeniedSettingsBody'), [
            { text: t('account.cancel'), style: 'cancel' },
            { text: t('editProfile.openSettings'), onPress: openIOSSettings },
          ]);
        } else {
          setAvatarPickError(t('editProfile.photoPermissionDenied'));
        }
        return;
      }
      // No allowsEditing/aspect here — same real, proven-working picker call
      // as the post-listing wizard's photo pickers. Combining allowsEditing
      // with the modern limited-photo-library picker is what was actually
      // breaking selection on a real device; the avatar still renders as a
      // circle via the existing borderRadius, so cropping isn't needed.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        setAvatarUri(result.assets[0].uri);
        setAvatarChanged(true);
      }
    } catch {
      setAvatarPickError(t('editProfile.photoPickError'));
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!fullName.trim()) {
      setError(t('auth.errorFullNameRequired'));
      return;
    }
    if (phoneLocal.trim().length > 0 && !isValidLocalNumber(phoneLocal, phoneCountry)) {
      setError(t('auth.errorPhoneInvalid'));
      return;
    }

    setSaving(true);
    setError(null);

    let newAvatarUrl: string | undefined;
    if (avatarChanged && avatarUri) {
      const { url, error: uploadError } = await uploadAvatar(userId, avatarUri);
      if (uploadError || !url) {
        setError(t('editProfile.avatarUploadError'));
        setSaving(false);
        return;
      }
      newAvatarUrl = url;
    }

    const nextPhone = phoneLocal.trim().length > 0 ? toE164(phoneLocal, phoneCountry) : hadPhone ? null : undefined;

    const { error: updateError } = await updateOwnProfile(userId, {
      fullName: fullName.trim(),
      ...(nextPhone !== undefined ? { phone: nextPhone } : {}),
      ...(newAvatarUrl ? { avatarUrl: newAvatarUrl } : {}),
    });

    setSaving(false);
    if (updateError) {
      setError(t('editProfile.saveError'));
      return;
    }
    router.back();
  };

  if (loading) {
    return <LoadingState />;
  }

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  return (
    <View style={styles.flex}>
      <AppHeader title={t('account.editProfile')} />

      <View style={styles.content}>
        <Pressable style={styles.avatarWrap} onPress={pickAvatar}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={32} color={theme.mutedText} />
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            <Ionicons name="camera" size={13} color={theme.onBrandFill} />
          </View>
        </Pressable>
        {avatarPickError && <Text style={styles.errorText}>{avatarPickError}</Text>}

        <FormInput
          label={t('auth.fullName')}
          value={fullName}
          onChangeText={setFullName}
          placeholder={t('auth.fullNamePlaceholder')}
          containerStyle={styles.field}
        />

        <Text style={styles.fieldLabel}>{t('auth.phone')}</Text>
        <PhoneInput country={phoneCountry} onCountryChange={setPhoneCountry} value={phoneLocal} onChangeText={setPhoneLocal} placeholder="9XX XXX XXX" />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <PrimaryButton label={t('editProfile.save')} onPress={handleSave} loading={saving} style={styles.saveButton} />
      </View>
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    content: { padding: spacing.lg },
    avatarWrap: { alignSelf: 'center', marginBottom: spacing.sm },
    avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: theme.surfaceAlt },
    avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    avatarEditBadge: {
      position: 'absolute',
      bottom: 0,
      end: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.brandFill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.background,
    },

    field: { marginBottom: spacing.lg },
    fieldLabel: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, marginBottom: spacing.sm },
    errorText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.danger, marginTop: spacing.sm, textAlign: 'center' },

    saveButton: { marginTop: spacing.xl },
  });
}
