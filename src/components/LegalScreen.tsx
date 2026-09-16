import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, spacing } from '@/src/theme';
import type { LegalDocument } from '@/src/content/legal';

export function LegalScreen({ document }: { document: LegalDocument }) {
  return (
    <View style={styles.flex}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <Pressable style={styles.headerBack} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-forward" size={20} color={colors.pine} />
        </Pressable>
        <Text style={styles.headerTitle}>{document.title}</Text>
        <View style={styles.headerBack} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updatedAt}>{document.updatedAt}</Text>
        {document.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            <Text style={styles.body}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ivory },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.ivory,
  },
  headerBack: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fonts.headingBold, fontSize: 15, color: colors.pine },

  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  updatedAt: { fontFamily: fonts.bodyRegular, fontSize: 10, color: colors.inkSoft, marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  heading: { fontFamily: fonts.headingBold, fontSize: 13, color: colors.pine, marginBottom: spacing.xs },
  body: { fontFamily: fonts.bodyRegular, fontSize: 12.5, color: colors.ink, lineHeight: 21 },
});
