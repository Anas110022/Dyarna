// طلب عقار — الخدمات → طلب عقار. A real, standalone customer request
// ("I'm looking for X"), never a listing itself. Reuses the real,
// existing real-estate taxonomy (ListingCategory/DealType from
// listingTypes.ts, amenity_types, governorates) rather than a second
// property-type/feature system — see 20260922000000_property_requests.sql.
//
// Matching + owner notification + owner response is real, server-side,
// and automatic — see 20260923000000_property_request_matching.sql. The
// client never computes a match itself; it only ever reads what the real
// SECURITY DEFINER trigger already wrote (property_request_matches /
// property_request_responses), same trust boundary as every other
// domain in this app.

import { supabase } from '@/src/lib/supabase';
import type { ListingCategory, DealType } from '@/src/lib/listingTypes';

export type PropertyRequestStatus = 'active' | 'closed' | 'cancelled';

export type PropertyRequest = {
  id: string;
  userId: string;
  requestType: DealType;
  propertyType: ListingCategory;
  governorateId: string | null;
  governorateNameAr: string | null;
  governorateNameEn: string | null;
  city: string | null;
  neighborhood: string | null;
  minPriceUsd: number | null;
  maxPriceUsd: number | null;
  minRooms: number | null;
  minBathrooms: number | null;
  requestedFeatures: string[];
  notes: string | null;
  status: PropertyRequestStatus;
  createdAt: string;
  updatedAt: string;
};

type PropertyRequestRow = {
  id: string;
  user_id: string;
  request_type: DealType;
  property_type: ListingCategory;
  governorate_id: string | null;
  city: string | null;
  neighborhood: string | null;
  min_price_usd: number | null;
  max_price_usd: number | null;
  min_rooms: number | null;
  min_bathrooms: number | null;
  requested_features: string[];
  notes: string | null;
  status: PropertyRequestStatus;
  created_at: string;
  updated_at: string;
  governorates: { name_ar: string; name_en: string } | null;
};

const SELECT_COLUMNS =
  `id, user_id, request_type, property_type, governorate_id, city, neighborhood,
   min_price_usd, max_price_usd, min_rooms, min_bathrooms, requested_features, notes,
   status, created_at, updated_at, governorates ( name_ar, name_en )`;

function mapRow(row: PropertyRequestRow): PropertyRequest {
  return {
    id: row.id,
    userId: row.user_id,
    requestType: row.request_type,
    propertyType: row.property_type,
    governorateId: row.governorate_id,
    governorateNameAr: row.governorates?.name_ar ?? null,
    governorateNameEn: row.governorates?.name_en ?? null,
    city: row.city,
    neighborhood: row.neighborhood,
    minPriceUsd: row.min_price_usd,
    maxPriceUsd: row.max_price_usd,
    minRooms: row.min_rooms,
    minBathrooms: row.min_bathrooms,
    requestedFeatures: row.requested_features ?? [],
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type NewPropertyRequestInput = {
  userId: string;
  requestType: DealType;
  propertyType: ListingCategory;
  governorateId: string | null;
  city: string | null;
  neighborhood: string | null;
  minPriceUsd: number | null;
  maxPriceUsd: number | null;
  minRooms: number | null;
  minBathrooms: number | null;
  requestedFeatures: string[];
  notes: string | null;
};

// user_id is always the caller's own real session id (see
// app/property-request.tsx) — never a client-supplied arbitrary id, and
// RLS's own `with check (auth.uid() = user_id)` enforces this server-side
// regardless of what the client sends.
export async function createPropertyRequest(input: NewPropertyRequestInput): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('property_requests')
    .insert({
      user_id: input.userId,
      request_type: input.requestType,
      property_type: input.propertyType,
      governorate_id: input.governorateId,
      city: input.city,
      neighborhood: input.neighborhood,
      min_price_usd: input.minPriceUsd,
      max_price_usd: input.maxPriceUsd,
      min_rooms: input.minRooms,
      min_bathrooms: input.minBathrooms,
      requested_features: input.requestedFeatures,
      notes: input.notes,
    })
    .select('id')
    .single();

  if (error || !data) return { id: null, error: error?.message ?? 'insert_failed' };
  return { id: data.id, error: null };
}

// RLS already scopes this to the caller's own rows — no client-side
// filter needed, but ordering by newest first matches every other "my
// X" list in the app (حجوزاتي، عقاراتي للحجز).
export async function fetchMyPropertyRequests(): Promise<{ data: PropertyRequest[]; error: string | null }> {
  const { data, error } = await supabase
    .from('property_requests')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false })
    .returns<PropertyRequestRow[]>();

  if (error || !data) return { data: [], error: error?.message ?? null };
  return { data: data.map(mapRow), error: null };
}

