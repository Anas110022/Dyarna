import { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';

type FormInputProps = TextInputProps & {
  label?: string;
  required?: boolean;
  error?: string;
  containerStyle?: ViewStyle;
};

// The one shared labeled text field — was previously a copy-pasted
// fieldLabel Text + bare TextInput on every form screen, each with its
// own slightly-drifted font size/height/border color. 52px minimum height
// (matches PrimaryButton/SecondaryButton) so a form's inputs and its
// submit button read as one consistent control family.
export function FormInput({ label, required, error, containerStyle, style, multiline, ...rest }: FormInputProps) {
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
      <TextInput
        style={[styles.input, multiline && styles.textArea, style]}
        placeholderTextColor={theme.mutedText}
        multiline={multiline}
        {...rest}
      />
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    label: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, marginBottom: spacing.sm },
    input: {
      minHeight: 52,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.fieldBorder,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontFamily: fonts.bodyRegular,
      fontSize: fontSizes.body,
      color: theme.bodyText,
    },
    textArea: { minHeight: 110, textAlignVertical: 'top' },
    errorText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.danger, marginTop: spacing.xs },
  });
}
