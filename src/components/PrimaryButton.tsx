import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { fonts, fontSizes, radii } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

// The app-wide filled action button for light-background screens (the
// pine-on-gold PillButton remains its own thing, used only on the dark
// auth/OTP screens). Fixed 52px height and 16px label — the "consistent
// height, consistent typography" primary button the app never had; most
// screens previously hand-rolled their own submit-button style inline.
// The fill is sourced from theme.brandFill/theme.white rather than the
// raw `colors` constants, but both are intentionally the SAME value in
// light and dark mode (see themeTokens.ts) — a self-contained brand fill
// reads fine on either theme's background, unlike an outline or text
// painted directly on the page (see SecondaryButton).
export function PrimaryButton({ label, onPress, loading, disabled, style }: PrimaryButtonProps) {
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Pressable
      style={[styles.button, (disabled || loading) && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? <ActivityIndicator color={theme.white} /> : <Text style={styles.label}>{label}</Text>}
    </Pressable>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    button: {
      height: 52,
      borderRadius: radii.md,
      backgroundColor: theme.brandFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabled: { opacity: 0.5 },
    label: { fontFamily: fonts.headingBold, fontSize: fontSizes.button, color: theme.white },
  });
}
