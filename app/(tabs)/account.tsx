import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors, ThemeMode } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { fetchOwnProfile, fetchPublishedListingsCountByOwner } from '@/src/lib/listings';
import { fetchLatestVerificationRequest, fetchUnreadNotificationCount, type VerificationRequestStatus } from '@/src/lib/account';
import { getStoredCurrency, setStoredCurrency, type CurrencyCode } from '@/src/lib/currency';
import { checkIsAdmin } from '@/src/lib/admin';
import { AuthPromptContent } from '@/src/components/AuthPrompt';

type OwnProfile = {
  fullName: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
};

type Styles = ReturnType<typeof createStyles>;

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default function AccountScreen() {
  const { t, locale, setLocale } = useI18n();
  const { colors: theme, mode, setMode } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [listingCount, setListingCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [verificationRequestStatus, setVerificationRequestStatus] = useState<VerificationRequestStatus | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        setLoading(true);
        setLoadError(false);
        setIsGuest(false);

        const { data, error: authError } = await supabase.auth.getUser();
        const user = data.user;
        if (authError || !user) {
          if (!cancelled) {
            setLoading(false);
            setIsGuest(true);
          }
          return;
        }
        if (cancelled) return;
        setUserId(user.id);

        const [ownProfile, listingsResult, unreadResult, storedCurrency, verificationRequest, adminStatus] = await Promise.all([
          fetchOwnProfile(user.id),
          fetchPublishedListingsCountByOwner(user.id),
          fetchUnreadNotificationCount(user.id),
          getStoredCurrency(),
          fetchLatestVerificationRequest(user.id),
          checkIsAdmin(),
        ]);
        if (cancelled) return;

        if (ownProfile.error) {
          setLoadError(true);
          setLoading(false);
          return;
        }

        setProfile({
          fullName: ownProfile.fullName,
          phone: ownProfile.phone,
          email: ownProfile.email,
          avatarUrl: ownProfile.avatarUrl,
          isVerified: ownProfile.isVerified,
        });
        setListingCount(listingsResult.count);
        setUnreadCount(unreadResult.count);
        setVerificationRequestStatus(verificationRequest.status);
        setCurrency(storedCurrency);
        setIsAdmin(adminStatus);
        setLoading(false);
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const changeLanguage = async (next: 'ar' | 'en') => {
    if (next === locale) return;
    await setLocale(next);
  };

  const changeCurrency = async (next: CurrencyCode) => {
    if (next === currency) return;
    await setStoredCurrency(next);
    setCurrency(next);
    if (next === 'SYP') {
      Alert.alert(t('account.currency'), t('account.currencyNoRealRateNotice'));
    }
  };

  // المظهر — real, immediate, persisted (src/theme/ThemeContext.tsx). No
  // restart/navigation/reload needed: setMode updates the shared context,
  // which is what every theme-aware screen (including this one) reads its
  // colors from.
  const changeAppearance = async (next: ThemeMode) => {
    if (next === mode) return;
    await setMode(next);
  };

  const handleSignOut = () => {
    Alert.alert(t('account.signOutConfirmTitle'), t('account.signOutConfirmBody'), [
      { text: t('account.cancel'), style: 'cancel' },
      {
        text: t('account.signOut'),
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.headingText} />
      </View>
    );
  }

  // Guest Mode: a clean, limited Account tab — no personal data, no
  // account-management rows, just the same real sign-in/sign-up prompt
  // used everywhere else in the app, so a guest lands on something
  // consistent rather than getting bounced out of the tab bar entirely.
  if (isGuest) {
    return (
      <View style={styles.flex}>
        <SafeAreaView edges={['top']} style={styles.safeTop} />
        <View style={styles.guestContainer}>
          <Text style={styles.screenTitle}>{t('tabs.account')}</Text>
          <View style={styles.guestPromptCard}>
            <AuthPromptContent titleKey="authPrompt.accountWelcomeTitle" bodyKey="authPrompt.accountWelcomeBody" />
          </View>
        </View>
      </View>
    );
  }

  const verificationStatusLabel = profile?.isVerified
    ? t('account.verifiedStatus')
    : verificationRequestStatus === 'pending' || verificationRequestStatus === 'processing'
      ? t('account.verificationPendingStatus')
      : verificationRequestStatus === 'requires_review'
        ? t('account.verificationRequiresReviewStatus')
        : verificationRequestStatus === 'rejected' || verificationRequestStatus === 'failed'
          ? t('account.verificationRejectedStatus')
          : t('account.unverifiedStatus');

  if (loadError || !profile || !userId) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={32} color={theme.mutedText} />
        <Text style={styles.errorText}>{t('account.loadError')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <SafeAreaView edges={['top']} style={styles.safeTop} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Text style={styles.screenTitle}>{t('tabs.account')}</Text>

        <View style={styles.profileRow}>
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={24} color={theme.mutedText} />
            </View>
          )}
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile.fullName ?? t('listingDetail.unknownOwner')}</Text>
            {!!profile.email && <Text style={styles.profileContact}>{profile.email}</Text>}
            {!!profile.phone && <Text style={styles.profileContact}>{`963+ ${profile.phone.replace('+963', '')}`}</Text>}
            {profile.isVerified && (
              <View style={styles.verifiedRow}>
                <Ionicons name="shield-checkmark" size={11} color={theme.accentGold} />
                <Text style={styles.verifiedText}>{t('listingDetail.verifiedAccount')}</Text>
              </View>
            )}
          </View>
        </View>

        <Pressable style={styles.statCard} onPress={() => router.push('/my-listings')}>
          <Text style={styles.statValue}>{groupThousands(listingCount)}</Text>
          <Text style={styles.statLabel}>{t('profileScreen.publishedListings')}</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>{t('account.accountSection')}</Text>
        <View style={styles.card}>
          <Row styles={styles} theme={theme} icon="person-outline" label={t('account.editProfile')} onPress={() => router.push('/edit-profile')} />
          <Row
            styles={styles}
            theme={theme}
            icon="shield-checkmark-outline"
            label={t('account.verifyAccount')}
            value={verificationStatusLabel}
            onPress={() => router.push('/verify-account')}
          />
          <Row styles={styles} theme={theme} icon="key-outline" label={t('account.changePassword')} onPress={() => router.push('/change-password')} />
          <Row styles={styles} theme={theme} icon="home-outline" label={t('account.myListings')} onPress={() => router.push('/my-listings')} />
          <Row styles={styles} theme={theme} icon="calendar-outline" label={t('booking.myBookings')} onPress={() => router.push('/my-bookings')} />
          <Row
            styles={styles}
            theme={theme}
            icon="bed-outline"
            label={t('booking.myBookingListings')}
            onPress={() => router.push('/my-booking-listings')}
          />
          <Row
            styles={styles}
            theme={theme}
            icon="briefcase-outline"
            label={t('booking.ownerBookingsTitle')}
            onPress={() => router.push('/owner-bookings')}
          />
          <Row
            styles={styles}
            theme={theme}
            icon="stats-chart-outline"
            label={t('adStatistics.menuLabel')}
            onPress={() => router.push('/ad-statistics')}
          />
          <Row
            styles={styles}
            theme={theme}
            icon="search-outline"
            label={t('propertyRequest.myRequests')}
            onPress={() => router.push('/my-property-requests')}
          />
          <Row
            styles={styles}
            theme={theme}
            icon="albums-outline"
            label={t('propertyRequest.matchesTitle')}
            onPress={() => router.push('/property-request-matches')}
          />
          <Row
            styles={styles}
            theme={theme}
            icon="notifications-outline"
            label={t('account.notifications')}
            badgeCount={unreadCount}
            onPress={() => router.push('/notifications')}
          />
          <Row
            styles={styles}
            theme={theme}
            icon="options-outline"
            label={t('account.notificationSettings')}
            onPress={() => router.push('/notification-settings')}
            last={!isAdmin}
          />
          {isAdmin && (
            <>
              <Row
                styles={styles}
                theme={theme}
                icon="lock-closed-outline"
                label={t('account.adminVerificationQueue')}
                onPress={() => router.push('/admin/verification-queue')}
              />
              <Row
                styles={styles}
                theme={theme}
                icon="home-outline"
                label={t('account.adminListingsQueue')}
                onPress={() => router.push('/admin/listings-queue')}
              />
              <Row
                styles={styles}
                theme={theme}
                icon="flag-outline"
                label={t('account.adminReportsQueue')}
                onPress={() => router.push('/admin/reports-queue')}
              />
              <Row
                styles={styles}
                theme={theme}
                icon="business-outline"
                label={t('account.adminProjectsQueue')}
                onPress={() => router.push('/admin/projects-queue')}
                last
              />
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>{t('account.preferencesSection')}</Text>
        <View style={styles.card}>
          <View style={styles.rowBase}>
            <Text style={styles.rowLabel}>{t('account.language')}</Text>
            <View style={styles.toggle}>
              <Pressable onPress={() => changeLanguage('ar')} style={[styles.toggleOption, locale === 'ar' && styles.toggleOptionActive]}>
                <Text style={[styles.toggleOptionText, locale === 'ar' && styles.toggleOptionTextActive]}>{t('auth.langAr')}</Text>
              </Pressable>
              <Pressable onPress={() => changeLanguage('en')} style={[styles.toggleOption, locale === 'en' && styles.toggleOptionActive]}>
                <Text style={[styles.toggleOptionText, locale === 'en' && styles.toggleOptionTextActive]}>EN</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.rowBase}>
            <Text style={styles.rowLabel}>{t('account.currency')}</Text>
            <View style={styles.toggle}>
              <Pressable onPress={() => changeCurrency('USD')} style={[styles.toggleOption, currency === 'USD' && styles.toggleOptionActive]}>
                <Text style={[styles.toggleOptionText, currency === 'USD' && styles.toggleOptionTextActive]}>USD</Text>
              </Pressable>
              <Pressable onPress={() => changeCurrency('SYP')} style={[styles.toggleOption, currency === 'SYP' && styles.toggleOptionActive]}>
                <Text style={[styles.toggleOptionText, currency === 'SYP' && styles.toggleOptionTextActive]}>SYP</Text>
              </Pressable>
            </View>
          </View>
          <View style={[styles.rowBase, styles.rowLast]}>
            <Text style={styles.rowLabel}>{t('account.appearance')}</Text>
            <View style={styles.toggle}>
              <Pressable onPress={() => changeAppearance('light')} style={[styles.toggleOption, mode === 'light' && styles.toggleOptionActive]}>
                <Text style={[styles.toggleOptionText, mode === 'light' && styles.toggleOptionTextActive]}>{t('account.appearanceLight')}</Text>
              </Pressable>
              <Pressable onPress={() => changeAppearance('dark')} style={[styles.toggleOption, mode === 'dark' && styles.toggleOptionActive]}>
                <Text style={[styles.toggleOptionText, mode === 'dark' && styles.toggleOptionTextActive]}>{t('account.appearanceDark')}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('account.supportSection')}</Text>
        <View style={styles.card}>
          <Row styles={styles} theme={theme} icon="chatbubble-outline" label={t('account.support')} onPress={() => router.push('/support')} />
          <Row styles={styles} theme={theme} icon="document-text-outline" label={t('account.terms')} onPress={() => router.push('/legal/terms')} />
          <Row styles={styles} theme={theme} icon="shield-outline" label={t('account.privacy')} onPress={() => router.push('/legal/privacy')} last />
        </View>

        <Pressable onPress={handleSignOut}>
          <Text style={styles.signOut}>{t('account.signOut')}</Text>
        </Pressable>

        <Pressable onPress={() => router.push('/delete-account')}>
          <Text style={styles.deleteAccountLink}>{t('deleteAccount.title')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Row({
  styles,
  theme,
  icon,
  label,
  onPress,
  last,
  badgeCount,
  value,
}: {
  styles: Styles;
  theme: ThemeColors;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  last?: boolean;
  badgeCount?: number;
  value?: string;
}) {
  return (
    <Pressable style={[styles.rowBase, last && styles.rowLast]} onPress={onPress}>
      <View style={styles.rowLabelWithIcon}>
        <Ionicons name={icon} size={15} color={theme.headingText} />
        <Text style={styles.rowLabel}>{label}</Text>
        {!!badgeCount && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
          </View>
        )}
      </View>
      <View style={styles.rowLabelWithIcon}>
        {!!value && <Text style={styles.rowValue}>{value}</Text>}
        <Ionicons name="chevron-back" size={14} color={theme.mutedText} />
      </View>
    </Pressable>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    safeTop: { backgroundColor: theme.background },
    centered: { flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
    errorText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: theme.mutedText },
    content: { padding: spacing.lg, paddingBottom: spacing.xxl },
    screenTitle: { fontFamily: fonts.headingBold, fontSize: 15, color: theme.headingText, marginBottom: spacing.lg },
    guestContainer: { flex: 1, padding: spacing.lg },
    guestPromptCard: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
    avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.surfaceAlt },
    avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    profileInfo: { gap: 2, flexShrink: 1 },
    profileName: { fontFamily: fonts.headingExtraBold, fontSize: 14, color: theme.bodyText },
    profileContact: { fontFamily: fonts.bodyRegular, fontSize: 10, color: theme.mutedText },
    verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    verifiedText: { fontFamily: fonts.bodyMedium, fontSize: 9, color: theme.accentGold },

    statCard: {
      backgroundColor: theme.surface,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    statValue: { fontFamily: fonts.headingBold, fontSize: 15, color: theme.headingText },
    statLabel: { fontFamily: fonts.bodyRegular, fontSize: 9.5, color: theme.mutedText, marginTop: 2 },

    sectionTitle: { fontFamily: fonts.headingBold, fontSize: 10.5, color: theme.mutedText, marginBottom: spacing.sm },
    card: { backgroundColor: theme.surface, borderRadius: radii.md, marginBottom: spacing.lg, overflow: 'hidden' },
    rowBase: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    rowLast: { borderBottomWidth: 0 },
    rowLabelWithIcon: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rowLabel: { fontFamily: fonts.bodyRegular, fontSize: 12, color: theme.bodyText },
    rowValue: { fontFamily: fonts.headingBold, fontSize: 11, color: theme.headingText },

    badge: {
      backgroundColor: theme.accentGold,
      borderRadius: radii.pill,
      minWidth: 16,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    badgeText: { fontFamily: fonts.headingBold, fontSize: 8.5, color: theme.brandFill },

    toggle: { flexDirection: 'row', backgroundColor: theme.surfaceAlt, borderRadius: 9, padding: 2 },
    toggleOption: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: 7 },
    toggleOptionActive: { backgroundColor: theme.brandFill },
    toggleOptionText: { fontFamily: fonts.headingBold, fontSize: 10, color: theme.mutedText },
    toggleOptionTextActive: { color: theme.onBrandFill },

    signOut: {
      fontFamily: fonts.headingBold,
      fontSize: 12,
      // Deliberately distinct from deleteAccountLink's theme.danger below —
      // sign-out is a mild action, delete-account is destructive, and the
      // original design used two different hues for that reason.
      color: theme.signOutText,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    deleteAccountLink: {
      fontFamily: fonts.bodyMedium,
      fontSize: 11,
      color: theme.danger,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
  });
}
