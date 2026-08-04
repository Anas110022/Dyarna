import { StyleSheet, Text, View } from 'react-native';
import { Link, Stack } from 'expo-router';

import { colors, fonts, spacing } from '@/src/theme';

export default function NotFoundScreen() {
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ivory,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 16,
    color: colors.ink,
  },
  link: {
    paddingVertical: spacing.md,
  },
  linkText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.pine,
  },
});
