import { Linking } from 'react-native';

// Real driving-route distance/duration between two real coordinates — an
// actual road-network routing calculation (OSRM), not a straight-line
// (haversine) estimate mislabeled as "driving". Same approach as
// src/lib/geocoding.ts: a plain HTTP call to a free OpenStreetMap-ecosystem
// service, no API key, no new dependency.
//
// Note: router.project-osrm.org is OSRM's public demo server — fine for a
// user tapping "how far is this", but it's not intended for heavy
// production traffic; swap in a dedicated routing provider if usage grows.

export type DrivingRoute = {
  distanceKm: number;
  durationMinutes: number;
};

export async function fetchDrivingRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<{ result: DrivingRoute | null; error: string | null }> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`;
    const response = await fetch(url);

    if (!response.ok) {
      return { result: null, error: `HTTP ${response.status}` };
    }

    const data: { code: string; routes?: { distance: number; duration: number }[] } = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      return { result: null, error: 'no_route_found' };
    }

    const route = data.routes[0];

    return {
      result: {
        distanceKm: Math.round((route.distance / 1000) * 10) / 10,
        durationMinutes: Math.round(route.duration / 60),
      },
      error: null,
    };
  } catch {
    return { result: null, error: 'network_error' };
  }
}

// Always Google Maps: the native app if installed, otherwise Google's own
// web Maps URL (not Apple Maps) — points at a real, already-known
// destination (a listing's real stored lat/lng), never a fake/typed
// address. Needs no location permission of any kind — opening turn-by-turn
// directions to a known destination doesn't require knowing where the
// device currently is; Google Maps itself asks for that if the user picks
// "start navigation" once it's open. Shared by the listing details map
// preview and the full-screen nearby-services map so both "الذهاب إلى
// الموقع" buttons stay in sync.
export async function openGoogleMapsNavigation(destination: { lat: number; lng: number }): Promise<void> {
  const canOpenGoogleMaps = await Linking.canOpenURL('comgooglemaps://');
  if (canOpenGoogleMaps) {
    await Linking.openURL(`comgooglemaps://?daddr=${destination.lat},${destination.lng}&directionsmode=driving`);
  } else {
    await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=driving`);
  }
}
