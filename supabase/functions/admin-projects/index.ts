// Dyarna: real, authorization-gated admin review for pending real-estate
// projects — مراجعة المشاريع. Same exact trust pattern as
// admin-listings/admin-verification/admin-reports (the only precedent in
// this codebase):
//   1. Resolves the caller from their OWN real session token (never a
//      client-supplied id).
//   2. Checks the caller against public.admin_users using the service-role
//      client (that table has no RLS policies at all, so this is the only
//      way to answer "is this caller an admin" — never a client-side flag).
//   3. Only then performs the privileged operation, using the service-role
//      key, which never leaves this function.
//
// This is the real, intended way a project's status ever becomes
// 'published'/'rejected' — the client-side RLS update policy on
// public.projects never lets a developer change `status` themselves.
//
// Request body:
//   { action: "list" }
//   { action: "decide", projectId: string, decision: "published"|"rejected", reason?: string }
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

  let body: { action?: string; projectId?: string; decision?: string; reason?: string };
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
    const { data, error } = await admin
      .from('projects')
      .select(
        `id, title, description, project_type, city, district, governorate_id,
         min_price_usd, max_price_usd, total_units, delivery_status, created_at, developer_id,
         project_images ( storage_path, sort_order ),
         profiles ( full_name, phone, is_verified )`
      )
      .eq('status', 'pending_review')
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) return json({ error: error.message }, 500);
    return json({ projects: data });
  }

  if (action === 'decide') {
    const { projectId, decision, reason } = body;
    if (!projectId || (decision !== 'published' && decision !== 'rejected')) {
      return json({ error: 'invalid_request_body' }, 400);
    }

    const { data: projectRow, error: projectError } = await admin
      .from('projects')
      .select('developer_id, title, status')
      .eq('id', projectId)
      .maybeSingle();
    if (projectError || !projectRow) return json({ error: 'not_found' }, 404);

    if (projectRow.status !== 'pending_review') {
      return json({ error: 'not_pending' }, 409);
    }

    if (decision === 'published') {
      const { count: imageCount } = await admin
        .from('project_images')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId);
      if (!imageCount || imageCount < 1) {
        return json({ error: 'not_enough_photos' }, 409);
      }
    }

    const { data: updatedRows, error: updateError } = await admin
      .from('projects')
      .update({ status: decision })
      .eq('id', projectId)
      .eq('status', 'pending_review')
      .select('id, status');
    if (updateError) return json({ error: updateError.message }, 500);
    if (!updatedRows || updatedRows.length === 0) {
      return json({ error: 'update_matched_no_rows' }, 500);
    }

    const notification =
      decision === 'published'
        ? {
            type: 'project_published',
            title: 'تم نشر مشروعك',
            body: `مشروعك "${projectRow.title}" أصبح ظاهرًا الآن لجميع الزوار.`,
          }
        : {
            type: 'project_rejected',
            title: 'تم رفض مشروعك',
            body: reason ? `تم رفض مشروعك "${projectRow.title}". السبب: ${reason}` : `تم رفض مشروعك "${projectRow.title}".`,
          };

    await admin.from('notifications').insert({
      user_id: projectRow.developer_id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      related_project_id: projectId,
    });

    return json({ success: true });
  }

  return json({ error: 'invalid_request_body' }, 400);
});
