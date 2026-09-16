import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { fonts, fontSizes, radii } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';

type SecondaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
};

// Same footprint as PrimaryButton (52px height, same radius/type scale)
// so the two sit together consistently — outlined instead of filled. Its
// border+label sit directly on the page background (unlike PrimaryButton's
// self-contained pine fill), so — unlike the fixed brand fill — they must
// come from the theme to stay legible against a dark-mode background.
export function SecondaryButton({ label, onPress, disabled, style }: SecondaryButtonProps) {
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Pressable style={[styles.button, disabled && styles.disabled, style]} onPress={onPress} disabled={disabled}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    button: {
      height: 52,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: theme.headingText,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabled: { opacity: 0.5 },
    label: { fontFamily: fonts.headingBold, fontSize: fontSizes.button, color: theme.headingText },
  });
}
