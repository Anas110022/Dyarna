// Dyarna: real account deletion.
//
// The public Supabase client SDK has no "delete my own account" call — only
// the Admin API can delete an auth.users row, which needs the service-role
// key. That key must never ship in the mobile app, so this Edge Function is
// the only place the deletion actually happens.
//
// The caller is identified from their OWN real session token (the
// Authorization header supabase-js already attaches automatically), never
// from a client-supplied id — so a user can only ever delete their own
// account, verified server-side.
//
// Deleting the auth.users row cascades (on delete cascade) through
// profiles, listings, listing_photos, notifications, support_tickets, and
// verification_requests — this is a real, permanent deletion, not a local
// hide.
//
// Before that, this also removes the user's real files from the private
// verification-docs bucket. DB row cascade alone does not touch Storage
// objects, and leaving a deleted user's identity document behind would be
// exactly the kind of orphaned sensitive file a real retention policy must
// not allow.
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Resolve the caller from their own real access token — this is the only
  // source of truth for "who is asking to be deleted".
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) {
    return json({ error: 'unauthorized' }, 401);
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userId = callerData.user.id;

  const { data: docFiles } = await admin.storage.from('verification-docs').list(userId);
  if (docFiles && docFiles.length > 0) {
    await admin.storage.from('verification-docs').remove(docFiles.map((f) => `${userId}/${f.name}`));
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return json({ error: deleteError.message }, 500);
  }

  return json({ success: true });
});
