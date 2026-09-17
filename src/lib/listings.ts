import { File } from 'expo-file-system';

import { supabase } from '@/src/lib/supabase';
import type { ListingCategory, DealType } from '@/src/lib/listingTypes';

export type Governorate = { id: string; name_ar: string; name_en: string };

export async function fetchGovernorates(): Promise<{ data: Governorate[]; error: string | null }> {
  const { data, error } = await supabase.from('governorates').select('id, name_ar, name_en').order('name_ar');
  return { data: data ?? [], error: error?.message ?? null };
}

export type AmenityType = {
  key: string;
  nameAr: string;
  nameEn: string;
  applicableCategories: string[];
};

// Real reference data from amenity_types (see
// supabase/migrations/20260903010000_categories_amenities.sql) — adding a
// new amenity later only ever needs a row inserted there, never a change
// here.
export async function fetchAmenityTypes(): Promise<{ data: AmenityType[]; error: string | null }> {
  const { data, error } = await supabase.from('amenity_types').select('key, name_ar, name_en, applicable_categories');
  return {
    data: (data ?? []).map((row) => ({
      key: row.key,
      nameAr: row.name_ar,
      nameEn: row.name_en,
      applicableCategories: row.applicable_categories,
    })),
    error: error?.message ?? null,
  };
}

// phone/email are no longer selectable columns on public.profiles for
// anyone, including the row's own owner (supabase/migrations/
// 20260930030000_profiles_privacy_fix.sql) — direct column-level access
// was the actual security gap (any client could read ANY user's phone/
// email, not just their own). The owner reads their own two private
// fields through get_own_contact_info() instead, a SECURITY DEFINER RPC
// scoped to auth.uid() with no caller-supplied id. Everything else here
// still comes straight off the table — those columns stayed publicly
// selectable, unaffected by the fix.
export async function fetchOwnProfile(userId: string): Promise<{
  fullName: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  authMethod: 'phone' | 'email' | null;
  createdAt: string | null;
  error: string | null;
}> {
  const [{ data, error }, { data: contactRaw, error: contactError }] = await Promise.all([
    supabase.from('profiles').select('full_name, avatar_url, is_verified, auth_method, created_at').eq('id', userId).maybeSingle(),
    supabase.rpc('get_own_contact_info').maybeSingle(),
  ]);
  const contact = contactRaw as { phone: string | null; email: string | null } | null;
  return {
    fullName: data?.full_name ?? null,
    phone: contact?.phone ?? null,
    email: contact?.email ?? null,
    avatarUrl: data?.avatar_url ?? null,
    isVerified: data?.is_verified ?? false,
    authMethod: data?.auth_method ?? null,
    createdAt: data?.created_at ?? null,
    error: error?.message ?? contactError?.message ?? null,
  };
}

export type NewListingInput = {
  ownerId: string;
  listingType: DealType;
  category: ListingCategory;
  title: string;
  description: string;
  priceUsd: number;
  governorateId: string;
  city: string;
  area: string | null;
  lat: number;
  lng: number;
  areaSqm: number;
  bedrooms: number | null;
  bathrooms: number | null;
  livingRooms: number | null;
  floor: number | null;
  yearBuilt: number | null;
  condition: 'good' | 'needs_renovation' | null;
  landType: 'residential' | 'agricultural' | 'commercial' | null;
  frontageM: number | null;
  roadAccessDescription: string | null;
  hasBuildingPermit: boolean | null;
  ceilingHeightM: number | null;
  furnished: 'unfurnished' | 'partial' | 'full' | null;
  leaseTerm: string | null;
  downPaymentUsd: number | null;
  ownershipDocType: string | null;
  ownershipDocUrl: string | null;
  contactPhone: string;
  amenities: string[];
  licenseNumber: string | null;
  licenseExpiryDate: string | null;
  adSource: string | null;
  deedAreaSqm: number | null;
};