export async function fetchPropertyRequest(id: string): Promise<{ data: PropertyRequest | null; error: string | null }> {
  const { data, error } = await supabase
    .from('property_requests')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle()
    .returns<PropertyRequestRow>();

  if (error || !data) return { data: null, error: error?.message ?? 'not_found' };
  return { data: mapRow(data), error: null };
}

// The real, RLS-enforced cancellation: the update itself carries the only
// transition the policy allows (active -> cancelled) — if the row isn't
// the caller's own, or isn't currently active, the database rejects it
// (0 rows affected), not just the UI hiding a button.
export async function cancelPropertyRequest(id: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('property_requests').update({ status: 'cancelled' }).eq('id', id).select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'not_allowed' };
  return { error: null };
}

// ---------------------------------------------------------------------------
// Owner side — طلبات العقارات. RLS on property_request_matches already
// scopes every row to the caller's own owner_id; the client just reads
// and groups, it never decides what counts as a match.
// ---------------------------------------------------------------------------

export type OwnerMatchedListing = { id: string; title: string; priceUsd: number; photoUrl: string | null };

export type OwnerPropertyRequestMatch = {
  request: PropertyRequest;
  matchedListings: OwnerMatchedListing[];
  respondedListingIds: string[];
};

type OwnerMatchRow = {
  property_request_id: string;
  listing_id: string;
  property_requests: PropertyRequestRow;
  listings: { id: string; title: string; price_usd: number; listing_photos: { storage_path: string; sort_order: number }[] | null };
};

export async function fetchOwnerPropertyRequestMatches(ownerId: string): Promise<{ data: OwnerPropertyRequestMatch[]; error: string | null }> {
  const [{ data: matchRows, error }, { data: responseRows }] = await Promise.all([
    supabase
      .from('property_request_matches')
      .select(
        `property_request_id, listing_id,
         property_requests ( ${SELECT_COLUMNS} ),
         listings ( id, title, price_usd, listing_photos ( storage_path, sort_order ) )`
      )
      .order('created_at', { ascending: false })
      .limit(200)
      .returns<OwnerMatchRow[]>(),
    supabase.from('property_request_responses').select('property_request_id, listing_id').eq('owner_id', ownerId),
  ]);

  if (error || !matchRows) return { data: [], error: error?.message ?? null };

  const byRequest = new Map<string, OwnerPropertyRequestMatch>();
  for (const row of matchRows) {
    // Only property_requests still active are worth an owner's attention here.
    if (row.property_requests.status !== 'active') continue;
    const existing = byRequest.get(row.property_request_id);
    const photos = (row.listings.listing_photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    const photoUrl = photos[0] ? supabase.storage.from('listing-photos').getPublicUrl(photos[0].storage_path).data.publicUrl : null;
    const listing: OwnerMatchedListing = { id: row.listings.id, title: row.listings.title, priceUsd: row.listings.price_usd, photoUrl };
    if (existing) {
      if (!existing.matchedListings.some((l) => l.id === listing.id)) existing.matchedListings.push(listing);
    } else {
      byRequest.set(row.property_request_id, { request: mapRow(row.property_requests), matchedListings: [listing], respondedListingIds: [] });
    }
  }

  for (const r of responseRows ?? []) {
    const entry = byRequest.get(r.property_request_id);
    if (entry) entry.respondedListingIds.push(r.listing_id);
  }

  return { data: Array.from(byRequest.values()), error: null };
}

// RLS's own insert policy already re-verifies both "this is really my
// listing" and "this listing really matched this request" server-side —
// this call can't succeed by sending a different owner's property.
export async function respondToPropertyRequest(
  requestId: string,
  listingId: string,
  ownerId: string,
  message: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('property_request_responses').insert({
    property_request_id: requestId,
    listing_id: listingId,
    owner_id: ownerId,
    message,
  });
  if (error) return { error: error.code === '23505' ? 'already_responded' : error.message };
  return { error: null };
}

// ---------------------------------------------------------------------------
// Customer side — طلباتي → الردود. RLS on property_request_responses
// already scopes SELECT to responses on the caller's own requests.
// ---------------------------------------------------------------------------

export type PropertyRequestResponse = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingPriceUsd: number;
  listingCity: string;
  listingArea: string | null;
  listingPhotoUrl: string | null;
  ownerFullName: string | null;
  message: string | null;
  createdAt: string;
};

