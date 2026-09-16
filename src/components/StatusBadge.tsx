import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';

type StatusTone = 'pending' | 'success' | 'danger' | 'neutral';

// Tinted backgrounds are derived from the theme's own tone colors (a low-
// alpha wash of the same hue used for the text) rather than hand-picked
// hex pairs — that way a badge is automatically legible and on-brand in
// both light and dark mode instead of needing its own separate dark set.
function toneColors(theme: ThemeColors): Record<StatusTone, { bg: string; text: string }> {
  return {
    pending: { bg: `${theme.accentGold}26`, text: theme.accentGold },
    success: { bg: `${theme.success}26`, text: theme.success },
    danger: { bg: `${theme.danger}26`, text: theme.danger },
    neutral: { bg: theme.surfaceAlt, text: theme.mutedText },
  };
}

// The one shared status pill — قيد المراجعة / منشور / مرفوض and every
// other status tag (bookings, listings, admin queues) previously each
// had their own hand-rolled colored View+Text.
export function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  const { colors: theme } = useTheme();
  const c = useMemo(() => toneColors(theme), [theme])[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill, alignSelf: 'flex-start' },
  text: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption },
});