export async function createListing(input: NewListingInput): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('listings')
    .insert({
      owner_id: input.ownerId,
      listing_type: input.listingType,
      category: input.category,
      title: input.title,
      description: input.description,
      price_usd: input.priceUsd,
      governorate_id: input.governorateId,
      city: input.city,
      area: input.area,
      lat: input.lat,
      lng: input.lng,
      area_sqm: input.areaSqm,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      living_rooms: input.livingRooms,
      floor: input.floor,
      year_built: input.yearBuilt,
      condition: input.condition,
      land_type: input.landType,
      frontage_m: input.frontageM,
      road_access_description: input.roadAccessDescription,
      has_building_permit: input.hasBuildingPermit,
      ceiling_height_m: input.ceilingHeightM,
      furnished: input.furnished,
      lease_term: input.leaseTerm,
      down_payment_usd: input.downPaymentUsd,
      ownership_doc_type: input.ownershipDocType,
      ownership_doc_url: input.ownershipDocUrl,
      contact_phone: input.contactPhone,
      amenities: input.amenities,
      license_number: input.licenseNumber,
      license_expiry_date: input.licenseExpiryDate,
      ad_source: input.adSource,
      deed_area_sqm: input.deedAreaSqm,
    })
    .select('id')
    .single();

  return { id: data?.id ?? null, error: error?.message ?? null };
}

