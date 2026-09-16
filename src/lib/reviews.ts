import { supabase } from '@/src/lib/supabase';

// ---------------------------------------------------------------------------
// Ratings & Reviews — real, user-to-user only. A review is only ever allowed
// server-side (see reviews_no_self_review + the insert RLS policy in
// 20260908000000_reviews.sql) when a real conversation already exists
// between the two users — the one genuine "these two people actually
// interacted" signal that exists in Dyarna today. The average rating and
// review count are never stored/mutable columns; they're always computed
// live from the real reviews rows (review_stats view), so there is nothing
// for a client to manipulate.
// ---------------------------------------------------------------------------

export type ReviewStats = {
  reviewCount: number;
  averageRating: number | null;
};

export async function fetchReviewStats(revieweeId: string): Promise<{ data: ReviewStats; error: string | null }> {
  const { data, error } = await supabase
    .from('review_stats')
    .select('review_count, average_rating')
    .eq('reviewee_id', revieweeId)
    .maybeSingle();

  return {
    data: {
      reviewCount: data?.review_count ?? 0,
      averageRating: data?.average_rating != null ? Number(data.average_rating) : null,
    },
    error: error?.message ?? null,
  };
}

export type Review = {
  id: string;
  reviewerId: string;
  reviewerName: string | null;
  reviewerAvatarUrl: string | null;
  rating: number;
  body: string;
  createdAt: string;
};

type ReviewRow = {
  id: string;
  reviewer_id: string;
  rating: number;
  body: string;
  created_at: string;
  reviewer: { full_name: string | null; avatar_url: string | null } | null;
};

export async function fetchReviewsForUser(revieweeId: string): Promise<{ data: Review[]; error: string | null }> {
  const { data, error } = await supabase
    .from('reviews')
    .select(
      `id, reviewer_id, rating, body, created_at,
       reviewer:profiles!reviews_reviewer_id_fkey ( full_name, avatar_url )`
    )
    .eq('reviewee_id', revieweeId)
    .order('created_at', { ascending: false })
    .returns<ReviewRow[]>();

  if (error || !data) return { data: [], error: error?.message ?? null };

  return {
    data: data.map((row) => ({
      id: row.id,
      reviewerId: row.reviewer_id,
      reviewerName: row.reviewer?.full_name ?? null,
      reviewerAvatarUrl: row.reviewer?.avatar_url ?? null,
      rating: row.rating,
      body: row.body,
      createdAt: row.created_at,
    })),
    error: null,
  };
}

// The current user's own existing review of this profile, if any — lets
// the "add a review" UI open pre-filled in edit mode instead of silently
// overwriting a past review with a blank form.
export async function fetchMyReview(
  reviewerId: string,
  revieweeId: string
): Promise<{ data: { rating: number; body: string } | null; error: string | null }> {
  const { data, error } = await supabase
    .from('reviews')
    .select('rating, body')
    .eq('reviewer_id', reviewerId)
    .eq('reviewee_id', revieweeId)
    .maybeSingle();
  return { data: data ? { rating: data.rating, body: data.body } : null, error: error?.message ?? null };
}

// Real eligibility check — mirrors the exact condition the insert RLS
// policy itself enforces, so the UI only ever offers "add a review" when
// the write would actually be allowed, not as a security boundary (RLS is
// that boundary; this is just so the button doesn't dead-end).
export async function hasConversationWith(userId: string, otherUserId: string): Promise<boolean> {
  const { data } = await supabase
    .from('conversations')
    .select('id')
    .or(
      `and(buyer_id.eq.${userId},owner_id.eq.${otherUserId}),and(buyer_id.eq.${otherUserId},owner_id.eq.${userId})`
    )
    .limit(1)
    .maybeSingle();
  return data != null;
}

// A real upsert on the (reviewer_id, reviewee_id) unique constraint —
// resubmitting is always an edit of the same one real review, never a
// second row (also enforced at the database level regardless of this).
export async function submitReview(
  reviewerId: string,
  revieweeId: string,
  rating: number,
  body: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('reviews')
    .upsert({ reviewer_id: reviewerId, reviewee_id: revieweeId, rating, body }, { onConflict: 'reviewer_id,reviewee_id' });
  return { error: error?.message ?? null };
}
