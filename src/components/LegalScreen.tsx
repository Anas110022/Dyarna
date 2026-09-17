import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { AppHeader } from '@/src/components/AppHeader';
import { formatFullDate } from '@/src/lib/arabicDate';
import type { LegalDocument } from '@/src/content/legal';

// Shared by /legal/terms and /legal/privacy — a plain data-driven renderer
// over LegalDocument (src/content/legal.ts), so the two screens never
// diverge in layout, only in content. Uses AppHeader (not a bespoke header)
// so the back-chevron direction, Dynamic Island clearance, and title style
// all match every other pushed screen in the app instead of re-solving
// those on their own.
export function LegalScreen({ document }: { document: LegalDocument }) {
  const { locale, t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.flex}>
      <AppHeader title={document.title} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.updatedAt}>
          {t('legal.lastUpdated')} · {formatFullDate(document.updatedAt, locale)}
        </Text>

        {document.sections.map((section, index) => {
          const isLast = index === document.sections.length - 1;
          return (
            <View key={section.heading} style={[styles.section, isLast && styles.lastSection]}>
              <Text style={styles.heading}>{section.heading}</Text>
              <Text style={styles.body}>{section.body}</Text>
              {!!section.notice && (
                <View style={styles.notice}>
                  <Ionicons name="alert-circle" size={17} color={theme.accentGold} />
                  <Text style={styles.noticeText}>{section.notice}</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      paddingBottom: spacing.xxl,
    },
    updatedAt: {
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.caption,
      color: theme.mutedText,
      marginBottom: spacing.xl,
    },
    section: {
      paddingBottom: spacing.xl,
      marginBottom: spacing.xl,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    lastSection: {
      borderBottomWidth: 0,
      marginBottom: 0,
      paddingBottom: 0,
    },
    heading: {
      fontFamily: fonts.headingBold,
      fontSize: fontSizes.sectionTitle,
      color: theme.headingText,
      marginBottom: spacing.sm,
    },
    body: {
      fontFamily: fonts.bodyRegular,
      fontSize: fontSizes.body,
      color: theme.bodyText,
      lineHeight: 26,
    },
    // A deliberately rare element — only the two or three sections per
    // document that genuinely need to stand out (e.g. "this can't be
    // undone", "we don't verify ownership") get one, so it keeps its
    // weight instead of becoming wallpaper.
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: theme.surfaceAlt,
      borderStartWidth: 3,
      borderStartColor: theme.accentGold,
      borderRadius: radii.sm,
      padding: spacing.md,
      marginTop: spacing.md,
    },
    noticeText: {
      flex: 1,
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.bodySmall,
      color: theme.bodyText,
      lineHeight: 20,
    },
  });
}