// Reads the local photo straight off disk via expo-file-system's native
// File API — RN's fetch()+Blob path for local file:// URIs is a documented
// iOS crash source for real photo-sized payloads.
export async function uploadListingPhoto(
  ownerId: string,
  listingId: string,
  index: number,
  localUri: string
): Promise<{ path: string | null; error: string | null }> {
  const extensionMatch = localUri.split('.').pop()?.split(/[?#]/)[0]?.toLowerCase();
  const extension = extensionMatch && extensionMatch.length <= 5 ? extensionMatch : 'jpg';
  const contentType = extension === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${ownerId}/${listingId}/${index}.${extension}`;

  const arrayBuffer = await new File(localUri).arrayBuffer();

  const { error } = await supabase.storage.from('listing-photos').upload(path, arrayBuffer, {
    contentType,
    upsert: true,
  });

  return { path: error ? null : path, error: error?.message ?? null };
}

export async function uploadOwnershipDoc(
  ownerId: string,
  listingId: string,
  localUri: string
): Promise<{ url: string | null; error: string | null }> {
  const extensionMatch = localUri.split('.').pop()?.split(/[?#]/)[0]?.toLowerCase();
  const extension = extensionMatch && extensionMatch.length <= 5 ? extensionMatch : 'jpg';
  const contentType = extension === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${ownerId}/${listingId}/deed.${extension}`;

  const arrayBuffer = await new File(localUri).arrayBuffer();

  const { error } = await supabase.storage.from('listing-photos').upload(path, arrayBuffer, {
    contentType,
    upsert: true,
  });
  if (error) return { url: null, error: error.message };

  const { data } = supabase.storage.from('listing-photos').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

export async function updateListingOwnershipDocUrl(listingId: string, url: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('listings').update({ ownership_doc_url: url }).eq('id', listingId);
  return { error: error?.message ?? null };
}

export async function attachListingPhotos(listingId: string, storagePaths: string[]): Promise<{ error: string | null }> {
  const rows = storagePaths.map((storage_path, index) => ({
    listing_id: listingId,
    storage_path,
    sort_order: index,
  }));
  const { error } = await supabase.from('listing_photos').insert(rows);
  return { error: error?.message ?? null };
}

// Calls the server-side RPC (supabase/migrations/20260903000000_auto_publish.sql)
// that re-validates ownership and real photo count before publishing — the
// client's own validation is not trusted for this, only a hint that it's
// worth calling. Returns false (not an error) if the listing genuinely
// wasn't eligible yet, leaving it correctly in pending_review.
export async function publishListingIfEligible(listingId: string): Promise<{ published: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('publish_listing_if_eligible', { p_listing_id: listingId });
  return { published: Boolean(data), error: error?.message ?? null };
}

export type PublishedListingPin = {
  id: string;
  listingType: DealType;
  category: ListingCategory;
  priceUsd: number;
  lat: number;
  lng: number;
};

// Every field here is a real, already-existing listings column — no filter
// added here needs a schema change. Optional fields are only meaningful for
// some categories/deal-types (bedrooms/bathrooms for house-like categories,
// furnished for rent, landType for land); the Home screen only ever sends
// the ones relevant to the currently selected category, but a stray value
// is harmless here too — it would just correctly match zero rows.
export type ListingFilterParams = {
  dealType: DealType;
  category: ListingCategory | 'all';
  minPrice?: number | null;
  maxPrice?: number | null;
  minArea?: number | null;
  maxArea?: number | null;
  minBedrooms?: number | null;
  minBathrooms?: number | null;
  minLivingRooms?: number | null;
  minCeilingHeight?: number | null;
  furnished?: 'unfurnished' | 'partial' | 'full' | null;
  landType?: 'residential' | 'agricultural' | 'commercial' | null;
  amenities?: string[];
};

// Powers the Home map's markers — real published rows only, filtered by the
// deal-type toggle, the category chip, and the real filter sheet. RLS
// already restricts this to status = 'published' for anyone, but the
// explicit filter keeps the query's intent clear and correct even if RLS
// ever changes.
export async function fetchPublishedListings(
  filters: ListingFilterParams
): Promise<{ data: PublishedListingPin[]; error: string | null }> {
  let query = supabase
    .from('listings')
    .select('id, listing_type, category, price_usd, lat, lng')
    .eq('status', 'published')
    .eq('listing_type', filters.dealType);

  if (filters.category !== 'all') query = query.eq('category', filters.category);
  if (filters.minPrice != null) query = query.gte('price_usd', filters.minPrice);
  if (filters.maxPrice != null) query = query.lte('price_usd', filters.maxPrice);
  if (filters.minArea != null) query = query.gte('area_sqm', filters.minArea);
  if (filters.maxArea != null) query = query.lte('area_sqm', filters.maxArea);
  if (filters.minBedrooms != null) query = query.gte('bedrooms', filters.minBedrooms);
  if (filters.minBathrooms != null) query = query.gte('bathrooms', filters.minBathrooms);
  if (filters.minLivingRooms != null) query = query.gte('living_rooms', filters.minLivingRooms);
  if (filters.minCeilingHeight != null) query = query.gte('ceiling_height_m', filters.minCeilingHeight);
  if (filters.furnished) query = query.eq('furnished', filters.furnished);
  if (filters.landType) query = query.eq('land_type', filters.landType);
  if (filters.amenities && filters.amenities.length > 0) query = query.contains('amenities', filters.amenities);

  const { data, error } = await query.limit(200);

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      listingType: row.listing_type,
      category: row.category,
      priceUsd: row.price_usd,
      lat: row.lat,
      lng: row.lng,
    })),
    error: error?.message ?? null,
  };
}

