export type ListingCategory = 'apartment' | 'villa' | 'house' | 'land' | 'office' | 'shop' | 'building';
export type ListingPurpose = 'sale' | 'rent';

export type MockListing = {
  id: string;
  title: string;
  location: string;
  category: ListingCategory;
  purpose: ListingPurpose;
  price: number;
  latitude: number;
  longitude: number;
  photo: string;
  bedrooms?: number;
  bathrooms?: number;
  areaSqm: number;
};

// Damascus-area coordinates, scattered for map demo purposes. Real listings
// replace this once the post-listing wizard (phase 5) writes to Supabase.
export const MOCK_LISTINGS: MockListing[] = [
  {
    id: '1',
    title: 'فيلا حديثة',
    location: 'المالكي، دمشق',
    category: 'villa',
    purpose: 'sale',
    price: 185000,
    latitude: 33.5228,
    longitude: 36.2812,
    photo: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&h=400&fit=crop',
    bedrooms: 4,
    bathrooms: 3,
    areaSqm: 320,
  },
  {
    id: '2',
    title: 'شقة مطلة على الجبل',
    location: 'أبو رمانة، دمشق',
    category: 'apartment',
    purpose: 'sale',
    price: 60000,
    latitude: 33.5183,
    longitude: 36.2865,
    photo: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&h=400&fit=crop',
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 110,
  },
  {
    id: '3',
    title: 'شقة عائلية واسعة',
    location: 'المزة، دمشق',
    category: 'apartment',
    purpose: 'rent',
    price: 750,
    latitude: 33.5079,
    longitude: 36.2599,
    photo: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&h=400&fit=crop',
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 160,
  },
  {
    id: '4',
    title: 'بيت عربي تراثي',
    location: 'دمشق القديمة',
    category: 'house',
    purpose: 'sale',
    price: 124000,
    latitude: 33.5117,
    longitude: 36.3021,
    photo: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=400&fit=crop',
    bedrooms: 3,
    bathrooms: 2,
    areaSqm: 200,
  },
  {
    id: '5',
    title: 'أرض سكنية مطلة',
    location: 'قدسيا، ريف دمشق',
    category: 'land',
    purpose: 'sale',
    price: 42000,
    latitude: 33.5462,
    longitude: 36.2478,
    photo: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&h=400&fit=crop',
    areaSqm: 500,
  },
  {
    id: '6',
    title: 'أرض زراعية',
    location: 'دوما، ريف دمشق',
    category: 'land',
    purpose: 'sale',
    price: 34000,
    latitude: 33.5722,
    longitude: 36.4021,
    photo: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&h=400&fit=crop',
    areaSqm: 1200,
  },
  {
    id: '7',
    title: 'مكتب إداري',
    location: 'شارع بغداد، دمشق',
    category: 'office',
    purpose: 'rent',
    price: 400,
    latitude: 33.5145,
    longitude: 36.2921,
    photo: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=400&fit=crop',
    areaSqm: 80,
  },
  {
    id: '8',
    title: 'محل تجاري بموقع مميز',
    location: 'الشعلان، دمشق',
    category: 'shop',
    purpose: 'rent',
    price: 600,
    latitude: 33.5169,
    longitude: 36.2934,
    photo: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=400&fit=crop',
    areaSqm: 60,
  },
  {
    id: '9',
    title: 'عمارة سكنية كاملة',
    location: 'برزة، دمشق',
    category: 'building',
    purpose: 'sale',
    price: 1200000,
    latitude: 33.5411,
    longitude: 36.3187,
    photo: 'https://images.unsplash.com/photo-1449844908441-8829872d2607?w=400&h=400&fit=crop',
    areaSqm: 900,
  },
  {
    id: '10',
    title: 'شقة قريبة من الجامعة',
    location: 'ركن الدين، دمشق',
    category: 'apartment',
    purpose: 'rent',
    price: 350,
    latitude: 33.5333,
    longitude: 36.2963,
    photo: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=400&h=400&fit=crop',
    bedrooms: 1,
    bathrooms: 1,
    areaSqm: 70,
  },
  {
    id: '11',
    title: 'فيلا بحديقة خاصة',
    location: 'يعفور، ريف دمشق',
    category: 'villa',
    purpose: 'rent',
    price: 1500,
    latitude: 33.4893,
    longitude: 36.2241,
    photo: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=400&h=400&fit=crop',
    bedrooms: 5,
    bathrooms: 4,
    areaSqm: 420,
  },
  {
    id: '12',
    title: 'بيت هادئ بحي سكني',
    location: 'جرمانا، ريف دمشق',
    category: 'house',
    purpose: 'rent',
    price: 500,
    latitude: 33.4839,
    longitude: 36.3374,
    photo: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=400&fit=crop',
    bedrooms: 2,
    bathrooms: 1,
    areaSqm: 130,
  },
];

// Listings shown as pins reflect only their own bed/bath/area when the
// category has them (spec §5 field matrix) — land/office/shop/building show
// area only.
export function hasRoomSpecs(category: ListingCategory): boolean {
  return category === 'apartment' || category === 'villa' || category === 'house';
}

export const TOTAL_LISTINGS_COUNT = 7291; // matches the mockup's illustrative "٥٣ من ٧٬٢٩١ إعلان" ratio
