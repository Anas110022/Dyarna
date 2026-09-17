import { useCallback, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { fetchConversations, type ConversationSummary } from '@/src/lib/chat';
import { AuthPromptContent } from '@/src/components/AuthPrompt';
import { LoadingState } from '@/src/components/LoadingState';
import { EmptyState } from '@/src/components/EmptyState';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `قبل ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} س`;
  const days = Math.floor(hours / 24);
  return `قبل ${days} يوم`;
}

export default function ChatsScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        setLoading(true);
        setError(false);
        setAuthRequired(false);
        const { data: authData } = await supabase.auth.getUser();
        const user = authData.user;
        if (!user) {
          if (!cancelled) {
            setLoading(false);
            setAuthRequired(true);
          }
          return;
        }
        const { data, error: fetchError } = await fetchConversations(user.id);
        if (cancelled) return;
        if (fetchError) {
          setError(true);
          setLoading(false);
          return;
        }
        setConversations(data);
        setLoading(false);
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <View style={styles.flex}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <Text style={styles.headerTitle}>{t('tabs.chats')}</Text>
      </SafeAreaView>

      {loading ? (
        <LoadingState />
      ) : authRequired ? (
        <View style={styles.authPromptContainer}>
          <AuthPromptContent />
        </View>
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" message="تعذر تحميل المحادثات" />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState icon="chatbubble-outline" message="لا توجد محادثات بعد" />}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/chat/${item.id}`)}>
              {item.otherParticipant.avatarUrl ? (
                <Image source={{ uri: item.otherParticipant.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={18} color={theme.mutedText} />
                </View>
              )}
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.otherParticipant.fullName ?? 'مستخدم عقارك'}
                </Text>
                <Text style={styles.listingTitle} numberOfLines={1}>
                  {item.listingTitle}
                </Text>
                {item.lastMessageBody && (
                  <Text style={styles.preview} numberOfLines={1}>
                    {item.lastMessageBody}
                  </Text>
                )}
              </View>
              {item.lastMessageAt && <Text style={styles.time}>{timeAgo(item.lastMessageAt)}</Text>}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: theme.background },
    headerTitle: { fontFamily: fonts.headingBold, fontSize: fontSizes.screenTitle, color: theme.headingText },

    authPromptContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },

    listContent: { padding: spacing.lg, flexGrow: 1 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: theme.surfaceAlt },
    avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    info: { flex: 1, gap: 2 },
    name: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    listingTitle: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.accentGold },
    preview: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    time: { fontFamily: fonts.bodyRegular, fontSize: 9, color: theme.mutedText },
  });
}
