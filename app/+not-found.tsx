import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, Stack } from 'expo-router';

import { fonts, fontSizes, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';

export default function NotFoundScreen() {
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn&apos;t exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
      padding: spacing.xl,
      gap: spacing.md,
    },
    title: {
      fontFamily: fonts.headingBold,
      fontSize: fontSizes.bodySmall,
      color: theme.bodyText,
    },
    link: {
      paddingVertical: spacing.md,
    },
    linkText: {
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.body,
      color: theme.headingText,
    },
  });
}
