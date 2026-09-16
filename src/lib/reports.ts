import { supabase } from '@/src/lib/supabase';

// ---------------------------------------------------------------------------
// Reports — a single real moderation-queue table covering listings, user
// profiles, and reviews (20260909000000_reports_blocks.sql). Reports are
// private to their own reporter (RLS) — there is no admin review UI yet;
// this is only the real submission path.
// ---------------------------------------------------------------------------

export type ReportTargetType = 'listing' | 'profile' | 'review';
export type ReportReason = 'spam' | 'fraud' | 'inappropriate' | 'fake_listing' | 'harassment' | 'other';

export async function submitReport(
  reporterId: string,
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
  details: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('reports')
    .insert({ reporter_id: reporterId, target_type: targetType, target_id: targetId, reason, details });
  // The real unique constraint (reporter_id, target_type, target_id) means
  // a 23505 here is a genuine "you already reported this" — not a fake
  // dedupe check that a client could get wrong.
  if (error?.code === '23505') return { error: 'already_reported' };
  return { error: error?.message ?? null };
}
