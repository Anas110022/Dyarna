import type { Region } from 'react-native-maps';

// Roughly centers and frames all of Syria — shared default for both the Home
// map and the post-listing wizard's location picker, before any pin/marker
// narrows the view.
export const SYRIA_DEFAULT_REGION: Region = {
  latitude: 34.8,
  longitude: 38.5,
  latitudeDelta: 6,
  longitudeDelta: 6,
};

// The Home screen's own initial camera — deliberately wider than
// SYRIA_DEFAULT_REGION (which the post-listing location picker still uses
// unchanged) so the very first thing a user sees is the whole country
// comfortably framed with a little surrounding context, not a close-in
// crop. ~1.7x margin beyond Syria's real bounding box
// (SYRIA_MAP_BOUNDARY) on each axis.
export const SYRIA_HOME_INITIAL_REGION: Region = {
  latitude: 34.75,
  longitude: 39.0,
  latitudeDelta: 9.5,
  longitudeDelta: 12,
};

// The exact same real Syria bounding box already enforced server-side by
// the `listings` table's lat/lng check constraint
// (supabase/migrations/20260902000000_listings.sql) — reused here so "what
// the map lets you look at" and "what counts as a valid Syrian coordinate"
// never drift apart.
export const SYRIA_MAP_BOUNDARY = {
  northEast: { latitude: 37.5, longitude: 42.5 },
  southWest: { latitude: 32.0, longitude: 35.5 },
};

// Real, deliberately generous limits (in meters, matching react-native-maps'
// centerCoordinateDistance unit) — ~1400km comfortably covers the wider
// SYRIA_HOME_INITIAL_REGION framing (so the initial "zoomed out with
// context" view isn't immediately clamped tighter by the zoom cap), ~300m
// is a normal close street-level zoom. Zoom itself is never disabled, only
// bounded so the camera can't drift to a whole-globe or another-country view.
export const SYRIA_CAMERA_ZOOM_RANGE = {
  minCenterCoordinateDistance: 300,
  maxCenterCoordinateDistance: 1_400_000,
};

// The single automatic threshold Home's map (app/(tabs)/index.tsx) uses to
// decide which of its two zoom levels is active — purely a function of the
// camera's current latitudeDelta, never a separate manual state:
// - Above this: Syria overview — all 14 governorate signs, no property pins.
// - At or below this: property level — no signs, real Supabase listings in
//   the current visible area.
// Applies identically to all 14 governorates (GOVERNORATE_ZOOM_DELTA in
// src/lib/governorateCoordinates.ts is comfortably below this, so flying to
// any city lands directly in property level).
export const PROPERTY_DETAIL_ZOOM_THRESHOLD = 1.0;
