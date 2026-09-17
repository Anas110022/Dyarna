import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { fetchConversationHeader, fetchMessages, sendMessage, type ChatMessage, type ConversationHeader } from '@/src/lib/chat';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { LoadingState } from '@/src/components/LoadingState';
import { EmptyState } from '@/src/components/EmptyState';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isRTL } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const listRef = useRef<FlatList>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [header, setHeader] = useState<ConversationHeader | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        if (!id) return;
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
        if (cancelled) return;
        setUserId(user.id);

        const [headerResult, messagesResult] = await Promise.all([fetchConversationHeader(id, user.id), fetchMessages(id)]);
        if (cancelled) return;
        if (headerResult.error || !headerResult.data) {
          setError(true);
          setLoading(false);
          return;
        }
        setHeader(headerResult.data);
        setMessages(messagesResult.data);
        setLoading(false);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [id])
  );

  // Real-time delivery: RLS on `messages` already scopes SELECT to this
  // conversation's two participants, and Realtime enforces that same
  // policy per-event — this channel can never receive a row the current
  // user isn't already allowed to read. Own messages are skipped here
  // since handleSend already appends them locally; this only needs to
  // deliver the OTHER participant's messages live.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`messages:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          const row = payload.new as { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
          if (row.sender_id === userId) return;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [
            ...prev,
            { id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, body: row.body, createdAt: row.created_at },
          ]));
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, userId]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || !userId || !id || sending) return;
    setSending(true);
    const { error: sendError } = await sendMessage(id, userId, body);
    setSending(false);
    if (sendError) {
      // A real, expected rejection from the block-guard trigger (either
      // side blocked the other) — not a generic failure to swallow.
      Alert.alert(sendError.includes('blocked_user') ? 'تعذّر إرسال الرسالة — لم يعد بإمكانكما التراسل' : 'تعذّر إرسال الرسالة');
      return;
    }
    setDraft('');
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, conversationId: id, senderId: userId, body, createdAt: new Date().toISOString() },
    ]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  };

  if (loading) {
    return <LoadingState />;
  }

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  if (error || !header) {
    return <EmptyState icon="cloud-offline-outline" message="تعذر تحميل المحادثة" />;
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <Pressable style={styles.headerBack} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={24} color={theme.headingText} />
        </Pressable>
        <Pressable style={styles.headerCenter} onPress={() => router.push(`/profile/${header.otherParticipant.id}`)}>
          {header.otherParticipant.avatarUrl ? (
            <Image source={{ uri: header.otherParticipant.avatarUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarPlaceholder]}>
              <Ionicons name="person" size={16} color={theme.mutedText} />
            </View>
          )}
          <View>
            <Text style={styles.headerName}>{header.otherParticipant.fullName ?? 'مستخدم عقارك'}</Text>
            <Text style={styles.headerListing} numberOfLines={1}>
              {header.listingTitle}
            </Text>
          </View>
        </Pressable>
        <View style={styles.headerBack} />
      </SafeAreaView>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<EmptyState icon="chatbubble-outline" message="ابدأ المحادثة" />}
        renderItem={({ item }) => {
          const isOwn = item.senderId === userId;
          return (
            <View style={[styles.bubbleRow, { justifyContent: isOwn ? 'flex-start' : 'flex-end' }]}>
              <View style={styles.bubbleColumn}>
                <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                  <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{item.body}</Text>
                </View>
                <Text style={styles.bubbleTime}>{formatTime(item.createdAt)}</Text>
              </View>
            </View>
          );
        }}
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.composerInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="اكتب رسالتك..."
          placeholderTextColor={theme.mutedText}
          multiline
        />
        <Pressable style={styles.sendButton} onPress={handleSend} disabled={sending || draft.trim().length === 0}>
          <Ionicons name="arrow-back" size={16} color={theme.onBrandFill} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      backgroundColor: theme.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerBack: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, justifyContent: 'center' },
    headerAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.surfaceAlt },
    headerAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    headerName: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.headingText },
    headerListing: { fontFamily: fonts.bodyRegular, fontSize: 9.5, color: theme.mutedText, maxWidth: 160 },

    listContent: { padding: spacing.lg, flexGrow: 1 },
    bubbleRow: { flexDirection: 'row', marginBottom: spacing.sm },
    bubbleColumn: { maxWidth: '78%' },
    bubble: { borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    bubbleOwn: { backgroundColor: theme.brandFill },
    bubbleOther: { backgroundColor: theme.surface },
    bubbleText: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.bodyText, lineHeight: 19 },
    bubbleTextOwn: { color: theme.onBrandFill },
    bubbleTime: { fontFamily: fonts.bodyRegular, fontSize: 8.5, color: theme.mutedText, marginTop: 2 },

    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.background,
    },
    composerInput: {
      flex: 1,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.fieldBorder,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontFamily: fonts.bodyRegular,
      fontSize: 12.5,
      color: theme.bodyText,
      maxHeight: 100,
    },
    sendButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.brandFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
