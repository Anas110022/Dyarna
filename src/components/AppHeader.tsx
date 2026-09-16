import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Replaces the right-side spacer — e.g. "تحديد الكل كمقروء". */
  rightElement?: ReactNode;
};

// The one shared header for every pushed screen. Real back navigation
// (never bare "→"/"←" text), a real 44x44 touch target around a 24px
// icon, and — the actual RTL correctness fix this consolidates — the
// chevron direction is picked from the live locale rather than a single
// hardcoded glyph, so it points the right way in both Arabic and English
// instead of only happening to read correctly in RTL.
export function AppHeader({ title, subtitle, onBack, rightElement }: AppHeaderProps) {
  const { isRTL } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const backIcon = isRTL ? 'chevron-forward' : 'chevron-back';

  return (
    <SafeAreaView edges={['top']} style={styles.header}>
      <Pressable onPress={onBack ?? (() => router.back())} hitSlop={10} style={styles.iconButton}>
        <Ionicons name={backIcon} size={24} color={theme.headingText} />
      </Pressable>
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {rightElement ?? <View style={styles.iconButton} />}
    </SafeAreaView>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      backgroundColor: theme.background,
    },
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    titleWrap: { flex: 1, alignItems: 'center' },
    title: { fontFamily: fonts.headingBold, fontSize: fontSizes.screenTitle, color: theme.headingText },
    subtitle: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, marginTop: 2 },
  });
}
