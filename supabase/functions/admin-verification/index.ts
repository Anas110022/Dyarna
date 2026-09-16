// Dyarna: real, authorization-gated admin verification review.
//
// This is the ONLY place identity documents can ever be read by anyone
// other than the user who uploaded them. Every action here:
//   1. Resolves the caller from their OWN real session token (never a
//      client-supplied id).
//   2. Checks the caller against public.admin_users using the service-role
//      client (that table has no RLS policies at all, so this is the only
//      way to answer "is this caller an admin" — never a client-side flag).
//   3. Only then performs the privileged operation, using the service-role
//      key, which never leaves this function.
//
// Request body:
//   { action: "list" }
//   { action: "get_signed_url", requestId: string, docField?: "primary"|"secondary" }
//   { action: "decide", requestId: string, decision: "verified"|"rejected"|"requires_review", reason?: string }
//
// "secondary" documents (الطابو الأخضر for owner, صورة مقر المكتب for
// broker — see 20260910000000_advertiser_verification.sql) are signed the
// same way as the primary ID document, never exposed by any other path.
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// provided automatically to every Edge Function by the Supabase runtime.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes — short-lived, per spec.

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

  let body: { action?: string; requestId?: string; decision?: string; reason?: string; docField?: 'primary' | 'secondary' };
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

  // A cheap, dedicated presence check — used by the app to decide whether
  // to show the admin entry point at all, without pulling real applicant
  // data (name/phone/email) into memory just to render a menu row. Reaching
  // this line already proves admin_users membership (the check above would
  // have returned 403 otherwise), so there's nothing further to look up.
  if (action === 'check_admin') {
    return json({ isAdmin: true });
  }

  if (action === 'list') {
    const { data, error } = await admin
      .from('verification_requests')
      .select(
        `id, user_id, document_type, status, doc_storage_path, created_at, updated_at,
         advertiser_type, secondary_doc_type, secondary_doc_storage_path,
         company_name, company_description, company_address, company_license_number,
         profiles(full_name, phone, email)`
      )
      .in('status', ['pending', 'processing', 'requires_review'])
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) return json({ error: error.message }, 500);
    return json({ requests: data });
  }

  if (action === 'get_signed_url') {
    if (!body.requestId) return json({ error: 'invalid_request_body' }, 400);

    const { data: reqRow, error: reqError } = await admin
      .from('verification_requests')
      .select('doc_storage_path, secondary_doc_storage_path')
      .eq('id', body.requestId)
      .maybeSingle();
    if (reqError || !reqRow) return json({ error: 'not_found' }, 404);

    const targetPath = body.docField === 'secondary' ? reqRow.secondary_doc_storage_path : reqRow.doc_storage_path;
    if (!targetPath) return json({ error: 'not_found' }, 404);

    const { data: signed, error: signError } = await admin.storage
      .from('verification-docs')
      .createSignedUrl(targetPath, SIGNED_URL_TTL_SECONDS);
    if (signError || !signed) return json({ error: signError?.message ?? 'signing_failed' }, 500);

    return json({ signedUrl: signed.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
  }

  if (action === 'decide') {
    const { requestId, decision, reason } = body;
    if (!requestId || (decision !== 'verified' && decision !== 'rejected' && decision !== 'requires_review')) {
      return json({ error: 'invalid_request_body' }, 400);
    }

    const { data: reqRow, error: reqError } = await admin
      .from('verification_requests')
      .select('user_id, doc_storage_path, secondary_doc_storage_path, status')
      .eq('id', requestId)
      .maybeSingle();
    if (reqError || !reqRow) return json({ error: 'not_found' }, 404);

    const isTerminal = decision === 'verified' || decision === 'rejected';
    const { data: updatedRows, error: updateError } = await admin
      .from('verification_requests')
      .update({
        status: decision,
        failure_reason: decision === 'rejected' ? (reason ?? null) : null,
        completed_at: isTerminal ? new Date().toISOString() : null,
      })
      .eq('id', requestId)
      .select('id, status');
    console.log('decide: verification_requests update', JSON.stringify({ requestId, decision, updateError, updatedRows }));
    if (updateError) return json({ error: updateError.message }, 500);
    if (!updatedRows || updatedRows.length === 0) {
      console.log('decide: update matched zero rows', JSON.stringify({ requestId }));
      return json({ error: 'update_matched_no_rows' }, 500);
    }

    if (decision === 'verified') {
      const { data: updatedProfile, error: profileError } = await admin
        .from('profiles')
        .update({ is_verified: true })
        .eq('id', reqRow.user_id)
        .select('id, is_verified');
      console.log('decide: profiles update', JSON.stringify({ ownerId: reqRow.user_id, profileError, updatedProfile }));
      if (profileError) return json({ error: profileError.message }, 500);
      if (!updatedProfile || updatedProfile.length === 0) {
        console.log('decide: profile update matched zero rows', JSON.stringify({ ownerId: reqRow.user_id }));
        return json({ error: 'profile_update_matched_no_rows' }, 500);
      }
    }

    // Real, immediate secure deletion of the sensitive document once it's
    // no longer needed for an active review — retention minimization, not
    // just a policy statement. Verified documents are kept as the audit
    // record backing an active "موثّق" badge.
    if (decision === 'rejected') {
      const pathsToRemove = [reqRow.doc_storage_path, reqRow.secondary_doc_storage_path].filter(
        (p): p is string => !!p
      );
      await admin.storage.from('verification-docs').remove(pathsToRemove);
    }

    return json({ success: true });
  }

  return json({ error: 'invalid_request_body' }, 400);
});
