// Dyarna: real 6-digit email OTP signup, without Supabase's built-in
// confirmation-link email template (which this project's Free plan won't
// let us edit without custom SMTP) — and without depending on Supabase
// Auth's own OTP digit length (project-configured, currently 8 here, not
// something this app controls).
//
// The app generates its own real, cryptographically random 6-digit code
// for the user to type. Only its SHA-256 hash and a real expiry are stored
// (public.email_otp_codes) — the plaintext code only ever exists in memory
// here and in the email sent to the user. Once the user's code checks out,
// we still hand off to Supabase's OWN real Auth token (via
// admin.generateLink) to actually create the session — that internal
// token is never shown to the user, so its length doesn't matter.
//
// Request body:
//   { action: "send",   email: string, password: string, fullName: string }
//   { action: "resend", email: string }
//   { action: "verify", email: string, code: string }
//
// Required secrets (already set):
//   RESEND_API_KEY   — your Resend API key
//   RESEND_FROM      — optional; defaults to "Dyarna <onboarding@resend.dev>"
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to
// every Edge Function by the Supabase runtime.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// A real, cryptographically random 6-digit code — never a fixed/predictable
// value.
function generateSixDigitCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % 1_000_000).toString().padStart(6, '0');
}

async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildEmailHtml(code: string): string {
  return `
    <div style="font-family: sans-serif; direction: rtl; text-align: center; padding: 24px;">
      <h2 style="color:#0B2B21;">ديارنا Dyarna</h2>
      <p style="color:#333;">رمز التحقق الخاص بك / Your verification code:</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color:#0B2B21;">${code}</p>
      <p style="color:#777; font-size: 12px;">
        أدخل هذا الرمز في تطبيق ديارنا لتفعيل حسابك.<br/>
        Enter this code in the Dyarna app to activate your account.
      </p>
    </div>
  `;
}

async function sendOtpEmail(email: string, code: string): Promise<string | null> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) return 'RESEND_API_KEY is not configured';

  const from = Deno.env.get('RESEND_FROM') ?? 'Dyarna <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'رمز التحقق من ديارنا / Your Dyarna verification code',
      html: buildEmailHtml(code),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return `Resend error (${res.status}): ${text}`;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let body: { action?: string; email?: string; password?: string; fullName?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_request_body' }, 400);
  }

  const { action, email, password, fullName, code } = body;
  if (!email || (action !== 'send' && action !== 'resend' && action !== 'verify')) {
    return json({ error: 'invalid_request_body' }, 400);
  }
  if (action === 'send' && !password) {
    return json({ error: 'password_required' }, 400);
  }
  if (action === 'verify' && !code) {
    return json({ error: 'invalid_request_body' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (action === 'verify') {
    const { data: row, error: fetchError } = await admin
      .from('email_otp_codes')
      .select('code_hash, expires_at, attempts')
      .eq('email', email)
      .maybeSingle();

    if (fetchError || !row) {
      return json({ error: 'otp_not_found' }, 400);
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await admin.from('email_otp_codes').delete().eq('email', email);
      return json({ error: 'otp_expired' }, 400);
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      await admin.from('email_otp_codes').delete().eq('email', email);
      return json({ error: 'otp_too_many_attempts' }, 400);
    }

    const submittedHash = await hashCode(code!);
    if (submittedHash !== row.code_hash) {
      await admin
        .from('email_otp_codes')
        .update({ attempts: row.attempts + 1 })
        .eq('email', email);
      return json({ error: 'otp_invalid' }, 400);
    }

    // Real 6-digit code the user typed is correct — consume it, then hand
    // off to Supabase's own real Auth token (never shown to the user, so
    // its configured digit length is irrelevant) so the client can
    // establish a real session via the standard verifyOtp call.
    await admin.from('email_otp_codes').delete().eq('email', email);

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData?.properties?.email_otp) {
      return json({ error: linkError?.message ?? 'session_token_generation_failed' }, 500);
    }

    return json({ success: true, token: linkData.properties.email_otp });
  }

  // action === 'send' | 'resend'
  if (action === 'send') {
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });

    if (createError) {
      const alreadyRegistered = createError.message.toLowerCase().includes('already');
      if (!alreadyRegistered) {
        return json({ error: createError.message }, 400);
      }
      // Real pending account already exists (e.g. the user backed out of a
      // previous signup attempt before confirming) — fall through and just
      // send them a fresh real code for that same account.
    }
  }

  if (action === 'resend') {
    // 'resend' is also what the login screen's real sign-in uses to send
    // a code to an existing account. Sign-in must never silently create
    // one — check profiles.email (populated for every real account by the
    // on_auth_user_created trigger) and refuse before generating or
    // emailing anything if there's genuinely no account yet.
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (!existingProfile) {
      return json({ error: 'account_not_found' }, 404);
    }
  }

  const plainCode = generateSixDigitCode();
  const codeHash = await hashCode(plainCode);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: upsertError } = await admin
    .from('email_otp_codes')
    .upsert({ email, code_hash: codeHash, expires_at: expiresAt, attempts: 0 });

  if (upsertError) {
    return json({ error: upsertError.message }, 500);
  }

  const emailError = await sendOtpEmail(email, plainCode);
  if (emailError) {
    return json({ error: emailError }, 502);
  }

  return json({ success: true });
});
