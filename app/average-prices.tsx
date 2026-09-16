import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { AppHeader } from '@/src/components/AppHeader';

// متوسط أسعار العقارات — Service #3. Deliberately a maintenance state, not
// a placeholder for a missing feature: the real service depends on a
// verified official real-estate data source (see investigation notes),
// which isn't wired up yet. Nothing here computes or displays a price of
// any kind — no Dyarna listing average, no invented figure — specifically
// so this can never be mistaken for real market data. Swap this file's
// body for the real service once a real data source is integrated; the
// route and its entry in الخدمات stay the same.
export default function AveragePricesScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.flex}>
      <AppHeader title={t('averagePrices.title')} />

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="construct-outline" size={34} color={theme.headingText} />
        </View>
        <Text style={styles.title}>{t('averagePrices.title')}</Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{t('averagePrices.status')}</Text>
        </View>
        <Text style={styles.message}>{t('averagePrices.mainMessage')}</Text>
        <Text style={styles.additionalMessage}>{t('averagePrices.additionalMessage')}</Text>
      </View>
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
    iconCircle: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    title: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.sectionTitle, color: theme.headingText, textAlign: 'center' },
    statusPill: {
      backgroundColor: '#E4A45F',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.pill,
    },
    statusPillText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.white },
    message: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.body, color: theme.bodyText, textAlign: 'center', lineHeight: 21 },
    additionalMessage: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.mutedText, textAlign: 'center' },
  });
}
