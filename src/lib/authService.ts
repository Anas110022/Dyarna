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

export async function signUpWithEmail(email: string, password: string, fullName: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  return { error: error?.message ?? null };
}

export async function verifyEmailSignupOtp(email: string, token: string): Promise<AuthResult> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
  return { error: error?.message ?? null };
}

export async function resendEmailSignupOtp(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  return { error: error?.message ?? null };
}

export async function signInWithEmailPassword(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export async function resetPasswordForEmail(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error: error?.message ?? null };
}
