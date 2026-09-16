import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { colors, fonts, radii, spacing } from '@/src/theme';

// Guest Mode: the one real "you need an account for this" surface, reused
// everywhere a signed-out user attempts a gated action. Never a different
// message per screen — always this exact copy, so it reads as one
// consistent product decision, not a UI quirk of whichever screen you're on.
//
// Return-to-origin: every login/signup entry point here carries a real
// `redirect` (the screen to land back on) and an optional `intent` (which
// specific action to resume there) as route params, threaded through
// app/(auth)/login.tsx -> app/(auth)/otp.tsx, which navigates back to
// `redirect` (with `intent` reattached) instead of always landing on
// `/(tabs)` once verification actually succeeds.

function AuthButtons({ redirectTo, intent }: { redirectTo?: string; intent?: string }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const target = redirectTo ?? pathname;

  const goToAuth = (mode: 'signin' | 'signup') => {
    router.push({
      pathname: '/(auth)/login',
      params: { mode, redirect: target, ...(intent ? { intent } : {}) },
    });
  };

  return (
    <>
      <Pressable style={styles.primaryButton} onPress={() => goToAuth('signin')}>
        <Text style={styles.primaryButtonText}>{t('authPrompt.login')}</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={() => goToAuth('signup')}>
        <Text style={styles.secondaryButtonText}>{t('authPrompt.signup')}</Text>
      </Pressable>
    </>
  );
}

// Exported so a screen that wants to keep its own header/chrome (a tab's
// title bar, for instance) can embed just the prompt content instead of
// the full standalone AuthRequiredScreen below. `titleKey`/`bodyKey` let
// the Account tab show its own softer welcome copy instead of the default
// "action requires an account" wording.
export function AuthPromptContent({
  redirectTo,
  intent,
  titleKey = 'authPrompt.title',
  bodyKey = 'authPrompt.body',
}: {
  redirectTo?: string;
  intent?: string;
  titleKey?: string;
  bodyKey?: string;
}) {
  const { t } = useI18n();
  return (
    <>
      <View style={styles.iconCircle}>
        <Ionicons name="lock-closed-outline" size={26} color={colors.pine} />
      </View>
      <Text style={styles.title}>{t(titleKey)}</Text>
      <Text style={styles.body}>{t(bodyKey)}</Text>
      <AuthButtons redirectTo={redirectTo} intent={intent} />
    </>
  );
}

// Modal presentation — for an in-context action on an otherwise
// guest-accessible screen (favorite a listing, start a chat, add a
// review...). The screen underneath stays exactly as it was; dismissing
// just cancels the attempted action. `redirectTo` defaults to the current
// screen (usePathname()) so confirming sign-in returns right here.
export function AuthPromptModal({
  visible,
  onClose,
  redirectTo,
  intent,
}: {
  visible: boolean;
  onClose: () => void;
  redirectTo?: string;
  intent?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <AuthPromptContent redirectTo={redirectTo} intent={intent} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Full-screen presentation — for a route that is entirely gated (account
// management screens etc.), shown in place of the screen's real content
// instead of a silent redirect, so a guest reaching it via a direct/deep
// link still gets a clear explanation, not a jarring instant bounce.
// Signing in from here returns to this same route, which re-runs its own
// guard and now finds a real session.
export function AuthRequiredScreen({ onClose }: { onClose?: () => void }) {
  const close = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };
  return (
    <View style={styles.fullScreen}>
      <SafeAreaView edges={['top']} style={styles.fullScreenHeader}>
        <Pressable style={styles.fullScreenCloseButton} onPress={close} hitSlop={12}>
          <Ionicons name="close" size={20} color={colors.inkSoft} />
        </Pressable>
      </SafeAreaView>
      <View style={styles.fullScreenContent}>
        <AuthPromptContent />
      </View>
    </View>
  );
}

// Tiny convenience hook for the common "gate this onPress" shape used
// across listing/profile/home screens. Pass an intent identifier when the
// destination screen knows how to auto-resume that specific action once
// verification completes (e.g. 'favorite', 'chat').
export function useAuthPrompt() {
  const [visible, setVisible] = useState(false);
  const [intent, setIntent] = useState<string | undefined>(undefined);
  return {
    authPromptVisible: visible,
    authPromptIntent: intent,
    showAuthPrompt: (nextIntent?: string) => {
      setIntent(nextIntent);
      setVisible(true);
    },
    hideAuthPrompt: () => setVisible(false),
  };
}

// Resolves a `redirect`/`intent` route param pair back into a real Href once
// verification succeeds — used only by app/(auth)/otp.tsx. Centralized here
// since it's the one place that needs to turn arbitrary string params back
// into a typed-routes Href, and rejects anything that isn't a real in-app
// path (never trust a route param as a free-form navigation target).
export function resolveRedirectHref(redirect: string | undefined, intent: string | undefined): Href {
  const pathname = redirect && redirect.startsWith('/') ? redirect : '/(tabs)';
  return (intent ? { pathname, params: { intent } } : pathname) as Href;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(11,43,33,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  sheet: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  fullScreen: { flex: 1, backgroundColor: colors.ivory },
  fullScreenHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg },
  fullScreenCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginTop: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ivory2,
  },
  fullScreenContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },

  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ivory2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontFamily: fonts.headingExtraBold, fontSize: 17, color: colors.pine, textAlign: 'center', marginBottom: spacing.sm },
  body: {
    fontFamily: fonts.bodyRegular,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  primaryButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.pine,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryButtonText: { fontFamily: fonts.headingBold, fontSize: 13.5, color: colors.goldSoft },
  secondaryButton: {
    alignSelf: 'stretch',
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.pine,
  },
  secondaryButtonText: { fontFamily: fonts.headingBold, fontSize: 13.5, color: colors.pine },
});
