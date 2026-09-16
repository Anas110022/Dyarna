import { supabase } from '@/src/lib/supabase';
import type { AdvertiserType, SecondaryDocType, VerificationDocumentType, VerificationRequestStatus } from '@/src/lib/account';
import type { ListingCategory } from '@/src/lib/listingTypes';
import type { ProjectDeliveryStatus, ProjectType } from '@/src/lib/projectTypes';

// Every function here is a thin client for the admin-verification Edge
// Function — the ONLY place that ever checks public.admin_users or reads a
// verification document. There is no client-side admin flag anywhere: the
// server decides authorization on every single call, using the caller's
// real current Supabase session (supabase.functions.invoke attaches it
// automatically). A non-admin calling any of these gets a real 403 from
// the server, not a UI-level "hidden button" pretending to be security.

type AdminFunctionResult<T> = { data: T | null; error: string | null; forbidden: boolean };

async function invokeAdminFunction<T>(body: Record<string, unknown>): Promise<AdminFunctionResult<T>> {
  const { data, error } = await supabase.functions.invoke('admin-verification', { body });
  if (error) {
    const status = (error as { context?: Response }).context?.status;
    let message = error.message;
    try {
      const parsed = await (error as { context?: Response }).context?.json();
      if (parsed?.error) message = parsed.error;
    } catch {
      // response body wasn't JSON — fall back to the SDK's own error message
    }
    return { data: null, error: message, forbidden: status === 403 || status === 401 };
  }
  if (data?.error) return { data: null, error: data.error, forbidden: false };
  return { data: data as T, error: null, forbidden: false };
}

// Real, server-verified admin check — a non-admin gets a real 403 from
// admin-verification (surfaced here as isAdmin: false), never a
// client-side flag or a hardcoded user id. Callers should treat network
// failures as "not admin" (fail closed), never as "admin".
export async function checkIsAdmin(): Promise<boolean> {
  const result = await invokeAdminFunction<{ isAdmin: boolean }>({ action: 'check_admin' });
  return result.data?.isAdmin === true;
}

export type AdminVerificationRequest = {
  id: string;
  user_id: string;
  document_type: VerificationDocumentType | null;
  status: VerificationRequestStatus;
  doc_storage_path: string;
  created_at: string;
  updated_at: string;
  advertiser_type: AdvertiserType | null;
  secondary_doc_type: SecondaryDocType | null;
  secondary_doc_storage_path: string | null;
  company_name: string | null;
  company_description: string | null;
  company_address: string | null;
  company_license_number: string | null;
  profiles: { full_name: string | null; phone: string | null; email: string | null } | null;
};

export async function fetchAdminVerificationQueue(): Promise<AdminFunctionResult<AdminVerificationRequest[]>> {
  const result = await invokeAdminFunction<{ requests: AdminVerificationRequest[] }>({ action: 'list' });
  if (result.error || !result.data) return { data: null, error: result.error, forbidden: result.forbidden };
  return { data: result.data.requests, error: null, forbidden: false };
}

export async function fetchAdminDocumentSignedUrl(
  requestId: string,
  docField: 'primary' | 'secondary' = 'primary'
): Promise<AdminFunctionResult<{ signedUrl: string; expiresInSeconds: number }>> {
  return invokeAdminFunction({ action: 'get_signed_url', requestId, docField });
}

export async function decideAdminVerification(
  requestId: string,
  decision: 'verified' | 'rejected' | 'requires_review',
  reason?: string
): Promise<AdminFunctionResult<{ success: boolean }>> {
  return invokeAdminFunction({ action: 'decide', requestId, decision, reason });
}

// Separate Edge Function (admin-reports) — same trust pattern, kept
// independent from admin-verification so the two moderation domains never
// share a deploy. checkIsAdmin above already covers both: admin_users is a
// single global table, not per-domain.
async function invokeAdminReportsFunction<T>(body: Record<string, unknown>): Promise<AdminFunctionResult<T>> {
  const { data, error } = await supabase.functions.invoke('admin-reports', { body });
  if (error) {
    const status = (error as { context?: Response }).context?.status;
    let message = error.message;
    try {
      const parsed = await (error as { context?: Response }).context?.json();
      if (parsed?.error) message = parsed.error;
    } catch {
      // response body wasn't JSON — fall back to the SDK's own error message
    }
    return { data: null, error: message, forbidden: status === 403 || status === 401 };
  }
  if (data?.error) return { data: null, error: data.error, forbidden: false };
  return { data: data as T, error: null, forbidden: false };
}

export type AdminReportTargetType = 'listing' | 'profile' | 'review';
export type AdminReportStatus = 'open' | 'reviewed' | 'dismissed' | 'actioned';

export type AdminReportTarget =
  | { id: string; title: string; status: string } // listing
  | { id: string; full_name: string | null; phone: string | null; email: string | null } // profile
  | { id: string; body: string; rating: number; reviewee_id: string } // review
  | null;

export type AdminReport = {
  id: string;
  reporter_id: string;
  target_type: AdminReportTargetType;
  target_id: string;
  reason: string;
  details: string | null;
  status: AdminReportStatus;
  created_at: string;
  reporter: { full_name: string | null; phone: string | null; email: string | null } | null;
  target: AdminReportTarget;
};

