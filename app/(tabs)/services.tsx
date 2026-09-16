import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';

// الخدمات — four real services: طلب عقار (step 1), مقارنة العقارات (step
// 2), متوسط أسعار العقارات (step 3 — a real, professional maintenance
// state, not a placeholder: it stays under maintenance until a verified
// official real-estate data source is integrated), and حاسبة الإيجار (step
// 4 — a real, fully local calculator, no backend). The rest of this tab is
// still a permanent placeholder per the product spec; this only adds the
// real cards, it doesn't turn the whole tab into a services catalog.
export default function ServicesScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView edges={['top']} style={styles.flex}>
      <Text style={styles.title}>{t('tabs.services')}</Text>

      <Pressable style={[styles.card, styles.cardSpaced]} onPress={() => router.push('/property-request')}>
        <View style={styles.iconWrap}>
          <Ionicons name="search-outline" size={22} color={theme.headingText} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{t('propertyRequest.servicesCardTitle')}</Text>
          <Text style={styles.cardDescription}>{t('propertyRequest.servicesCardDescription')}</Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={theme.mutedText} />
      </Pressable>

      <Pressable style={[styles.card, styles.cardSpaced]} onPress={() => router.push('/compare-properties')}>
        <View style={styles.iconWrap}>
          <Ionicons name="git-compare-outline" size={22} color={theme.headingText} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{t('compare.servicesCardTitle')}</Text>
          <Text style={styles.cardDescription}>{t('compare.servicesCardDescription')}</Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={theme.mutedText} />
      </Pressable>

      <Pressable style={[styles.card, styles.cardSpaced]} onPress={() => router.push('/average-prices')}>
        <View style={styles.iconWrap}>
          <Ionicons name="stats-chart-outline" size={22} color={theme.headingText} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{t('averagePrices.servicesCardTitle')}</Text>
          <Text style={styles.cardDescription}>{t('averagePrices.servicesCardDescription')}</Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={theme.mutedText} />
      </Pressable>

      <Pressable style={styles.card} onPress={() => router.push('/rent-calculator')}>
        <View style={styles.iconWrap}>
          <Ionicons name="calculator-outline" size={22} color={theme.headingText} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{t('rentCalculator.servicesCardTitle')}</Text>
          <Text style={styles.cardDescription}>{t('rentCalculator.description')}</Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={theme.mutedText} />
      </Pressable>
    </SafeAreaView>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background, paddingHorizontal: spacing.lg },
    title: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.screenTitle, color: theme.headingText, marginTop: spacing.md, marginBottom: spacing.lg },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
    },
    cardSpaced: { marginBottom: spacing.sm },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: radii.md,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: { flex: 1, gap: 2 },
    cardTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText },
    cardDescription: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText },
  });
}
