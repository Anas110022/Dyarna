// Dyarna: real, authorization-gated admin review queue for user reports
// (listings, profiles, reviews) — same trust pattern as admin-verification,
// kept as its own function so the two moderation domains stay independent.
//
// This is the ONLY place reports.reporter_id/target_id are ever resolved
// against the real underlying content for an admin to see. Every action:
//   1. Resolves the caller from their OWN real session token (never a
//      client-supplied id).
//   2. Checks the caller against public.admin_users using the service-role
//      client (that table has no RLS policies at all — the only way to
//      answer "is this caller an admin" server-side).
//   3. Only then performs the privileged read/write, using the
//      service-role key, which never leaves this function.
//
// Request body:
//   { action: "list" }
//   { action: "decide", reportId: string, status: "reviewed"|"dismissed"|"actioned" }
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// provided automatically to every Edge Function by the Supabase runtime.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: { action?: string; reportId?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_request_body' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) {
    return json({ error: 'unauthorized' }, 401);
  }
  const callerId = callerData.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: adminRow } = await admin.from('admin_users').select('user_id').eq('user_id', callerId).maybeSingle();
  if (!adminRow) {
    return json({ error: 'forbidden' }, 403);
  }

  const { action } = body;

  if (action === 'list') {
    const { data: reports, error } = await admin
      .from('reports')
      .select(
        `id, reporter_id, target_type, target_id, reason, details, status, created_at,
         reporter:profiles!reports_reporter_id_fkey ( full_name, phone, email )`
      )
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) return json({ error: error.message }, 500);

    // target_id is polymorphic (points at listings/profiles/reviews
    // depending on target_type) — resolved here in a few batched queries
    // rather than one query per report row.
    const listingIds = [...new Set(reports.filter((r) => r.target_type === 'listing').map((r) => r.target_id))];
    const profileIds = [...new Set(reports.filter((r) => r.target_type === 'profile').map((r) => r.target_id))];
    const reviewIds = [...new Set(reports.filter((r) => r.target_type === 'review').map((r) => r.target_id))];

    const [listingsRes, profilesRes, reviewsRes] = await Promise.all([
      listingIds.length
        ? admin.from('listings').select('id, title, status').in('id', listingIds)
        : Promise.resolve({ data: [] as { id: string; title: string; status: string }[] }),
      profileIds.length
        ? admin.from('profiles').select('id, full_name, phone, email').in('id', profileIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null; phone: string | null; email: string | null }[] }),
      reviewIds.length
        ? admin.from('reviews').select('id, body, rating, reviewee_id').in('id', reviewIds)
        : Promise.resolve({ data: [] as { id: string; body: string; rating: number; reviewee_id: string }[] }),
    ]);

    const listingMap = new Map((listingsRes.data ?? []).map((row) => [row.id, row]));
    const profileMap = new Map((profilesRes.data ?? []).map((row) => [row.id, row]));
    const reviewMap = new Map((reviewsRes.data ?? []).map((row) => [row.id, row]));

    const enriched = reports.map((r) => ({
      ...r,
      target:
        r.target_type === 'listing'
          ? (listingMap.get(r.target_id) ?? null)
          : r.target_type === 'profile'
            ? (profileMap.get(r.target_id) ?? null)
            : (reviewMap.get(r.target_id) ?? null),
    }));

    return json({ reports: enriched });
  }

  if (action === 'decide') {
    const { reportId, status } = body;
    if (!reportId || (status !== 'reviewed' && status !== 'dismissed' && status !== 'actioned')) {
      return json({ error: 'invalid_request_body' }, 400);
    }

    const { data: updated, error } = await admin.from('reports').update({ status }).eq('id', reportId).select('id, status');
    if (error) return json({ error: error.message }, 500);
    if (!updated || updated.length === 0) return json({ error: 'update_matched_no_rows' }, 500);

    return json({ success: true });
  }

  return json({ error: 'invalid_request_body' }, 400);
});