// Powers the map's real property price markers while in "detailed" mode —
// real published listings whose real lat/lng fall inside the map's current
// visible region, same real columns/filters as fetchPublishedListings
// above (id/listingType/category/priceUsd/lat/lng only — this is for
// pins, not the richer list-sheet preview), just also bounded to the
// current viewport the way fetchListingsInBounds already bounds the list
// sheet's results.
export async function fetchPublishedListingPinsInBounds(
  bounds: MapBounds,
  filters: ListingFilterParams
): Promise<{ data: PublishedListingPin[]; error: string | null }> {
  let query = supabase
    .from('listings')
    .select('id, listing_type, category, price_usd, lat, lng')
    .eq('status', 'published')
    .eq('listing_type', filters.dealType)
    .gte('lat', bounds.minLat)
    .lte('lat', bounds.maxLat)
    .gte('lng', bounds.minLng)
    .lte('lng', bounds.maxLng);

  if (filters.category !== 'all') query = query.eq('category', filters.category);
  if (filters.minPrice != null) query = query.gte('price_usd', filters.minPrice);
  if (filters.maxPrice != null) query = query.lte('price_usd', filters.maxPrice);
  if (filters.minArea != null) query = query.gte('area_sqm', filters.minArea);
  if (filters.maxArea != null) query = query.lte('area_sqm', filters.maxArea);
  if (filters.minBedrooms != null) query = query.gte('bedrooms', filters.minBedrooms);
  if (filters.minBathrooms != null) query = query.gte('bathrooms', filters.minBathrooms);
  if (filters.minLivingRooms != null) query = query.gte('living_rooms', filters.minLivingRooms);
  if (filters.minCeilingHeight != null) query = query.gte('ceiling_height_m', filters.minCeilingHeight);
  if (filters.furnished) query = query.eq('furnished', filters.furnished);
  if (filters.landType) query = query.eq('land_type', filters.landType);
  if (filters.amenities && filters.amenities.length > 0) query = query.contains('amenities', filters.amenities);

  const { data, error } = await query.limit(200);

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      listingType: row.listing_type,
      category: row.category,
      priceUsd: row.price_usd,
      lat: row.lat,
      lng: row.lng,
    })),
    error: error?.message ?? null,
  };
}

export async function fetchPublishedListingsCount(): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published');
  return { count: count ?? 0, error: error?.message ?? null };
}

export type ListingPreview = {
  id: string;
  title: string;
  category: ListingCategory;
  city: string;
  area: string | null;
  priceUsd: number;
  bedrooms: number | null;
  bathrooms: number | null;
  areaSqm: number;
  photoUrl: string | null;
};

// Fetched on-demand when a marker is tapped, rather than joined into the
// map's initial query — keeps the pin query light even with many listings.
export async function fetchListingPreview(listingId: string): Promise<{ data: ListingPreview | null; error: string | null }> {
  const { data: listing, error } = await supabase
    .from('listings')
    .select('id, title, category, city, area, price_usd, bedrooms, bathrooms, area_sqm')
    .eq('id', listingId)
    .maybeSingle();

  if (error || !listing) {
    return { data: null, error: error?.message ?? 'not_found' };
  }

  const { data: photoRow } = await supabase
    .from('listing_photos')
    .select('storage_path')
    .eq('listing_id', listingId)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  const photoUrl = photoRow?.storage_path
    ? supabase.storage.from('listing-photos').getPublicUrl(photoRow.storage_path).data.publicUrl
    : null;

  return {
    data: {
      id: listing.id,
      title: listing.title,
      category: listing.category,
      city: listing.city,
      area: listing.area,
      priceUsd: listing.price_usd,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      areaSqm: listing.area_sqm,
      photoUrl,
    },
    error: null,
  };
}

type MapBounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

type ListingWithPhotosRow = {
  id: string;
  title: string;
  category: ListingCategory;
  city: string;
  area: string | null;
  price_usd: number;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqm: number;
  listing_photos: { storage_path: string; sort_order: number }[] | null;
};

function mapListingWithPhotosRow(row: ListingWithPhotosRow): ListingPreview {
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
    photoUrl,
  };
}

