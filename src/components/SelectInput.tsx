import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';

type SelectInputProps = {
  label?: string;
  required?: boolean;
  /** The selected option's display text, or null/empty to show placeholder. */
  value: string | null;
  placeholder: string;
  onPress: () => void;
  error?: string;
  containerStyle?: ViewStyle;
};

// The one shared "tap to pick from a list/modal" field — same footprint
// as FormInput (52px min height, same border/radius/type) so a picker
// trigger and a real text field sit together consistently in a form. The
// picker UI itself (bottom sheet, modal list, inline chips...) stays
// owned by the screen — their shapes genuinely differ — this only
// standardizes the closed-state trigger row.
export function SelectInput({ label, required, value, placeholder, onPress, error, containerStyle }: SelectInputProps) {
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={containerStyle}>
      {!!label && (
        <Text style={styles.label}>
          {label}
          {required ? ' *' : ''}
        </Text>
      )}
      <Pressable style={styles.field} onPress={onPress}>
        <Text style={[styles.fieldText, !value && styles.placeholderText]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={theme.mutedText} />
      </Pressable>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    label: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, marginBottom: spacing.sm },
    field: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.fieldBorder,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    fieldText: { flex: 1, fontFamily: fonts.bodyRegular, fontSize: fontSizes.body, color: theme.bodyText },
    placeholderText: { color: theme.mutedText },
    errorText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.danger, marginTop: spacing.xs },
  });
}