type ResponseRow = {
  id: string;
  message: string | null;
  created_at: string;
  listings: {
    id: string;
    title: string;
    price_usd: number;
    city: string;
    area: string | null;
    listing_photos: { storage_path: string; sort_order: number }[] | null;
  };
  profiles: { full_name: string | null } | null;
};

export async function fetchResponsesForRequest(requestId: string): Promise<{ data: PropertyRequestResponse[]; error: string | null }> {
  const { data, error } = await supabase
    .from('property_request_responses')
    .select(
      `id, message, created_at,
       listings ( id, title, price_usd, city, area, listing_photos ( storage_path, sort_order ) ),
       profiles!property_request_responses_owner_id_fkey ( full_name )`
    )
    .eq('property_request_id', requestId)
    .order('created_at', { ascending: false })
    .returns<ResponseRow[]>();

  if (error || !data) return { data: [], error: error?.message ?? null };

  return {
    data: data.map((row) => {
      const photos = (row.listings.listing_photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
      return {
        id: row.id,
        listingId: row.listings.id,
        listingTitle: row.listings.title,
        listingPriceUsd: row.listings.price_usd,
        listingCity: row.listings.city,
        listingArea: row.listings.area,
        listingPhotoUrl: photos[0] ? supabase.storage.from('listing-photos').getPublicUrl(photos[0].storage_path).data.publicUrl : null,
        ownerFullName: row.profiles?.full_name ?? null,
        message: row.message,
        createdAt: row.created_at,
      };
    }),
    error: null,
  };
}

// Step 2 — owner contacting the matched customer. Both calls go through
// real SECURITY DEFINER RPCs (20260926000000_property_request_owner_contact.sql)
// that re-verify the caller is a real matched owner (via property_request_matches)
// before returning anything — the client never reads the customer's phone
// or profile directly, and no service-role key is used anywhere.

export async function fetchMatchedCustomerPhone(requestId: string): Promise<{ phone: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_matched_customer_phone', { p_request_id: requestId });
  if (error) return { phone: null, error: error.message };
  return { phone: (data as string | null) ?? null, error: null };
}

export async function getOrCreateConversationForMatch(
  requestId: string,
  listingId: string
): Promise<{ conversationId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_or_create_conversation_for_match', {
    p_request_id: requestId,
    p_listing_id: listingId,
  });
  if (error) {
    if (error.message.toLowerCase().includes('conversations_no_self_chat')) {
      return { conversationId: null, error: 'cannot_message_self' };
    }
    return { conversationId: null, error: error.message };
  }
  return { conversationId: data as string, error: null };
}