// Powers the "القائمة" (list) button on the Home map: real published
// listings whose real lat/lng fall inside the map's current visible region,
// with a cover photo resolved in the same query (one round trip for the
// whole list, rather than one extra fetch per row).
export async function fetchListingsInBounds(
  bounds: MapBounds,
  filters: ListingFilterParams
): Promise<{ data: ListingPreview[]; error: string | null }> {
  let query = supabase
    .from('listings')
    .select('id, title, category, city, area, price_usd, bedrooms, bathrooms, area_sqm, listing_photos(storage_path, sort_order)')
    .eq('status', 'published')
    .eq('listing_type', filters.dealType)
    .gte('lat', bounds.minLat)
    .lte('lat', bounds.maxLat)
    .gte('lng', bounds.minLng)
    .lte('lng', bounds.maxLng);

  if (filters.category !== 'all') query = query.eq('category', filters.category);
  if (filters.minPrice != null) query = query.gte('price_usd', filters.minPrice);
  if (filters.maxPrice != null) query = query.lte('price_usd', filters.maxPrice);
  if (filters.minArea != null) query = query.gte('area_sqm', filters.minArea);
  if (filters.maxArea != null) query = query.lte('area_sqm', filters.maxArea);
  if (filters.minBedrooms != null) query = query.gte('bedrooms', filters.minBedrooms);
  if (filters.minBathrooms != null) query = query.gte('bathrooms', filters.minBathrooms);
  if (filters.minLivingRooms != null) query = query.gte('living_rooms', filters.minLivingRooms);
  if (filters.minCeilingHeight != null) query = query.gte('ceiling_height_m', filters.minCeilingHeight);
  if (filters.furnished) query = query.eq('furnished', filters.furnished);
  if (filters.landType) query = query.eq('land_type', filters.landType);
  if (filters.amenities && filters.amenities.length > 0) query = query.contains('amenities', filters.amenities);

  // A real safety cap — the lat/lng bounds already scope this to the
  // visible map area, but a zoomed-out view over a dense region could
  // still return an unbounded number of rows (each with a photos join).
  // 200 pins is already far more than a map view can usefully render.
  const { data, error } = await query.order('created_at', { ascending: false }).limit(200).returns<ListingWithPhotosRow[]>();

  if (error || !data) {
    return { data: [], error: error?.message ?? null };
  }

  return { data: data.map(mapListingWithPhotosRow), error: null };
}

// Escapes ilike wildcards (%, _) and strips characters that would break
// PostgREST's or() filter mini-language (commas separate conditions,
// parentheses group them) — a search box is free user input and is never
// trusted to already be safe filter syntax.
function sanitizeSearchTerm(raw: string): string {
  return raw
    .replace(/[(),]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/[%_]/g, (ch) => `\\${ch}`)
    .trim();
}

// Powers the real search bar in the Home map's list sheet (§4 screen 03,
// "Search & Filters") — matches against the listing's real title, city, and
// neighborhood (area), scoped by the same rent/sale + category + filter
// sheet constraints already applied elsewhere, but NOT limited to the
// current map viewport: a user searching by name/city expects real matches
// anywhere in Syria, not just what's currently on screen.
export async function searchPublishedListings(
  searchQuery: string,
  filters: ListingFilterParams
): Promise<{ data: ListingPreview[]; error: string | null }> {
  const term = sanitizeSearchTerm(searchQuery);
  if (!term) return { data: [], error: null };

  let query = supabase
    .from('listings')
    .select('id, title, category, city, area, price_usd, bedrooms, bathrooms, area_sqm, listing_photos(storage_path, sort_order)')
    .eq('status', 'published')
    .eq('listing_type', filters.dealType)
    .or(`title.ilike.%${term}%,city.ilike.%${term}%,area.ilike.%${term}%`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (filters.category !== 'all') query = query.eq('category', filters.category);
  if (filters.minPrice != null) query = query.gte('price_usd', filters.minPrice);
  if (filters.maxPrice != null) query = query.lte('price_usd', filters.maxPrice);
  if (filters.minArea != null) query = query.gte('area_sqm', filters.minArea);
  if (filters.maxArea != null) query = query.lte('area_sqm', filters.maxArea);
  if (filters.minBedrooms != null) query = query.gte('bedrooms', filters.minBedrooms);
  if (filters.minBathrooms != null) query = query.gte('bathrooms', filters.minBathrooms);
  if (filters.minLivingRooms != null) query = query.gte('living_rooms', filters.minLivingRooms);
  if (filters.minCeilingHeight != null) query = query.gte('ceiling_height_m', filters.minCeilingHeight);
  if (filters.furnished) query = query.eq('furnished', filters.furnished);
  if (filters.landType) query = query.eq('land_type', filters.landType);
  if (filters.amenities && filters.amenities.length > 0) query = query.contains('amenities', filters.amenities);

  const { data, error } = await query.returns<ListingWithPhotosRow[]>();

  if (error || !data) {
    return { data: [], error: error?.message ?? null };
  }

  return { data: data.map(mapListingWithPhotosRow), error: null };
}

export type ListingDetail = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  category: ListingCategory;
  listingType: DealType;
  priceUsd: number;
  city: string;
  area: string | null;
  governorateNameAr: string;
  governorateNameEn: string;
  lat: number;
  lng: number;
  areaSqm: number;
  bedrooms: number | null;
  bathrooms: number | null;
  livingRooms: number | null;
  floor: number | null;
  yearBuilt: number | null;
  condition: 'good' | 'needs_renovation' | null;
  landType: 'residential' | 'agricultural' | 'commercial' | null;
  frontageM: number | null;
  roadAccessDescription: string | null;
  hasBuildingPermit: boolean | null;
  ceilingHeightM: number | null;
  furnished: 'unfurnished' | 'partial' | 'full' | null;
  leaseTerm: string | null;
  downPaymentUsd: number | null;
  amenities: string[];
  contactPhone: string;
  isVerifiedListing: boolean;
  createdAt: string;
  updatedAt: string;
  adNumber: number;
  viewCount: number;
  licenseNumber: string | null;
  licenseExpiryDate: string | null;
  adSource: string | null;
  deedAreaSqm: number | null;
  photos: string[];
  ownerFullName: string | null;
  ownerAvatarUrl: string | null;
  ownerIsVerified: boolean;
};

