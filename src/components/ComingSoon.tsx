import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/src/i18n';
import { colors, fonts, spacing } from '@/src/theme';

export function ComingSoon({ title }: { title: string }) {
  const { t } = useI18n();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.badge}>{t('common.comingSoon')}</Text>
      <Text style={styles.body}>{t('common.comingSoonBody')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ivory,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.headingExtraBold,
    fontSize: 20,
    color: colors.pine,
  },
  badge: {
    fontFamily: fonts.headingBold,
    fontSize: 13,
    color: colors.gold,
    backgroundColor: colors.pine,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 100,
    overflow: 'hidden',
  },
  body: {
    fontFamily: fonts.bodyRegular,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
  },
});
