import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { colors, fonts, spacing } from '@/src/theme';
import { ComingSoon } from '@/src/components/ComingSoon';

// TEMPORARY: a pushed-screen wrapper around ComingSoon for routes that are
// navigated to (not tabs) but aren't built yet — replace with the real
// screen once its build phase lands.
export function ComingSoonScreen({ title }: { title: string }) {
  const { t, isRTL } = useI18n();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
          <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={20} color={colors.pine} />
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>
      </View>
      <ComingSoon title={title} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ivory,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  backText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.pine,
  },
});