type ListingDetailRow = {
  id: string;
  title: string;
  description: string;
  category: ListingCategory;
  listing_type: DealType;
  price_usd: number;
  city: string;
  area: string | null;
  lat: number;
  lng: number;
  area_sqm: number;
  bedrooms: number | null;
  bathrooms: number | null;
  living_rooms: number | null;
  floor: number | null;
  year_built: number | null;
  condition: 'good' | 'needs_renovation' | null;
  land_type: 'residential' | 'agricultural' | 'commercial' | null;
  frontage_m: number | null;
  road_access_description: string | null;
  has_building_permit: boolean | null;
  ceiling_height_m: number | null;
  furnished: 'unfurnished' | 'partial' | 'full' | null;
  lease_term: string | null;
  down_payment_usd: number | null;
  amenities: string[] | null;
  contact_phone: string;
  is_verified_listing: boolean;
  created_at: string;
  updated_at: string;
  ad_number: number;
  view_count: number;
  license_number: string | null;
  license_expiry_date: string | null;
  ad_source: string | null;
  deed_area_sqm: number | null;
  owner_id: string;
  governorates: { name_ar: string; name_en: string } | null;
};

// Powers the full Listing Details screen — the real listing row (joined with
// its real governorate name), its real ordered photos, and its real owner's
// profile, in two round trips total. RLS already scopes this to published
// listings (or the owner's own), same as everywhere else.
export async function fetchListingDetail(listingId: string): Promise<{ data: ListingDetail | null; error: string | null }> {
  const { data: listing, error } = await supabase
    .from('listings')
    .select(
      `id, title, description, category, listing_type, price_usd, city, area, lat, lng, area_sqm,
       bedrooms, bathrooms, living_rooms, floor, year_built, condition,
       land_type, frontage_m, road_access_description, has_building_permit, ceiling_height_m,
       furnished, lease_term, down_payment_usd, amenities, contact_phone,
       is_verified_listing, created_at, updated_at, ad_number, view_count,
       license_number, license_expiry_date, ad_source, deed_area_sqm, owner_id,
       governorates ( name_ar, name_en )`
    )
    .eq('id', listingId)
    .maybeSingle()
    .returns<ListingDetailRow>();

  if (error || !listing) {
    return { data: null, error: error?.message ?? 'not_found' };
  }

  const [{ data: photoRows }, { data: ownerProfile }] = await Promise.all([
    supabase.from('listing_photos').select('storage_path').eq('listing_id', listingId).order('sort_order', { ascending: true }),
    supabase.from('profiles').select('full_name, avatar_url, is_verified').eq('id', listing.owner_id).maybeSingle(),
  ]);

  const photos = (photoRows ?? []).map(
    (p) => supabase.storage.from('listing-photos').getPublicUrl(p.storage_path).data.publicUrl
  );

  return {
    data: {
      id: listing.id,
      ownerId: listing.owner_id,
      title: listing.title,
      description: listing.description,
      category: listing.category,
      listingType: listing.listing_type,
      priceUsd: listing.price_usd,
      city: listing.city,
      area: listing.area,
      governorateNameAr: listing.governorates?.name_ar ?? '',
      governorateNameEn: listing.governorates?.name_en ?? '',
      lat: listing.lat,
      lng: listing.lng,
      areaSqm: listing.area_sqm,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      livingRooms: listing.living_rooms,
      floor: listing.floor,
      yearBuilt: listing.year_built,
      condition: listing.condition,
      landType: listing.land_type,
      frontageM: listing.frontage_m,
      roadAccessDescription: listing.road_access_description,
      hasBuildingPermit: listing.has_building_permit,
      ceilingHeightM: listing.ceiling_height_m,
      furnished: listing.furnished,
      leaseTerm: listing.lease_term,
      downPaymentUsd: listing.down_payment_usd,
      amenities: listing.amenities ?? [],
      contactPhone: listing.contact_phone,
      isVerifiedListing: listing.is_verified_listing,
      createdAt: listing.created_at,
      updatedAt: listing.updated_at,
      adNumber: listing.ad_number,
      viewCount: listing.view_count,
      licenseNumber: listing.license_number,
      licenseExpiryDate: listing.license_expiry_date,
      adSource: listing.ad_source,
      deedAreaSqm: listing.deed_area_sqm,
      photos,
      ownerFullName: ownerProfile?.full_name ?? null,
      ownerAvatarUrl: ownerProfile?.avatar_url ?? null,
      ownerIsVerified: ownerProfile?.is_verified ?? false,
    },
    error: null,
  };
}

