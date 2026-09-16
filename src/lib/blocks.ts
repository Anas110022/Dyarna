import { supabase } from '@/src/lib/supabase';

// ---------------------------------------------------------------------------
// User blocks — real, one-directional relationships a user toggles on
// themselves. The actual effects (no new conversations/messages, listings
// hidden from each other) are enforced server-side (triggers + the
// listings RLS policy in 20260909000000_reports_blocks.sql) regardless of
// what the client does — these functions are just the real read/write path
// for the block relationship itself.
// ---------------------------------------------------------------------------

export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_blocks')
    .select('id')
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
    .maybeSingle();
  return data != null;
}

export async function blockUser(blockerId: string, blockedId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
  return { error: error?.message ?? null };
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
  return { error: error?.message ?? null };
}
