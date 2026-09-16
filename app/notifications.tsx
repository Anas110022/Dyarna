import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type NotificationItem } from '@/src/lib/account';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';
import { AppHeader } from '@/src/components/AppHeader';
import { EmptyState } from '@/src/components/EmptyState';
import { LoadingState } from '@/src/components/LoadingState';

function timeAgo(iso: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t('notifications.justNow');
  if (minutes < 60) return t('notifications.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('notifications.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  return t('notifications.daysAgo', { count: days });
}

export default function NotificationsScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
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
        setUserId(user.id);
        const { data, error: fetchError } = await fetchNotifications(user.id);
        if (cancelled) return;
        if (fetchError) {
          setError(true);
          setLoading(false);
          return;
        }
        setItems(data);
        setLoading(false);
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const hasUnread = items.some((item) => !item.isRead);

  const handleMarkAllRead = async () => {
    if (!userId || markingAll || !hasUnread) return;
    setMarkingAll(true);
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    const { error: markError } = await markAllNotificationsRead(userId);
    setMarkingAll(false);
    if (markError) {
      // Real failure — re-fetch the real state rather than trust the
      // optimistic update.
      const { data } = await fetchNotifications(userId);
      setItems(data);
    }
  };

  const handlePress = async (item: NotificationItem) => {
    if (!item.isRead) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      markNotificationRead(item.id);
    }
    if (item.relatedConversationId) {
      router.push(`/chat/${item.relatedConversationId}`);
    } else if (item.type === 'property_request_match' && item.relatedListingId) {
      // Customer's "new match" notification: carries the exact matched
      // listing, so it opens that property directly rather than the
      // owner's matches queue below.
      router.push(`/listing/${item.relatedListingId}`);
    } else if (item.type === 'property_request_match') {
      // Owner's "new request matched your listing" notification never
      // sets related_listing_id — unchanged, still opens their queue.
      router.push('/property-request-matches');
    } else if (item.type === 'property_request_response' && item.relatedPropertyRequestId) {
      router.push(`/property-request/${item.relatedPropertyRequestId}`);
    } else if (
      (item.type === 'project_interest' || item.type === 'project_published' || item.type === 'project_rejected') &&
      item.relatedProjectId
    ) {
      router.push(`/project/${item.relatedProjectId}`);
    } else if (item.type === 'booking_request') {
      // Owner's "new booking request" — lands on their real requests inbox,
      // same reasoning as property_request_match's owner branch above.
      router.push('/owner-bookings');
    } else if (item.type === 'booking_confirmed' || item.type === 'booking_rejected' || item.type === 'booking_cancelled') {
      // Guest's "your booking status changed" — their own reservations list.
      router.push('/my-bookings');
    } else if (item.type === 'booking_listing_published' && item.relatedBookingListingId) {
      router.push(`/booking-settings/${item.relatedBookingListingId}`);
    } else if (item.relatedListingId) {
      router.push(`/listing/${item.relatedListingId}`);
    }
  };

  if (authRequired) {
    return <AuthRequiredScreen />;
  }

  return (
    <View style={styles.flex}>
      <AppHeader
        title={t('account.notifications')}
        rightElement={
          hasUnread ? (
            <Pressable onPress={handleMarkAllRead} disabled={markingAll} style={styles.markAllButton} hitSlop={8}>
              <Text style={styles.markAllText}>{t('notifications.markAllRead')}</Text>
            </Pressable>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" message={t('account.loadError')} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState icon="notifications-outline" message={t('notifications.empty')} />}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => handlePress(item)}>
              <View style={[styles.iconCircle, item.isRead && styles.iconCircleRead]}>
                <Ionicons
                  name={
                    item.type === 'new_message'
                      ? 'chatbubble-outline'
                      : item.type === 'property_request_match' || item.type === 'property_request_response'
                        ? 'search-outline'
                        : item.type === 'project_interest' || item.type === 'project_published' || item.type === 'project_rejected'
                          ? 'business-outline'
                          : item.type === 'booking_request' ||
                              item.type === 'booking_confirmed' ||
                              item.type === 'booking_rejected' ||
                              item.type === 'booking_cancelled' ||
                              item.type === 'booking_listing_published'
                            ? 'calendar-outline'
                            : 'shield-checkmark'
                  }
                  size={16}
                  color={item.isRead ? theme.mutedText : theme.success}
                />
              </View>
              <View style={styles.info}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body} numberOfLines={2}>
                  {item.body}
                </Text>
                <Text style={styles.time}>{timeAgo(item.createdAt, t)}</Text>
              </View>
              {!item.isRead && <View style={styles.unreadDot} />}
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
    markAllButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
    markAllText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText },

    listContent: { padding: spacing.lg, flexGrow: 1 },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
      backgroundColor: theme.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      alignItems: 'flex-start',
    },
    iconCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: `${theme.success}20`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCircleRead: { backgroundColor: theme.surfaceAlt },
    info: { flex: 1, gap: 2 },
    title: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },
    body: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    time: { fontFamily: fonts.bodyRegular, fontSize: 9, color: theme.mutedText, marginTop: 2 },
    unreadDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: theme.accentGold, marginTop: 4 },
  });
}
