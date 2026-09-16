import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import type { CountryCode } from '@/src/lib/countryCodes';
import { CountryCodePicker } from '@/src/components/CountryCodePicker';

// `variant` matches whichever surrounding screen this is dropped into —
// "light" for the white-card screens (edit-profile, post-listing), "dark"
// for the pine-background auth screen — rather than forcing one look on
// screens that already have an established, different visual language.
// "dark" is a fixed brand look for that one always-dark auth screen, NOT
// the app's light/dark theme mode — it deliberately does not read from
// useTheme(). Only "light" (used on screens that do follow theme mode)
// sources its colors from the theme.
export function PhoneInput({
  country,
  onCountryChange,
  value,
  onChangeText,
  placeholder,
  variant = 'light',
}: {
  country: CountryCode;
  onCountryChange: (country: CountryCode) => void;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  variant?: 'light' | 'dark';
}) {
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const dark = variant === 'dark';

  return (
    <View style={styles.row}>
      <Pressable style={[styles.countryTrigger, dark && styles.countryTriggerDark]} onPress={() => setPickerOpen(true)}>
        <Text style={styles.flag}>{country.flag}</Text>
        <Text style={[styles.dialCode, dark && styles.dialCodeDark]}>{`+${country.dialCode}`}</Text>
        <Ionicons name="chevron-down" size={13} color={dark ? colors.goldSoft : theme.mutedText} />
      </Pressable>
      <TextInput
        style={[styles.input, dark && styles.inputDark]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={dark ? 'rgba(247,244,236,0.35)' : theme.mutedText}
        keyboardType="number-pad"
        maxLength={country.nsnMaxLength}
      />
      <CountryCodePicker visible={pickerOpen} selected={country} onSelect={onCountryChange} onClose={() => setPickerOpen(false)} />
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    countryTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.fieldBorder,
      borderRadius: radii.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.md,
    },
    countryTriggerDark: {
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(201,168,95,0.35)',
    },
    flag: { fontSize: 16 },
    dialCode: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.mutedText },
    dialCodeDark: { color: colors.goldSoft },
    input: {
      flex: 1,
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
    inputDark: {
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(201,168,95,0.35)',
      color: colors.ivory,
    },
  });
}
