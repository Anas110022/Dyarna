// Dyarna: الحجوزات — a real, standalone short-term/nightly booking
// marketplace, backed entirely by
// supabase/migrations/20260913000000_bookings.sql +
// supabase/migrations/20260914000000_booking_marketplace_v2.sql +
// supabase/migrations/20260915000000_booking_marketplace_v3.sql. A booking
// listing is its own real entity (own photos, own real owner-managed
// availability, own publish lifecycle) — never a config layer on a normal
// `listings` row, and never mixed with normal الإعلانات data. Every
// function here either reads real RLS-scoped rows or calls a real
// SECURITY DEFINER RPC — no client-side price/availability/eligibility
// logic is ever trusted as the source of truth, only shown as a preview of
// what the server will compute.

import { File } from 'expo-file-system';

import { supabase } from '@/src/lib/supabase';
import type { BookingListingType, HallType, PriceUnit } from '@/src/lib/bookingTypes';

// ---------------------------------------------------------------------------
// Booking amenity types (separate reference table from normal listings')
// ---------------------------------------------------------------------------

export type BookingAmenityType = {
  key: string;
  nameAr: string;
  nameEn: string;
  applicableBookingTypes: BookingListingType[];
};

export async function fetchBookingAmenityTypes(): Promise<{ data: BookingAmenityType[]; error: string | null }> {
  const { data, error } = await supabase.from('booking_amenity_types').select('key, name_ar, name_en, applicable_booking_types');
  return {
    data: (data ?? []).map((row) => ({
      key: row.key,
      nameAr: row.name_ar,
      nameEn: row.name_en,
      applicableBookingTypes: row.applicable_booking_types as BookingListingType[],
    })),
    error: error?.message ?? null,
  };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type BookingSearchFilters = {
  checkIn: string | null; // 'YYYY-MM-DD'
  checkOut: string | null;
  bookingType: BookingListingType | null;
  governorateId: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  minBedrooms: number | null;
  minBathrooms: number | null;
  minBeds: number | null;
  hallType: HallType | null;
};

export const EMPTY_BOOKING_FILTERS: BookingSearchFilters = {
  checkIn: null,
  checkOut: null,
  bookingType: null,
  governorateId: null,
  minPrice: null,
  maxPrice: null,
  minBedrooms: null,
  minBathrooms: null,
  minBeds: null,
  hallType: null,
};

export type BookableListingCard = {
  id: string;
  bookingType: BookingListingType;
  title: string;
  city: string;
  area: string | null;
  priceUsd: number;
  priceUnit: PriceUnit;
  minimumNights: number;
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
  hallType: HallType | null;
  numberOfHalls: number | null;
  photoUrl: string | null;
};

type SearchRow = {
  id: string;
  booking_type: BookingListingType;
  title: string;
  city: string;
  area: string | null;
  price_usd: number;
  price_unit: PriceUnit;
  minimum_nights: number;
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
  hall_type: HallType | null;
  number_of_halls: number | null;
  cover_photo_path: string | null;
};

function mapSearchRow(row: SearchRow): BookableListingCard {
  return {
    id: row.id,
    bookingType: row.booking_type,
    title: row.title,
    city: row.city,
    area: row.area,
    priceUsd: row.price_usd,
    priceUnit: row.price_unit,
    minimumNights: row.minimum_nights,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    beds: row.beds,
    hallType: row.hall_type,
    numberOfHalls: row.number_of_halls,
    photoUrl: row.cover_photo_path ? supabase.storage.from('listing-photos').getPublicUrl(row.cover_photo_path).data.publicUrl : null,
  };
}

// Real search — every filter (including real date-range availability
// against both real reservations AND real owner blackout dates, and the
// real per-type fields) is applied server-side by search_bookable_listings
// in one round trip. The real result count is simply the length of what
// this returns — never a separate/hardcoded number.
export async function searchBookableListings(
  filters: BookingSearchFilters
): Promise<{ data: BookableListingCard[]; error: string | null }> {
  const { data, error } = await supabase.rpc('search_bookable_listings', {
    p_check_in: filters.checkIn,
    p_check_out: filters.checkOut,
    p_booking_type: filters.bookingType,
    p_governorate_id: filters.governorateId,
    p_min_price: filters.minPrice,
    p_max_price: filters.maxPrice,
    p_min_bedrooms: filters.minBedrooms,
    p_min_bathrooms: filters.minBathrooms,
    p_min_beds: filters.minBeds,
    p_hall_type: filters.hallType,
  });

  if (error || !data) return { data: [], error: error?.message ?? null };
  return { data: (data as SearchRow[]).map(mapSearchRow), error: null };
}

// ---------------------------------------------------------------------------
// Booking listing detail
// ---------------------------------------------------------------------------

export type BookingListingDetail = {
  id: string;
  ownerId: string;
  bookingType: BookingListingType;
  status: 'pending_review' | 'published' | 'rejected' | 'archived';
  title: string;
  description: string;
  city: string;
  area: string | null;
  governorateId: string;
  governorateNameAr: string;
  governorateNameEn: string;
  lat: number;
  lng: number;
  priceUsd: number;
  priceUnit: PriceUnit;
  minimumNights: number;
  maximumNights: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
  hallType: HallType | null;
  numberOfHalls: number | null;
  areaSqm: number | null;
  livingRooms: number | null;
  floorNumber: number | null;
  streetWidthM: number | null;
  propertyAgeYears: number | null;
  category: string | null;
  masterBedrooms: number | null;
  receptionRooms: number | null;
  amenities: string[];
  checkInTime: string | null;
  checkOutTime: string | null;
  cancellationPolicy: string | null;
  securityDepositUsd: number | null;
  bookingInstructions: string | null;
  contactPhone: string;
  photos: string[];
  ownerFullName: string | null;
  ownerAvatarUrl: string | null;
  ownerIsVerified: boolean;
};

type BookingListingDetailRow = {
  id: string;
  owner_id: string;
  booking_type: BookingListingType;
  status: 'pending_review' | 'published' | 'rejected' | 'archived';
  title: string;
  description: string;
  city: string;
  area: string | null;
  governorate_id: string;
  lat: number;
  lng: number;
  price_usd: number;
  price_unit: PriceUnit;
  minimum_nights: number;
  maximum_nights: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
  hall_type: HallType | null;
  number_of_halls: number | null;
  area_sqm: number | null;
  living_rooms: number | null;
  floor_number: number | null;
  street_width_m: number | null;
  property_age_years: number | null;
  category: string | null;
  master_bedrooms: number | null;
  reception_rooms: number | null;
  amenities: string[];
  check_in_time: string | null;
  check_out_time: string | null;
  cancellation_policy: string | null;
  security_deposit_usd: number | null;
  booking_instructions: string | null;
  contact_phone: string;
  governorates: { name_ar: string; name_en: string } | null;
};

export async function fetchBookingListingDetail(id: string): Promise<{ data: BookingListingDetail | null; error: string | null }> {
  const { data: listing, error } = await supabase
    .from('booking_listings')
    .select(
      `id, owner_id, booking_type, status, title, description, city, area, governorate_id, lat, lng, price_usd, price_unit,
       minimum_nights, maximum_nights, bedrooms, bathrooms, beds, hall_type, number_of_halls,
       area_sqm, living_rooms, floor_number, street_width_m, property_age_years, category, master_bedrooms, reception_rooms, amenities,
       check_in_time, check_out_time, cancellation_policy, security_deposit_usd, booking_instructions,
       contact_phone, governorates ( name_ar, name_en )`
    )
    .eq('id', id)
    .maybeSingle()
    .returns<BookingListingDetailRow>();

  if (error || !listing) return { data: null, error: error?.message ?? 'not_found' };

  const [{ data: photoRows }, { data: ownerProfile }] = await Promise.all([
    supabase.from('booking_listing_photos').select('storage_path').eq('booking_listing_id', id).order('sort_order', { ascending: true }),
    supabase.from('profiles').select('full_name, avatar_url, is_verified').eq('id', listing.owner_id).maybeSingle(),
  ]);

  const photos = (photoRows ?? []).map((p) => supabase.storage.from('listing-photos').getPublicUrl(p.storage_path).data.publicUrl);

  return {
    data: {
      id: listing.id,
      ownerId: listing.owner_id,
      bookingType: listing.booking_type,
      status: listing.status,
      title: listing.title,
      description: listing.description,
      city: listing.city,
      area: listing.area,
      governorateId: listing.governorate_id,
      governorateNameAr: listing.governorates?.name_ar ?? '',
      governorateNameEn: listing.governorates?.name_en ?? '',
      lat: listing.lat,
      lng: listing.lng,
      priceUsd: listing.price_usd,
      priceUnit: listing.price_unit,
      minimumNights: listing.minimum_nights,
      maximumNights: listing.maximum_nights,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      beds: listing.beds,
      hallType: listing.hall_type,
      numberOfHalls: listing.number_of_halls,
      areaSqm: listing.area_sqm,
      livingRooms: listing.living_rooms,
      floorNumber: listing.floor_number,
      streetWidthM: listing.street_width_m,
      propertyAgeYears: listing.property_age_years,
      category: listing.category,
      masterBedrooms: listing.master_bedrooms,
      receptionRooms: listing.reception_rooms,
      amenities: listing.amenities ?? [],
      checkInTime: listing.check_in_time,
      checkOutTime: listing.check_out_time,
      cancellationPolicy: listing.cancellation_policy,
      securityDepositUsd: listing.security_deposit_usd,
      bookingInstructions: listing.booking_instructions,
      contactPhone: listing.contact_phone,
      photos,
      ownerFullName: ownerProfile?.full_name ?? null,
      ownerAvatarUrl: ownerProfile?.avatar_url ?? null,
      ownerIsVerified: ownerProfile?.is_verified ?? false,
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Posting a new booking listing
// ---------------------------------------------------------------------------

export type NewBookingListingInput = {
  ownerId: string;
  bookingType: BookingListingType;
  title: string;
  description: string;
  governorateId: string;
  city: string;
  area: string | null;
  lat: number;
  lng: number;
  priceUsd: number;
  priceUnit: PriceUnit;
  minimumNights: number;
  maximumNights: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
  hallType: HallType | null;
  numberOfHalls: number | null;
  areaSqm: number | null;
  livingRooms: number | null;
  floorNumber: number | null;
  streetWidthM: number | null;
  propertyAgeYears: number | null;
  category: string | null;
  masterBedrooms: number | null;
  receptionRooms: number | null;
  amenities: string[];
  checkInTime: string | null;
  checkOutTime: string | null;
  cancellationPolicy: string | null;
  securityDepositUsd: number | null;
  bookingInstructions: string | null;
  contactPhone: string;
};

export async function createBookingListing(input: NewBookingListingInput): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('booking_listings')
    .insert({
      owner_id: input.ownerId,
      booking_type: input.bookingType,
      title: input.title,
      description: input.description,
      governorate_id: input.governorateId,
      city: input.city,
      area: input.area,
      lat: input.lat,
      lng: input.lng,
      price_usd: input.priceUsd,
      price_unit: input.priceUnit,
      minimum_nights: input.minimumNights,
      maximum_nights: input.maximumNights,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      beds: input.beds,
      hall_type: input.hallType,
      number_of_halls: input.numberOfHalls,
      area_sqm: input.areaSqm,
      living_rooms: input.livingRooms,
      floor_number: input.floorNumber,
      street_width_m: input.streetWidthM,
      property_age_years: input.propertyAgeYears,
      category: input.category,
      master_bedrooms: input.masterBedrooms,
      reception_rooms: input.receptionRooms,
      amenities: input.amenities,
      check_in_time: input.checkInTime,
      check_out_time: input.checkOutTime,
      cancellation_policy: input.cancellationPolicy,
      security_deposit_usd: input.securityDepositUsd,
      booking_instructions: input.bookingInstructions,
      contact_phone: input.contactPhone,
    })
    .select('id')
    .single();

  return { id: data?.id ?? null, error: error?.message ?? null };
}

// Reads the local photo straight off disk via expo-file-system's native
// File API. RN's fetch()+Blob path for local file:// URIs is a documented
// iOS crash source for real photo-sized payloads (RCTBlobManager can hand
// back a bad memory region under load) — File#arrayBuffer() goes through
// Expo's own file-system module instead, never through that bridge.
// Reuses the exact same real, already-provisioned `listing-photos` bucket
// as normal listings (its RLS only checks the uploading user's own
// auth.uid() path folder) — just namespaced under a `booking/` subfolder
// so the two photo sets never collide.
export async function uploadBookingListingPhoto(
  ownerId: string,
  bookingListingId: string,
  index: number,
  localUri: string
): Promise<{ path: string | null; error: string | null }> {
  const extensionMatch = localUri.split('.').pop()?.split(/[?#]/)[0]?.toLowerCase();
  const extension = extensionMatch && extensionMatch.length <= 5 ? extensionMatch : 'jpg';
  const contentType = extension === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${ownerId}/booking/${bookingListingId}/${index}.${extension}`;

  const arrayBuffer = await new File(localUri).arrayBuffer();

  const { error } = await supabase.storage.from('listing-photos').upload(path, arrayBuffer, { contentType, upsert: true });
  return { path: error ? null : path, error: error?.message ?? null };
}

export async function attachBookingListingPhotos(bookingListingId: string, storagePaths: string[]): Promise<{ error: string | null }> {
  const rows = storagePaths.map((storage_path, index) => ({ booking_listing_id: bookingListingId, storage_path, sort_order: index }));
  const { error } = await supabase.from('booking_listing_photos').insert(rows);
  return { error: error?.message ?? null };
}

// Calls the real server-side RPC (re-validates ownership, real photo
// count, and the owner's real advertiser-verification status) — the
// client's own validation is only a hint that it's worth calling.
export async function publishBookingListingIfEligible(bookingListingId: string): Promise<{ published: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('publish_booking_listing_if_eligible', { p_booking_listing_id: bookingListingId });
  return { published: Boolean(data), error: error?.message ?? null };
}

// ---------------------------------------------------------------------------
// Real owner-managed availability (blackout dates) — independent of any
// reservation. Represented client-side as plain 'YYYY-MM-DD' strings so
// they plug directly into the same calendar component used for
// check-in/check-out selection.
// ---------------------------------------------------------------------------

export async function fetchBookingListingBlackoutDates(bookingListingId: string): Promise<{ data: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from('booking_listing_blackout_dates')
    .select('blocked_date')
    .eq('booking_listing_id', bookingListingId)
    .order('blocked_date', { ascending: true });
  if (error || !data) return { data: [], error: error?.message ?? null };
  return { data: data.map((r) => r.blocked_date as string), error: null };
}

export async function addBookingListingBlackoutDates(bookingListingId: string, dates: string[]): Promise<{ error: string | null }> {
  if (dates.length === 0) return { error: null };
  const rows = dates.map((blocked_date) => ({ booking_listing_id: bookingListingId, blocked_date }));
  const { error } = await supabase.from('booking_listing_blackout_dates').insert(rows);
  return { error: error?.message ?? null };
}

export async function removeBookingListingBlackoutDate(bookingListingId: string, date: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('booking_listing_blackout_dates')
    .delete()
    .eq('booking_listing_id', bookingListingId)
    .eq('blocked_date', date);
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------------
// Owner: managing their own booking listings
// ---------------------------------------------------------------------------

export type OwnBookingListingPreview = {
  id: string;
  bookingType: BookingListingType;
  title: string;
  city: string;
  area: string | null;
  priceUsd: number;
  priceUnit: PriceUnit;
  status: 'pending_review' | 'published' | 'rejected' | 'archived';
  photoUrl: string | null;
};

type OwnBookingListingRow = {
  id: string;
  booking_type: BookingListingType;
  title: string;
  city: string;
  area: string | null;
  price_usd: number;
  price_unit: PriceUnit;
  status: 'pending_review' | 'published' | 'rejected' | 'archived';
  booking_listing_photos: { storage_path: string; sort_order: number }[] | null;
};

export async function fetchOwnBookingListings(ownerId: string): Promise<{ data: OwnBookingListingPreview[]; error: string | null }> {
  const { data, error } = await supabase
    .from('booking_listings')
    .select('id, booking_type, title, city, area, price_usd, price_unit, status, booking_listing_photos ( storage_path, sort_order )')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .returns<OwnBookingListingRow[]>();

  if (error || !data) return { data: [], error: error?.message ?? null };

  return {
    data: data.map((row) => {
      const cover = (row.booking_listing_photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)[0];
      return {
        id: row.id,
        bookingType: row.booking_type,
        title: row.title,
        city: row.city,
        area: row.area,
        priceUsd: row.price_usd,
        priceUnit: row.price_unit,
        status: row.status,
        photoUrl: cover ? supabase.storage.from('listing-photos').getPublicUrl(cover.storage_path).data.publicUrl : null,
      };
    }),
    error: null,
  };
}

// Every real field an owner can edit after creation — everything except
// booking_type (changing the type post-publish would silently invalidate
// which spec fields apply) and status/photos (their own explicit flows
// below), so a full edit save can never accidentally re-trigger the
// publish trust gate or corrupt the type-driven field schema.
export type BookingListingFullUpdate = {
  title: string;
  description: string;
  governorateId: string;
  city: string;
  area: string | null;
  lat: number;
  lng: number;
  priceUsd: number;
  minimumNights: number;
  maximumNights: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
  hallType: HallType | null;
  numberOfHalls: number | null;
  areaSqm: number | null;
  livingRooms: number | null;
  floorNumber: number | null;
  streetWidthM: number | null;
  propertyAgeYears: number | null;
  category: string | null;
  masterBedrooms: number | null;
  receptionRooms: number | null;
  amenities: string[];
  checkInTime: string | null;
  checkOutTime: string | null;
  cancellationPolicy: string | null;
  securityDepositUsd: number | null;
  bookingInstructions: string | null;
  contactPhone: string;
};

export async function updateBookingListingFull(bookingListingId: string, update: BookingListingFullUpdate): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('booking_listings')
    .update({
      title: update.title,
      description: update.description,
      governorate_id: update.governorateId,
      city: update.city,
      area: update.area,
      lat: update.lat,
      lng: update.lng,
      price_usd: update.priceUsd,
      minimum_nights: update.minimumNights,
      maximum_nights: update.maximumNights,
      bedrooms: update.bedrooms,
      bathrooms: update.bathrooms,
      beds: update.beds,
      hall_type: update.hallType,
      number_of_halls: update.numberOfHalls,
      area_sqm: update.areaSqm,
      living_rooms: update.livingRooms,
      floor_number: update.floorNumber,
      street_width_m: update.streetWidthM,
      property_age_years: update.propertyAgeYears,
      category: update.category,
      master_bedrooms: update.masterBedrooms,
      reception_rooms: update.receptionRooms,
      amenities: update.amenities,
      check_in_time: update.checkInTime,
      check_out_time: update.checkOutTime,
      cancellation_policy: update.cancellationPolicy,
      security_deposit_usd: update.securityDepositUsd,
      booking_instructions: update.bookingInstructions,
      contact_phone: update.contactPhone,
    })
    .eq('id', bookingListingId);
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------------
// Owner: photos on an existing booking listing (add/remove after creation)
// ---------------------------------------------------------------------------

export type BookingListingPhotoRow = { id: string; storagePath: string; publicUrl: string; sortOrder: number };

export async function fetchBookingListingPhotoRows(bookingListingId: string): Promise<{ data: BookingListingPhotoRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('booking_listing_photos')
    .select('id, storage_path, sort_order')
    .eq('booking_listing_id', bookingListingId)
    .order('sort_order', { ascending: true });
  if (error || !data) return { data: [], error: error?.message ?? null };
  return {
    data: data.map((row) => ({
      id: row.id,
      storagePath: row.storage_path,
      publicUrl: supabase.storage.from('listing-photos').getPublicUrl(row.storage_path).data.publicUrl,
      sortOrder: row.sort_order,
    })),
    error: null,
  };
}

export async function deleteBookingListingPhotoRow(photoRowId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('booking_listing_photos').delete().eq('id', photoRowId);
  return { error: error?.message ?? null };
}

// Pausing is a real, always-allowed direct status change (the trust
// trigger only blocks a client setting status to 'published' directly).
export async function pauseBookingListing(bookingListingId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('booking_listings').update({ status: 'archived' }).eq('id', bookingListingId);
  return { error: error?.message ?? null };
}

// Resuming re-enters the real eligibility path: send it back to
// pending_review, then ask the same publish RPC every new listing goes
// through to re-check real photos + real advertiser verification before
// it can go live again.
export async function resumeBookingListing(bookingListingId: string): Promise<{ published: boolean; error: string | null }> {
  const { error: updateError } = await supabase.from('booking_listings').update({ status: 'pending_review' }).eq('id', bookingListingId);
  if (updateError) return { published: false, error: updateError.message };
  return publishBookingListingIfEligible(bookingListingId);
}

// Real hard delete — the database RLS policy (20260917000000) only allows
// this when the listing has zero real reservations, so a listing with
// real guest bookings can never be silently destroyed here; `error` comes
// back non-null (blocked-by-policy looks like 0 rows affected, which
// this treats as a real failure) whenever that's the case, and the caller
// falls back to pauseBookingListing (archive) instead.
export async function deleteBookingListing(bookingListingId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('booking_listings').delete().eq('id', bookingListingId).select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'blocked' };
  return { error: null };
}

// ---------------------------------------------------------------------------
// Availability (real reservations + real owner blackout dates, unioned
// server-side by get_unavailable_dates)
// ---------------------------------------------------------------------------

export type UnavailableRange = { checkIn: string; checkOut: string };

export async function fetchUnavailableRanges(bookingListingId: string): Promise<{ data: UnavailableRange[]; error: string | null }> {
  const { data, error } = await supabase.rpc('get_unavailable_dates', { p_booking_listing_id: bookingListingId });

  if (error || !data) return { data: [], error: error?.message ?? null };
  return {
    data: (data as { check_in: string; check_out: string }[]).map((r) => ({ checkIn: r.check_in, checkOut: r.check_out })),
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Creating / managing a reservation
// ---------------------------------------------------------------------------

export type CreatedReservation = {
  id: string;
  referenceCode: string;
  nights: number;
  nightlyPriceUsd: number;
  totalPriceUsd: number;
};

export async function createReservation(
  bookingListingId: string,
  checkIn: string,
  checkOut: string
): Promise<{ data: CreatedReservation | null; error: string | null }> {
  const { data: rpcData, error } = await supabase.rpc('create_reservation', {
    p_booking_listing_id: bookingListingId,
    p_check_in: checkIn,
    p_check_out: checkOut,
  });
  const data = rpcData as { id: string; reference_code: string; nights: number; nightly_price_usd: number; total_price_usd: number }[] | null;

  if (error || !data || data.length === 0) return { data: null, error: error?.message ?? 'booking_failed' };

  const row = data[0];
  return {
    data: {
      id: row.id,
      referenceCode: row.reference_code,
      nights: row.nights,
      nightlyPriceUsd: row.nightly_price_usd,
      totalPriceUsd: row.total_price_usd,
    },
    error: null,
  };
}

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'rejected' | 'completed';

export async function updateReservationStatus(reservationId: string, status: ReservationStatus): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_reservation_status', { p_reservation_id: reservationId, p_new_status: status });
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------------
// حجوزاتي — the authenticated guest's own real reservations
// ---------------------------------------------------------------------------

export type ReservationSummary = {
  id: string;
  referenceCode: string;
  bookingListingId: string;
  bookingListingTitle: string;
  bookingListingCity: string;
  bookingListingArea: string | null;
  photoUrl: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalPriceUsd: number;
  status: ReservationStatus;
};

type ReservationRow = {
  id: string;
  reference_code: string;
  booking_listing_id: string;
  check_in: string;
  check_out: string;
  nights: number;
  total_price_usd: number;
  status: ReservationStatus;
  booking_listings: {
    title: string;
    city: string;
    area: string | null;
    booking_listing_photos: { storage_path: string; sort_order: number }[] | null;
  } | null;
};

function mapReservationRow(row: ReservationRow): ReservationSummary {
  const cover = (row.booking_listings?.booking_listing_photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)[0];
  return {
    id: row.id,
    referenceCode: row.reference_code,
    bookingListingId: row.booking_listing_id,
    bookingListingTitle: row.booking_listings?.title ?? '',
    bookingListingCity: row.booking_listings?.city ?? '',
    bookingListingArea: row.booking_listings?.area ?? null,
    photoUrl: cover ? supabase.storage.from('listing-photos').getPublicUrl(cover.storage_path).data.publicUrl : null,
    checkIn: row.check_in,
    checkOut: row.check_out,
    nights: row.nights,
    totalPriceUsd: row.total_price_usd,
    status: row.status,
  };
}

export async function fetchMyReservations(userId: string): Promise<{ data: ReservationSummary[]; error: string | null }> {
  const { data, error } = await supabase
    .from('reservations')
    .select(
      'id, reference_code, booking_listing_id, check_in, check_out, nights, total_price_usd, status, booking_listings ( title, city, area, booking_listing_photos ( storage_path, sort_order ) )'
    )
    .eq('guest_id', userId)
    .order('check_in', { ascending: false })
    .returns<ReservationRow[]>();

  if (error || !data) return { data: [], error: error?.message ?? null };
  return { data: data.map(mapReservationRow), error: null };
}

export type OwnerReservationSummary = ReservationSummary & { guestFullName: string | null };

type OwnerReservationRow = ReservationRow & { profiles: { full_name: string | null } | null };

export async function fetchOwnerReservations(ownerId: string): Promise<{ data: OwnerReservationSummary[]; error: string | null }> {
  const { data, error } = await supabase
    .from('reservations')
    .select(
      `id, reference_code, booking_listing_id, check_in, check_out, nights, total_price_usd, status,
       booking_listings!inner ( title, city, area, owner_id, booking_listing_photos ( storage_path, sort_order ) ),
       profiles!reservations_guest_id_fkey ( full_name )`
    )
    .eq('booking_listings.owner_id', ownerId)
    .order('check_in', { ascending: false })
    .returns<OwnerReservationRow[]>();

  if (error || !data) return { data: [], error: error?.message ?? null };
  return {
    data: data.map((row) => ({ ...mapReservationRow(row), guestFullName: row.profiles?.full_name ?? null })),
    error: null,
  };
}
