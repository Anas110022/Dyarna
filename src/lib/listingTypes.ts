// Real domain taxonomy shared across the Home map, the post-listing wizard,
// and the listings data-access layer — not mock content. Matches the
// `listings.category`/`listings.listing_type` check constraints exactly
// (see supabase/migrations/20260902000000_listings.sql,
// supabase/migrations/20260903010000_categories_amenities.sql for the
// warehouse/farm/chalet additions, and
// supabase/migrations/20260912000000_more_categories.sql for the batch
// below).

export type ListingCategory =
  | 'apartment'
  | 'villa'
  | 'house'
  | 'land'
  | 'office'
  | 'shop'
  | 'building'
  | 'warehouse'
  | 'farm'
  | 'chalet'
  | 'room'
  | 'camp'
  | 'kiosk'
  | 'cinema'
  | 'parking_lot'
  | 'bank'
  | 'factory'
  | 'health_center'
  | 'power_station'
  | 'telecom_tower'
  | 'complex'
  | 'tower'
  | 'hotel'
  | 'workshop'
  | 'school'
  | 'station';
export type DealType = 'rent' | 'sale';

export const CATEGORY_LABEL_KEY: Record<ListingCategory, string> = {
  apartment: 'home.categoryApartment',
  villa: 'home.categoryVilla',
  house: 'home.categoryHouse',
  land: 'home.categoryLand',
  office: 'home.categoryOffice',
  shop: 'home.categoryShop',
  building: 'home.categoryBuilding',
  warehouse: 'home.categoryWarehouse',
  farm: 'home.categoryFarm',
  chalet: 'home.categoryChalet',
  room: 'home.categoryRoom',
  camp: 'home.categoryCamp',
  kiosk: 'home.categoryKiosk',
  cinema: 'home.categoryCinema',
  parking_lot: 'home.categoryParkingLot',
  bank: 'home.categoryBank',
  factory: 'home.categoryFactory',
  health_center: 'home.categoryHealthCenter',
  power_station: 'home.categoryPowerStation',
  telecom_tower: 'home.categoryTelecomTower',
  complex: 'home.categoryComplex',
  tower: 'home.categoryTower',
  hotel: 'home.categoryHotel',
  workshop: 'home.categoryWorkshop',
  school: 'home.categorySchool',
  station: 'home.categoryStation',
};

// Categories where bedrooms/bathrooms/living-rooms are meaningful.
export const BED_BATH_CATEGORIES: ListingCategory[] = ['apartment', 'villa', 'house', 'chalet'];

// Categories where the land-specific fields (land_type etc.) are meaningful.
export const LAND_LIKE_CATEGORIES: ListingCategory[] = ['land', 'farm'];

// The single canonical category list — the Home filter sheet and the
// post-listing wizard both read from this instead of keeping their own
// copies, so a new category can never be added to one and silently missed
// in the other again.
export const ALL_CATEGORIES: ListingCategory[] = [
  'apartment',
  'villa',
  'house',
  'land',
  'office',
  'shop',
  'building',
  'warehouse',
  'farm',
  'chalet',
  'room',
  'camp',
  'kiosk',
  'cinema',
  'parking_lot',
  'bank',
  'factory',
  'health_center',
  'power_station',
  'telecom_tower',
  'complex',
  'tower',
  'hotel',
  'workshop',
  'school',
  'station',
];
