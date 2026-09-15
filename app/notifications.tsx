import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { colors, fonts, radii, spacing } from '@/src/theme';
import { supabase } from '@/src/lib/supabase';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type NotificationItem } from '@/src/lib/account';
import { AuthRequiredScreen } from '@/src/components/AuthPrompt';

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
      <SafeAreaView edges={['top']} style={styles.header}>
        <Pressable style={styles.headerBack} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-forward" size={20} color={colors.pine} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('account.notifications')}</Text>
        {hasUnread ? (
          <Pressable onPress={handleMarkAllRead} disabled={markingAll} style={styles.markAllButton} hitSlop={8}>
            <Text style={styles.markAllText}>{t('notifications.markAllRead')}</Text>
          </Pressable>
        ) : (
          <View style={styles.headerBack} />
        )}
      </SafeAreaView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.pine} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.inkSoft} />
          <Text style={styles.emptyText}>{t('account.loadError')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="notifications-outline" size={32} color={colors.inkSoft} />
              <Text style={styles.emptyText}>{t('notifications.empty')}</Text>
            </View>
          }
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
                  color={item.isRead ? colors.inkSoft : '#2BAA5E'}
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
  markAllButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  markAllText: { fontFamily: fonts.headingBold, fontSize: 10.5, color: colors.pine },
  headerTitle: { fontFamily: fonts.headingBold, fontSize: 15, color: colors.pine },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xxl },
  emptyText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft },

  listContent: { padding: spacing.lg, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EAF6EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleRead: { backgroundColor: colors.ivory2 },
  info: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.headingBold, fontSize: 11.5, color: colors.ink },
  body: { fontFamily: fonts.bodyRegular, fontSize: 10.5, color: colors.inkSoft },
  time: { fontFamily: fonts.bodyRegular, fontSize: 9, color: '#C7BFA6', marginTop: 2 },
  unreadDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.gold, marginTop: 4 },
});
