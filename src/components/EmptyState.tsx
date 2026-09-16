import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { fonts, fontSizes, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { PrimaryButton } from './PrimaryButton';

type EmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

// The one shared "nothing here yet" block — was previously a copy-pasted
// icon+text (and sometimes a differently-styled button) on ~15+ screens.
export function EmptyState({ icon, message, actionLabel, onAction }: EmptyStateProps) {
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={32} color={theme.mutedText} />
      <Text style={styles.message}>{message}</Text>
      {!!actionLabel && !!onAction && (
        <PrimaryButton label={actionLabel} onPress={onAction} style={styles.action} />
      )}
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xxl },
    message: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.body, color: theme.mutedText, textAlign: 'center' },
    action: { marginTop: spacing.sm, alignSelf: 'stretch' },
  });
}
