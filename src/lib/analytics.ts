import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/src/lib/supabase';

// إحصائيات إعلاني — real view events, real aggregated owner stats. Every
// call here goes through the two real SECURITY DEFINER RPCs added in
// 20260927000000_listing_analytics.sql (record_listing_view /
// get_owner_listing_stats) — the client never writes to listing_views
// directly (there is no client insert policy for it) and never reads raw
// event rows, only the server's own aggregation.

const ANON_SESSION_KEY = 'dyarna.anonViewSessionId';

// A stable, non-identifying id for a guest device — reused across app
// launches so repeat guest views of the same listing still dedup
// correctly, without ever storing anything about who the guest actually
// is. Ignored server-side whenever a real authenticated session exists.
async function getAnonSessionId(): Promise<string> {
  const existing = await AsyncStorage.getItem(ANON_SESSION_KEY);
  if (existing) return existing;
  const generated = `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(ANON_SESSION_KEY, generated);
  return generated;
}

export async function recordListingView(target: { listingId?: string; bookingListingId?: string }): Promise<void> {
  const sessionId = await getAnonSessionId();
  await supabase.rpc('record_listing_view', {
    p_listing_id: target.listingId ?? null,
    p_booking_listing_id: target.bookingListingId ?? null,
    p_session_id: sessionId,
  });
}

export type ViewTrendPoint = { day: string; count: number };

export type OwnerListingStats = {
  viewsTotal: number;
  viewsTrend: ViewTrendPoint[];
  bookingRequests: number;
  bookingsAccepted: number;
  bookingsRejected: number;
  matchedRequests: number;
};

// periodDays: null = "الكل" (all time, no trend — a trend needs a bounded
// window to be a meaningful chart, so it's only computed for a real period).
export async function fetchOwnerListingStats(
  target: { listingId?: string; bookingListingId?: string },
  periodDays: number | null
): Promise<{ data: OwnerListingStats | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_owner_listing_stats', {
    p_listing_id: target.listingId ?? null,
    p_booking_listing_id: target.bookingListingId ?? null,
    p_period_days: periodDays,
  });
  if (error || !data) return { data: null, error: error?.message ?? null };

  const raw = data as {
    viewsTotal: number;
    viewsTrend: { day: string; count: number }[];
    bookingRequests: number;
    bookingsAccepted: number;
    bookingsRejected: number;
    matchedRequests: number;
  };

  return {
    data: {
      viewsTotal: raw.viewsTotal,
      viewsTrend: raw.viewsTrend ?? [],
      bookingRequests: raw.bookingRequests,
      bookingsAccepted: raw.bookingsAccepted,
      bookingsRejected: raw.bookingsRejected,
      matchedRequests: raw.matchedRequests,
    },
    error: null,
  };
}
