import { supabase } from '@/src/lib/supabase';

export type AuthResult = { error: string | null };

// Supabase's phone OTP is unified: signInWithOtp creates the account on first
// use and logs in on repeat use, so signup and signin share this call.
export async function sendPhoneOtp(phoneE164: string, fullName?: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOtp({
    phone: phoneE164,
    options: fullName ? { data: { full_name: fullName } } : undefined,
  });
  return { error: error?.message ?? null };
}

export async function verifyPhoneOtp(phoneE164: string, token: string): Promise<AuthResult> {
  const { error } = await supabase.auth.verifyOtp({ phone: phoneE164, token, type: 'sms' });
  return { error: error?.message ?? null };
}

// Real 6-digit email OTP, delivered without Supabase's own (link-only, and
// on this project's Free plan un-editable) confirmation email template —
// and without depending on Supabase's own project-configured OTP digit
// length. See supabase/functions/email-otp/index.ts: the Edge Function
// generates and owns the real 6-digit code the user types; once that
// checks out, it hands back Supabase's own internal Auth token (never
// shown to the user) so the app can still finish sign-in through Supabase
// Auth's real verifyOtp call below. The client never creates the account
// directly — the Edge Function does, using the service-role key.
type EmailOtpFunctionResult = { data: { success?: boolean; token?: string } | null; error: string | null };

async function invokeEmailOtpFunction(body: Record<string, unknown>): Promise<EmailOtpFunctionResult> {
  const { data, error } = await supabase.functions.invoke('email-otp', { body });
  if (error) {
    let message = error.message;
    try {
      const parsed = await (error as { context?: Response }).context?.json();
      if (parsed?.error) message = parsed.error;
    } catch {
      // response body wasn't JSON — fall back to the SDK's own error message
    }
    return { data: null, error: message };
  }
  if (data?.error) return { data: null, error: data.error };
  return { data, error: null };
}

export async function signUpWithEmail(email: string, password: string, fullName: string): Promise<AuthResult> {
  const { error } = await invokeEmailOtpFunction({ action: 'send', email, password, fullName });
  return { error };
}

export async function verifyEmailSignupOtp(email: string, token: string): Promise<AuthResult> {
  const { data, error } = await invokeEmailOtpFunction({ action: 'verify', email, code: token });
  if (error) return { error };

  const internalSessionToken = data?.token;
  if (!internalSessionToken) return { error: 'otp_verification_failed' };

  const { error: sessionError } = await supabase.auth.verifyOtp({ email, token: internalSessionToken, type: 'email' });
  return { error: sessionError?.message ?? null };
}

export async function resendEmailSignupOtp(email: string): Promise<AuthResult> {
  const { error } = await invokeEmailOtpFunction({ action: 'resend', email });
  return { error };
}

export async function signInWithEmailPassword(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export async function resetPasswordForEmail(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error: error?.message ?? null };
}