export async function fetchAdminReportsQueue(): Promise<AdminFunctionResult<AdminReport[]>> {
  const result = await invokeAdminReportsFunction<{ reports: AdminReport[] }>({ action: 'list' });
  if (result.error || !result.data) return { data: null, error: result.error, forbidden: result.forbidden };
  return { data: result.data.reports, error: null, forbidden: false };
}

export async function decideAdminReport(
  reportId: string,
  status: 'reviewed' | 'dismissed' | 'actioned'
): Promise<AdminFunctionResult<{ success: boolean }>> {
  return invokeAdminReportsFunction({ action: 'decide', reportId, status });
}

// Separate Edge Function (admin-listings) — same trust pattern, kept
// independent so the moderation domains never share a deploy. This is
// the real, intended caller of guard_listing_trust_rules()'s
// service-role-only branch (20260902000000_listings.sql) — the only way
// a listing can ever become published or rejected without its owner
// having self-published.
async function invokeAdminListingsFunction<T>(body: Record<string, unknown>): Promise<AdminFunctionResult<T>> {
  const { data, error } = await supabase.functions.invoke('admin-listings', { body });
  if (error) {
    const status = (error as { context?: Response }).context?.status;
    let message = error.message;
    try {
      const parsed = await (error as { context?: Response }).context?.json();
      if (parsed?.error) message = parsed.error;
    } catch {
      // response body wasn't JSON — fall back to the SDK's own error message
    }
    return { data: null, error: message, forbidden: status === 403 || status === 401 };
  }
  if (data?.error) return { data: null, error: data.error, forbidden: false };
  return { data: data as T, error: null, forbidden: false };
}

export type AdminListingPhoto = { storage_path: string; sort_order: number };

export type AdminPendingListing = {
  id: string;
  title: string;
  description: string;
  listing_type: 'sale' | 'rent';
  category: ListingCategory;
  price_usd: number;
  city: string;
  area: string | null;
  governorate_id: string;
  created_at: string;
  owner_id: string;
  listing_photos: AdminListingPhoto[];
  profiles: { full_name: string | null; phone: string | null; is_verified: boolean } | null;
};

export async function fetchAdminListingsQueue(): Promise<AdminFunctionResult<AdminPendingListing[]>> {
  const result = await invokeAdminListingsFunction<{ listings: AdminPendingListing[] }>({ action: 'list' });
  if (result.error || !result.data) return { data: null, error: result.error, forbidden: result.forbidden };
  return { data: result.data.listings, error: null, forbidden: false };
}

export async function decideAdminListing(
  listingId: string,
  decision: 'published' | 'rejected',
  reason?: string
): Promise<AdminFunctionResult<{ success: boolean }>> {
  return invokeAdminListingsFunction({ action: 'decide', listingId, decision, reason });
}

// Separate Edge Function (admin-projects) — same trust pattern, kept
// independent so the moderation domains never share a deploy. This is the
// only way a project's status ever becomes published/rejected — the
// client-side RLS update policy on public.projects never lets a developer
// change `status` themselves.
async function invokeAdminProjectsFunction<T>(body: Record<string, unknown>): Promise<AdminFunctionResult<T>> {
  const { data, error } = await supabase.functions.invoke('admin-projects', { body });
  if (error) {
    const status = (error as { context?: Response }).context?.status;
    let message = error.message;
    try {
      const parsed = await (error as { context?: Response }).context?.json();
      if (parsed?.error) message = parsed.error;
    } catch {
      // response body wasn't JSON — fall back to the SDK's own error message
    }
    return { data: null, error: message, forbidden: status === 403 || status === 401 };
  }
  if (data?.error) return { data: null, error: data.error, forbidden: false };
  return { data: data as T, error: null, forbidden: false };
}

export type AdminProjectImage = { storage_path: string; sort_order: number };

export type AdminPendingProject = {
  id: string;
  title: string;
  description: string;
  project_type: ProjectType;
  city: string;
  district: string | null;
  governorate_id: string;
  min_price_usd: number | null;
  max_price_usd: number | null;
  total_units: number | null;
  delivery_status: ProjectDeliveryStatus;
  created_at: string;
  developer_id: string;
  project_images: AdminProjectImage[];
  profiles: { full_name: string | null; phone: string | null; is_verified: boolean } | null;
};

export async function fetchAdminProjectsQueue(): Promise<AdminFunctionResult<AdminPendingProject[]>> {
  const result = await invokeAdminProjectsFunction<{ projects: AdminPendingProject[] }>({ action: 'list' });
  if (result.error || !result.data) return { data: null, error: result.error, forbidden: result.forbidden };
  return { data: result.data.projects, error: null, forbidden: false };
}

export async function decideAdminProject(
  projectId: string,
  decision: 'published' | 'rejected',
  reason?: string
): Promise<AdminFunctionResult<{ success: boolean }>> {
  return invokeAdminProjectsFunction({ action: 'decide', projectId, decision, reason });
}
