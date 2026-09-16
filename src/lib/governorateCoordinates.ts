// Real coordinates for Syria's 14 governorate seats — looked up live against
// OpenStreetMap/Nominatim (not memorized/invented), keyed by the same ids
// used in the real `governorates` table (supabase/migrations/20260902000000_listings.sql).
// Used only to pan the Home map to a real location when a governorate
// quick-button is tapped; this is geographic reference data, not listing data.
export const GOVERNORATE_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  damascus: { latitude: 33.5130695, longitude: 36.3095814 },
  rif_dimashq: { latitude: 33.5696629, longitude: 36.4012933 },
  aleppo: { latitude: 36.19924, longitude: 37.1637253 },
  homs: { latitude: 34.7333334, longitude: 36.7166667 },
  hama: { latitude: 35.1343368, longitude: 36.7496276 },
  latakia: { latitude: 35.579874, longitude: 35.9772699 },
  tartus: { latitude: 34.8936225, longitude: 35.885167 },
  idlib: { latitude: 35.9301902, longitude: 36.6352596 },
  raqqa: { latitude: 35.949678, longitude: 39.0089212 },
  deir_ezzor: { latitude: 35.3333335, longitude: 40.1499999 },
  hasakah: { latitude: 36.5013738, longitude: 40.7469948 },
  daraa: { latitude: 32.6227776, longitude: 36.1067639 },
  suwayda: { latitude: 32.7093878, longitude: 36.5687496 },
  quneitra: { latitude: 33.1244369, longitude: 35.8230108 },
};

// Close neighborhood/street-level zoom for jumping into one governorate —
// real roads and streets legible. Whether property pins are actually shown
// at this zoom is governed only by the manual map-mode toggle in
// app/(tabs)/index.tsx (mapMode), never by zoom level itself — flying here
// never switches modes on its own. One shared delta used by every
// governorate via goToGovernorate() — never per-city, so no governorate
// ends up more/less zoomed than another.
export const GOVERNORATE_ZOOM_DELTA = { latitudeDelta: 0.02, longitudeDelta: 0.02 };