// Calls the server-side RPC (increment_listing_view_count in
// 20260907000000_view_count.sql) that's the only real way view_count ever
// changes — never a raw client-side UPDATE. The RPC itself is the one that
// decides whether this view actually counts (published only, never the
// listing's own owner), so a call here is a real "someone opened this
// listing" signal, not a value the client gets to pick.
export async function incrementListingViewCount(listingId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('increment_listing_view_count', { p_listing_id: listingId });
  return { error: error?.message ?? null };
}

export type PublicProfile = {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: string;
};

// Powers the public advertiser profile screen — every field here is real,
// straight from the `profiles` row created by the real signup trigger.
export async function fetchPublicProfile(userId: string): Promise<{ data: PublicProfile | null; error: string | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, is_verified, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return { data: null, error: error?.message ?? 'not_found' };
  }

  return {
    data: {
      id: data.id,
      fullName: data.full_name,
      avatarUrl: data.avatar_url,
      isVerified: data.is_verified,
      createdAt: data.created_at,
    },
    error: null,
  };
}

// The real count that drives the profile screen's "N listings" stat —
// recomputed fresh each time the screen loads/refocuses, so a listing that
// just got published is reflected immediately, not cached/stale.
export async function fetchPublishedListingsCountByOwner(ownerId: string): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('status', 'published');
  return { count: count ?? 0, error: error?.message ?? null };
}

// The real list of an owner's published listings shown on their profile —
// same shape/cover-photo resolution as fetchListingsInBounds, just scoped
// by owner_id instead of a map viewport.
export async function fetchListingsByOwner(ownerId: string): Promise<{ data: ListingPreview[]; error: string | null }> {
  const { data, error } = await supabase
    .from('listings')
    .select('id, title, category, city, area, price_usd, bedrooms, bathrooms, area_sqm, listing_photos(storage_path, sort_order)')
    .eq('owner_id', ownerId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .returns<ListingWithPhotosRow[]>();

  if (error || !data) {
    return { data: [], error: error?.message ?? null };
  }

  return { data: data.map(mapListingWithPhotosRow), error: null };
}
