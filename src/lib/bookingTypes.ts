// الحجوزات — a genuinely separate short-term/nightly booking marketplace
// from الإعلانات (see src/lib/listingTypes.ts, completely untouched by
// this file). Exactly 5 real booking types, each with only the fields
// that genuinely apply to it. Matches
// supabase/migrations/20260914000000_booking_marketplace_v2.sql's
// `booking_listings.booking_type` check constraint exactly.

export type BookingListingType = 'furnished_apartment' | 'furnished_studio' | 'furnished_villa' | 'chalet' | 'wedding_hall';

export type PriceUnit = 'per_night' | 'per_event';

export type HallType = 'indoor' | 'outdoor' | 'both';

export const ALL_BOOKING_TYPES: BookingListingType[] = [
  'furnished_apartment',
  'furnished_studio',
  'furnished_villa',
  'chalet',
  'wedding_hall',
];

export const BOOKING_TYPE_LABEL_KEY: Record<BookingListingType, string> = {
  furnished_apartment: 'bookingTypes.furnishedApartment',
  furnished_studio: 'bookingTypes.furnishedStudio',
  furnished_villa: 'bookingTypes.furnishedVilla',
  chalet: 'bookingTypes.chalet',
  wedding_hall: 'bookingTypes.weddingHall',
};

// The one real place that decides "is this type priced per night or per
// event" — both the posting form and the details/search screens read this
// instead of guessing from booking_type inline.
export function priceUnitForType(type: BookingListingType): PriceUnit {
  return type === 'wedding_hall' ? 'per_event' : 'per_night';
}

export function isAccommodationType(type: BookingListingType): boolean {
  return type !== 'wedding_hall';
}

// Which real spec fields apply to which type — the single source of truth
// the search filter sheet, the posting form, and the details screen all
// read from, so a field can never be shown for a type it doesn't apply to
// in one place and forgotten in another. No guest-count/capacity field —
// deliberately not part of this flow.
//
// floorNumber is semantically different per type: for the two apartment-
// style types it means "which floor is this unit on" (الدور); for
// furnished_villa it means "how many floors does the villa have" (عدد
// الطوابق) — the UI picks the right label from bookingType, never both.
export type BookingTypeFieldFlags = {
  bedrooms: boolean;
  bathrooms: boolean;
  beds: boolean;
  hallFields: boolean;
  stayLength: boolean; // minimum/maximum nights are user-editable (accommodation only)
  areaSqm: boolean;
  livingRooms: boolean;
  floorNumber: boolean;
  streetWidth: boolean; // عرض الشارع — independent-access properties only
  propertyAge: boolean; // عمر العقار
  category: boolean; // الفئة — free-text classification
  masterBedrooms: boolean; // غرف نوم ماستر
  receptionRooms: boolean; // غرف استقبال / مجلس
};

export const BOOKING_TYPE_FIELDS: Record<BookingListingType, BookingTypeFieldFlags> = {
  // شقة مفروشة، استديو مفروش، وفيلا مفروشة share the exact same تفاصيل
  // المكان field set — the same 10 fields across the same 3 sections,
  // regardless of which of the 3 is selected in step 1.
  furnished_apartment: {
    bedrooms: true, bathrooms: true, beds: true, hallFields: false, stayLength: true,
    areaSqm: true, livingRooms: true, floorNumber: true,
    streetWidth: true, propertyAge: true, category: true, masterBedrooms: true, receptionRooms: true,
  },
  furnished_studio: {
    bedrooms: true, bathrooms: true, beds: true, hallFields: false, stayLength: true,
    areaSqm: true, livingRooms: true, floorNumber: true,
    streetWidth: true, propertyAge: true, category: true, masterBedrooms: true, receptionRooms: true,
  },
  furnished_villa: {
    bedrooms: true, bathrooms: true, beds: true, hallFields: false, stayLength: true,
    areaSqm: true, livingRooms: true, floorNumber: true,
    streetWidth: true, propertyAge: true, category: true, masterBedrooms: true, receptionRooms: true,
  },
  chalet: {
    bedrooms: true, bathrooms: true, beds: true, hallFields: false, stayLength: true,
    areaSqm: true, livingRooms: false, floorNumber: false,
    streetWidth: true, propertyAge: true, category: true, masterBedrooms: true, receptionRooms: true,
  },
  wedding_hall: {
    bedrooms: false, bathrooms: false, beds: false, hallFields: true, stayLength: false,
    areaSqm: false, livingRooms: false, floorNumber: false,
    streetWidth: false, propertyAge: false, category: false, masterBedrooms: false, receptionRooms: false,
  },
};

export const HALL_TYPE_LABEL_KEY: Record<HallType, string> = {
  indoor: 'bookingTypes.hallIndoor',
  outdoor: 'bookingTypes.hallOutdoor',
  both: 'bookingTypes.hallBoth',
};

export const ALL_HALL_TYPES: HallType[] = ['indoor', 'outdoor', 'both'];
