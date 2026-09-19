import { File } from 'expo-file-system';

import { supabase } from '@/src/lib/supabase';
import type { ListingCategory } from '@/src/lib/listingTypes';

// ---------------------------------------------------------------------------
// Profile editing
// ---------------------------------------------------------------------------

export async function updateOwnProfile(
  userId: string,
  updates: { fullName?: string; phone?: string | null; avatarUrl?: string }
): Promise<{ error: string | null }> {
  const payload: Record<string, string | null> = {};
  if (updates.fullName !== undefined) payload.full_name = updates.fullName;
  if (updates.phone !== undefined) payload.phone = updates.phone;
  if (updates.avatarUrl !== undefined) payload.avatar_url = updates.avatarUrl;

  const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
  return { error: error?.message ?? null };
}

// Reads the local photo straight off disk via expo-file-system's native
// File API — RN's fetch()+Blob path for local file:// URIs is a documented
// iOS crash source for real photo-sized payloads. Always the same path per
// user (upsert: true) so a re-upload simply replaces the previous avatar file.
export async function uploadAvatar(userId: string, localUri: string): Promise<{ url: string | null; error: string | null }> {
  const extensionMatch = localUri.split('.').pop()?.split(/[?#]/)[0]?.toLowerCase();
  const extension = extensionMatch && extensionMatch.length <= 5 ? extensionMatch : 'jpg';
  const contentType = extension === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${userId}/avatar.${extension}`;

  const arrayBuffer = await new File(localUri).arrayBuffer();

  const { error } = await supabase.storage.from('avatars').upload(path, arrayBuffer, {
    contentType,
    upsert: true,
  });
  if (error) return { url: null, error: error.message };

  // Cache-bust so the new avatar shows immediately instead of a stale CDN copy
  // at the same path.
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return { url: `${data.publicUrl}?t=${Date.now()}`, error: null };
}

// ---------------------------------------------------------------------------
// Own listings (all statuses — unlike the public profile screen, which only
// ever shows published listings to other users)
// ---------------------------------------------------------------------------

export type ListingStatus = 'pending_review' | 'published' | 'rejected' | 'archived';

export type OwnListingPreview = {
  id: string;
  title: string;
  category: ListingCategory;
  city: string;
  area: string | null;
  priceUsd: number;
  bedrooms: number | null;
  bathrooms: number | null;
  areaSqm: number;
  status: ListingStatus;
  photoUrl: string | null;
};

type OwnListingRow = {
  id: string;
  title: string;
  category: ListingCategory;
  city: string;
  area: string | null;
  price_usd: number;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqm: number;
  status: ListingStatus;
  listing_photos: { storage_path: string; sort_order: number }[] | null;
};

export async function fetchOwnListings(ownerId: string): Promise<{ data: OwnListingPreview[]; error: string | null }> {
  const { data, error } = await supabase
    .from('listings')
    .select('id, title, category, city, area, price_usd, bedrooms, bathrooms, area_sqm, status, listing_photos(storage_path, sort_order)')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .returns<OwnListingRow[]>();

  if (error || !data) return { data: [], error: error?.message ?? null };

  const items: OwnListingPreview[] = data.map((row) => {
    const cover = (row.listing_photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)[0];
    const photoUrl = cover ? supabase.storage.from('listing-photos').getPublicUrl(cover.storage_path).data.publicUrl : null;
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      city: row.city,
      area: row.area,
      priceUsd: row.price_usd,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      areaSqm: row.area_sqm,
      status: row.status,
      photoUrl,
    };
  });

  return { data: items, error: null };
}

// ---------------------------------------------------------------------------
// Notifications — real rows only, created server-side by real events:
// publish_listing_if_eligible (20260903040000_account_features.sql) and
// notify_new_message (20260906000000_message_notifications.sql). The app
// only ever reads them and marks its own as read.
// ---------------------------------------------------------------------------

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  relatedListingId: string | null;
  relatedConversationId: string | null;
  relatedPropertyRequestId: string | null;
  relatedProjectId: string | null;
  relatedBookingListingId: string | null;
  isRead: boolean;
  createdAt: string;
};

export async function fetchNotifications(userId: string): Promise<{ data: NotificationItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from('notifications')
    .select(
      'id, type, title, body, related_listing_id, related_conversation_id, related_property_request_id, related_project_id, related_booking_listing_id, is_read, created_at'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !data) return { data: [], error: error?.message ?? null };

  return {
    data: data.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      relatedListingId: row.related_listing_id,
      relatedConversationId: row.related_conversation_id,
      relatedPropertyRequestId: row.related_property_request_id,
      relatedProjectId: row.related_project_id,
      relatedBookingListingId: row.related_booking_listing_id,
      isRead: row.is_read,
      createdAt: row.created_at,
    })),
    error: null,
  };
}

export async function fetchUnreadNotificationCount(userId: string): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  return { count: count ?? 0, error: error?.message ?? null };
}

export async function markNotificationRead(notificationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
  return { error: error?.message ?? null };
}

// A real bulk update, scoped to the caller's own rows by the existing
// "Users can mark their own notifications read" RLS policy — no new
// policy needed, since that policy already covers any UPDATE matching
// auth.uid() = user_id, one row or many.
export async function markAllNotificationsRead(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------------
// Support tickets — real rows the user creates themselves; no auto-filled
// "success" state unless the insert actually succeeds.
// ---------------------------------------------------------------------------

export type SupportTicket = {
  id: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  createdAt: string;
};

export async function fetchOwnSupportTickets(userId: string): Promise<{ data: SupportTicket[]; error: string | null }> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, message, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return { data: [], error: error?.message ?? null };

  return {
    data: data.map((row) => ({ id: row.id, message: row.message, status: row.status, createdAt: row.created_at })),
    error: null,
  };
}

export async function createSupportTicket(userId: string, message: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('support_tickets').insert({ user_id: userId, message });
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------------
// Account verification — a real document upload + review queue (mirrors the
// existing listing ownership-document pattern). is_verified itself is
// locked down at the database level (see guard_profile_trust_rules in
// 20260903050000_account_v2.sql) so only a real admin review can set it.
// ---------------------------------------------------------------------------

export type VerificationRequestStatus = 'pending' | 'processing' | 'verified' | 'rejected' | 'requires_review' | 'failed';
export type VerificationDocumentType = 'passport' | 'national_id' | 'residence_id';

// No longer settable from the client — verification is now a single
// universal identity check (see src/components/IdentityVerificationStep.tsx),
// so every new verification_requests row has advertiser_type = null. Kept
// only so the admin queue (src/lib/admin.ts, app/admin/verification-queue.tsx)
// can still correctly type/display older requests that do have a value.
export type AdvertiserType = 'owner' | 'broker' | 'host' | 'developer';
export type SecondaryDocType = 'green_deed' | 'office_photo';

export async function fetchLatestVerificationRequest(userId: string): Promise<{
  status: VerificationRequestStatus | null;
  failureReason: string | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('verification_requests')
    .select('status, failure_reason')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { status: data?.status ?? null, failureReason: data?.failure_reason ?? null, error: error?.message ?? null };
}

// Real document upload — accepts either a Photos-picked image or a
// Files-picked document (image or PDF), so the real file name/MIME type
// from whichever real picker was used is trusted over guessing from the
// URI, which is unreliable for Files-sourced PDFs. `docKind` only affects
// the real storage path's file name (e.g. "green-deed", "office-photo") so
// multiple real documents for one request don't collide/overwrite.
export async function uploadVerificationDoc(
  userId: string,
  localUri: string,
  fileName?: string | null,
  mimeType?: string | null,
  docKind: string = 'id-doc'
): Promise<{ path: string | null; error: string | null }> {
  const nameSource = fileName || localUri;
  const extensionMatch = nameSource.split('.').pop()?.split(/[?#]/)[0]?.toLowerCase();
  const extension =
    extensionMatch && extensionMatch.length <= 5 ? extensionMatch : mimeType === 'application/pdf' ? 'pdf' : 'jpg';
  const contentType = mimeType || (extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : 'image/jpeg');
  const path = `${userId}/${docKind}-${Date.now()}.${extension}`;

  const arrayBuffer = await new File(localUri).arrayBuffer();

  const { error } = await supabase.storage.from('verification-docs').upload(path, arrayBuffer, {
    contentType,
    upsert: true,
  });
  return { path: error ? null : path, error: error?.message ?? null };
}

export async function submitVerificationRequest(
  userId: string,
  docStoragePath: string,
  documentType: VerificationDocumentType,
  advertiser?: {
    advertiserType: AdvertiserType;
    secondaryDocStoragePath?: string | null;
    secondaryDocType?: SecondaryDocType | null;
    companyName?: string | null;
    companyAddress?: string | null;
    companyDescription?: string | null;
    companyLicenseNumber?: string | null;
  }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('verification_requests').insert({
    user_id: userId,
    doc_storage_path: docStoragePath,
    document_type: documentType,
    advertiser_type: advertiser?.advertiserType ?? null,
    secondary_doc_storage_path: advertiser?.secondaryDocStoragePath ?? null,
    secondary_doc_type: advertiser?.secondaryDocType ?? null,
    company_name: advertiser?.companyName ?? null,
    company_address: advertiser?.companyAddress ?? null,
    company_description: advertiser?.companyDescription ?? null,
    company_license_number: advertiser?.companyLicenseNumber ?? null,
  });
  // The DB's partial unique index (one active request per user) is the
  // real guard against duplicate/abuse submissions — a 23505 here means
  // the user already has one pending/processing/requires_review request.
  if (error?.code === '23505') return { error: 'duplicate_active_request' };
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------------
// Change password — re-verifies the real current password via
// signInWithPassword (the only real way to check it) before applying the
// new one. Only meaningful for email accounts (phone accounts never set a
// password).
// ---------------------------------------------------------------------------

export async function changePassword(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<{ error: string | null }> {
  const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (reauthError) return { error: 'current_password_incorrect' };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------------
// Notification preferences — real, persisted server-side (profiles table)
// so it actually gates the real notification-creation logic in
// publish_listing_if_eligible, not just a local UI switch.
// ---------------------------------------------------------------------------

export async function fetchNotifyOnListingPublished(userId: string): Promise<{ enabled: boolean; error: string | null }> {
  const { data, error } = await supabase.from('profiles').select('notify_on_listing_published').eq('id', userId).maybeSingle();
  return { enabled: data?.notify_on_listing_published ?? true, error: error?.message ?? null };
}

export async function setNotifyOnListingPublished(userId: string, enabled: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.from('profiles').update({ notify_on_listing_published: enabled }).eq('id', userId);
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------------
// Delete account — real, permanent deletion via the delete-account Edge
// Function (needs the service-role key, which never ships in this app —
// see supabase/functions/delete-account/index.ts). Cascades through every
// table that references the user.
// ---------------------------------------------------------------------------

export async function deleteOwnAccount(): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) {
    let message = error.message;
    try {
      const parsed = await (error as { context?: Response }).context?.json();
      if (parsed?.error) message = parsed.error;
    } catch {
      // response body wasn't JSON — fall back to the SDK's own error message
    }
    return { error: message };
  }
  if (data?.error) return { error: data.error };
  return { error: null };
}
