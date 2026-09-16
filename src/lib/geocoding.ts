// Reverse-geocodes a dropped map pin into a real city/area/street, so the
// post-listing wizard never lets someone type a fake address by hand — city
// and area are always derived from the actual coordinates. Plain HTTP call
// (OpenStreetMap/Nominatim) rather than expo-location, since only
// expo-image-picker and react-native-maps were approved as new dependencies
// for this feature.

export type ReverseGeocodeResult = {
  city: string | null;
  area: string | null;
  street: string | null;
};

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  road?: string;
};

export async function reverseGeocode(
  lat: number,
  lng: number,
  language: 'ar' | 'en'
): Promise<{ result: ReverseGeocodeResult | null; error: string | null }> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=${language}`;
    const response = await fetch(url, {
      headers: {
        // Required by Nominatim's usage policy to identify the calling app.
        'User-Agent': 'DyarnaApp/1.0 (Syria real estate listings)',
      },
    });

    if (!response.ok) {
      return { result: null, error: `HTTP ${response.status}` };
    }

    const data: { address?: NominatimAddress } = await response.json();
    const address = data.address ?? {};

    const city = address.city ?? address.town ?? address.village ?? address.municipality ?? null;
    const area = address.suburb ?? address.neighbourhood ?? address.quarter ?? null;
    const street = address.road ?? null;

    if (!city && !area && !street) {
      return { result: null, error: 'no_address_found' };
    }

    return { result: { city, area, street }, error: null };
  } catch {
    return { result: null, error: 'network_error' };
  }
}
