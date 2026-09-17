import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

import { useI18n, type Locale } from '@/src/i18n';
import { colors, fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { supabase } from '@/src/lib/supabase';
import { AuthPromptModal, useAuthPrompt } from '@/src/components/AuthPrompt';
import {
  ALL_CATEGORIES,
  BED_BATH_CATEGORIES,
  CATEGORY_LABEL_KEY,
  LAND_LIKE_CATEGORIES,
  type DealType,
  type ListingCategory,
} from '@/src/lib/listingTypes';
import {
  PROPERTY_DETAIL_ZOOM_THRESHOLD,
  SYRIA_CAMERA_ZOOM_RANGE,
  SYRIA_HOME_INITIAL_REGION,
  SYRIA_MAP_BOUNDARY,
} from '@/src/lib/mapRegion';
import { GOVERNORATE_COORDINATES, GOVERNORATE_ZOOM_DELTA } from '@/src/lib/governorateCoordinates';
import {
  fetchAmenityTypes,
  fetchGovernorates,
  fetchListingPreview,
  fetchListingsInBounds,
  fetchPublishedListingPinsInBounds,
  fetchPublishedListings,
  fetchPublishedListingsCount,
  searchPublishedListings,
  type AmenityType,
  type Governorate,
  type ListingFilterParams,
  type ListingPreview,
  type PublishedListingPin,
} from '@/src/lib/listings';

type FurnishedValue = 'unfurnished' | 'partial' | 'full';
type LandTypeValue = 'residential' | 'agricultural' | 'commercial';

// Draft/applied filter state is kept as raw strings (matching the numeric
// TextInput pattern already used in the post-listing wizard) and converted
// to real numbers only when actually querying — see buildFilterParams.
type AdvancedFilterState = {
  minPrice: string;
  maxPrice: string;
  minArea: string;
  maxArea: string;
  minBedrooms: string;
  minBathrooms: string;
  minLivingRooms: string;
  minCeilingHeight: string;
  furnished: FurnishedValue | null;
  landType: LandTypeValue | null;
  amenities: string[];
};

const EMPTY_ADVANCED_FILTERS: AdvancedFilterState = {
  minPrice: '',
  maxPrice: '',
  minArea: '',
  maxArea: '',
  minBedrooms: '',
  minBathrooms: '',
  minLivingRooms: '',
  minCeilingHeight: '',
  furnished: null,
  landType: null,
  amenities: [],
};

function parseNumOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function buildFilterParams(
  dealType: DealType,
  category: ListingCategory | 'all',
  f: AdvancedFilterState
): ListingFilterParams {
  return {
    dealType,
    category,
    minPrice: parseNumOrNull(f.minPrice),
    maxPrice: parseNumOrNull(f.maxPrice),
    minArea: parseNumOrNull(f.minArea),
    maxArea: parseNumOrNull(f.maxArea),
    minBedrooms: parseNumOrNull(f.minBedrooms),
    minBathrooms: parseNumOrNull(f.minBathrooms),
    minLivingRooms: parseNumOrNull(f.minLivingRooms),
    minCeilingHeight: parseNumOrNull(f.minCeilingHeight),
    furnished: f.furnished,
    landType: f.landType,
    amenities: f.amenities,
  };
}

// Clears whichever advanced-filter fields stop being meaningful for a given
// category, so applied/draft state never silently over-filters on a field
// the user can no longer even see in the sheet.
function clearIrrelevantFilters(f: AdvancedFilterState, category: ListingCategory | 'all'): AdvancedFilterState {
  const showsBedBath = category !== 'all' && BED_BATH_CATEGORIES.includes(category);
  const showsLandType = category !== 'all' && LAND_LIKE_CATEGORIES.includes(category);
  const showsCeilingHeight = category === 'warehouse';
  return {
    ...f,
    minBedrooms: showsBedBath ? f.minBedrooms : '',
    minBathrooms: showsBedBath ? f.minBathrooms : '',
    minLivingRooms: showsBedBath ? f.minLivingRooms : '',
    landType: showsLandType ? f.landType : null,
    minCeilingHeight: showsCeilingHeight ? f.minCeilingHeight : '',
  };
}

// The real, complete category list — reused from listingTypes.ts (the same
// single source إضافة إعلان's "نوع العقار" step already reads from) instead
// of keeping a separate, shorter copy here. 'all' is a Home-only filter
// value, never a real listing category, so it's prefixed on here rather
// than living in the shared list itself.
const CATEGORIES: (ListingCategory | 'all')[] = ['all', ...ALL_CATEGORIES];

// How many of the real categories the compact top bar shows directly
// before the "المزيد" chip — the rest are one tap away in the full sheet.
// Keeps the original, already-familiar categories inline and unchanged;
// only the newer additions moved behind "المزيد".
const COMPACT_CATEGORY_COUNT = 11; // 'all' + the 10 original categories

const EASTERN_ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

function groupThousands(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatCount(value: number, locale: Locale): string {
  const grouped = groupThousands(value);
  if (locale !== 'ar') return grouped;
  return grouped.replace(/[0-9]/g, (digit) => EASTERN_ARABIC_DIGITS[Number(digit)]).replace(/,/g, '٬');
}

function formatListingCount(count: number, total: number, locale: Locale, template: string): string {
  return template.replace('{count}', formatCount(count, locale)).replace('{total}', formatCount(total, locale));
}

function formatPriceShort(usd: number): string {
  if (usd >= 1_000_000) {
    return `$${(usd / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (usd >= 1000) {
    return `$${Math.round(usd / 1000)}K`;
  }
  return `$${usd}`;
}

function formatPriceFull(usd: number): string {
  return `$${groupThousands(usd)}`;
}

function regionToBounds(region: Region) {
  return {
    minLat: region.latitude - region.latitudeDelta / 2,
    maxLat: region.latitude + region.latitudeDelta / 2,
    minLng: region.longitude - region.longitudeDelta / 2,
    maxLng: region.longitude + region.longitudeDelta / 2,
  };
}

// Map-overlay pins/city labels are rendered by module-level memo()
// components (PropertyMarker/CityLabelMarker, below) for real, documented
// performance reasons tied to react-native-maps' tracksViewChanges timing
// — they can't reach a component-scoped useTheme() the way the rest of
// this screen's chrome can. They keep this screen's original fixed pine/
// gold look in both themes on purpose: the map tiles underneath never
// switch to a dark style in this app, so a themed dark pin would actually
// read worse against the always-light map than the current fixed brand
// look does.
const pinStyles = StyleSheet.create({
  pin: {
    backgroundColor: colors.pine,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    shadowColor: colors.pine,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  pinActive: {
    backgroundColor: colors.gold,
    transform: [{ scale: 1.1 }],
    shadowOpacity: 0.35,
    elevation: 8,
  },
  pinText: {
    fontFamily: fonts.headingBold,
    fontSize: 11,
    color: colors.goldSoft,
  },
  pinTextActive: {
    fontFamily: fonts.headingBlack,
    color: colors.pine,
  },
  cityLabel: {
    alignItems: 'center',
  },
  cityLabelPill: {
    backgroundColor: colors.pine,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.gold,
    shadowColor: colors.pine,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  cityLabelText: {
    fontFamily: fonts.headingExtraBold,
    fontSize: 12.5,
    color: colors.goldSoft,
    letterSpacing: 0.2,
  },
  cityLabelDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.gold,
    marginTop: 3,
    borderWidth: 1,
    borderColor: colors.pine,
  },
});

// A custom-content <Marker> (anything with real children, like this price
// pill) has its view re-snapshotted to a bitmap by react-native-maps on
// every prop change while `tracksViewChanges` is true — react-native-maps'
// documented default. Left on, EVERY pin re-snapshots on every parent
// re-render (e.g. the one `onRegionChangeComplete` triggers at the end of
// every pan/zoom gesture), which is the real cost behind "laggy during map
// movement" with more than a couple of real listings on screen — not
// anything about the gesture itself. This settles to false once a
// marker's own look (its real price, or its selected/unselected style)
// has actually finished changing, and back to true only for the brief
// window right after it changes again — so a marker that isn't the one
// being tapped never re-snapshots just because the camera moved.
// Wrapped in memo so a pin whose own props haven't changed doesn't even
// re-run this component during a parent re-render from panning/zooming.
const PropertyMarker = memo(function PropertyMarker({
  pin,
  isActive,
  onPress,
}: {
  pin: PublishedListingPin;
  isActive: boolean;
  onPress: (id: string) => void;
}) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    // Deferred so both setState calls happen on a later macrotask, never
    // synchronously during this effect's own execution.
    const enableTimer = setTimeout(() => setTracksViewChanges(true), 0);
    const disableTimer = setTimeout(() => setTracksViewChanges(false), 300);
    return () => {
      clearTimeout(enableTimer);
      clearTimeout(disableTimer);
    };
  }, [isActive, pin.priceUsd]);

  const handlePress = useCallback(() => onPress(pin.id), [onPress, pin.id]);

  return (
    <Marker
      coordinate={{ latitude: pin.lat, longitude: pin.lng }}
      onPress={handlePress}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
    >
      <View style={[pinStyles.pin, isActive && pinStyles.pinActive]}>
        <Text style={[pinStyles.pinText, isActive && pinStyles.pinTextActive]}>{formatPriceShort(pin.priceUsd)}</Text>
      </View>
    </Marker>
  );
});

// City labels never change their own look after mount (no active/inactive
// state, no live data), so tracksViewChanges only needs one snapshot ever
// — already true before this change (see the original tracksViewChanges
// ={false}). The memo here is the actual fix: without it, all 14 label
// elements (and their onPress closures) were recreated from scratch on
// every pan/zoom-triggered re-render even though nothing about them ever
// changes between one governorate fetch and the next.
const CityLabelMarker = memo(function CityLabelMarker({
  governorateId,
  coordinate,
  label,
  onSelect,
}: {
  governorateId: string;
  coordinate: { latitude: number; longitude: number };
  label: string;
  onSelect: (id: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(governorateId), [onSelect, governorateId]);

  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false} onPress={handlePress}>
      <View style={pinStyles.cityLabel} pointerEvents="none">
        <View style={pinStyles.cityLabelPill}>
          <Text style={pinStyles.cityLabelText}>{label}</Text>
        </View>
        <View style={pinStyles.cityLabelDot} />
      </View>
    </Marker>
  );
});

export default function HomeScreen() {
  const { t, locale } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mapRef = useRef<MapView>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dealType, setDealType] = useState<DealType>('rent');
  const [category, setCategory] = useState<ListingCategory | 'all'>('all');

  const [pins, setPins] = useState<PublishedListingPin[]>([]);
  const [loadingPins, setLoadingPins] = useState(true);
  const [totalPublished, setTotalPublished] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<ListingPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [locating, setLocating] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);

  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [amenityTypes, setAmenityTypes] = useState<AmenityType[]>([]);

  // Guest Mode: Home itself needs no session at all (browsing is fully
  // public) — this is only tracked so the two gated entry points below
  // (favorites, post a listing) know whether to prompt for sign-in.
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { authPromptVisible, authPromptIntent, showAuthPrompt, hideAuthPrompt } = useAuthPrompt();

  useFocusEffect(
    useCallback(() => {
      supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    }, [])
  );

  const [currentRegion, setCurrentRegion] = useState<Region>(SYRIA_HOME_INITIAL_REGION);

  // The map's two zoom levels are purely automatic — a single derived
  // boolean off the camera's own latitudeDelta, never a separate manual
  // flag or button. Anything that moves the camera below the threshold (a
  // plain pinch-zoom, or a city tap via goToGovernorate) flips this, no
  // extra step needed — completely independent of the map-visualization
  // toggle below, which only ever changes mapType, never the camera.
  const isPropertyLevel = currentRegion.latitudeDelta <= PROPERTY_DETAIL_ZOOM_THRESHOLD;

  // "خريطة الذكاء الاصطناعي" — a real, already-available Google Maps
  // rendering style (satellite imagery + road/place labels), not an AI
  // service of any kind. Purely a visual toggle: it never touches the
  // camera position/zoom, never touches GPS, and the real property price
  // markers/city-label system above render identically over it — only the
  // base map tiles underneath change. Genuine architecture seam for a
  // future real AI property-analysis layer, without faking one now.
  const [mapVisualization, setMapVisualization] = useState<'standard' | 'aiAnalysis'>('standard');
  const toggleMapVisualization = useCallback(() => {
    setMapVisualization((v) => (v === 'standard' ? 'aiAnalysis' : 'standard'));
  }, []);

  const [listModalOpen, setListModalOpen] = useState(false);
  const [listItems, setListItems] = useState<ListingPreview[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Real search (§4 screen 03 "Search & Filters", reused inside the list
  // sheet) — searches every published listing matching the current
  // rent/sale + category + filter-sheet constraints, not just the ones
  // currently in the map's viewport.
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ListingPreview[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const [appliedFilters, setAppliedFilters] = useState<AdvancedFilterState>(EMPTY_ADVANCED_FILTERS);
  const [draftFilters, setDraftFilters] = useState<AdvancedFilterState>(EMPTY_ADVANCED_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // A single "اختر محافظة" entry point replaces what used to be all 14
  // governorates as one cramped, permanently-visible row of pills — the
  // real governorate list/coordinates themselves are unchanged.
  const [governorateSheetOpen, setGovernorateSheetOpen] = useState(false);

  // Same pattern as the governorate sheet above, now that CATEGORIES holds
  // the full real list (26 categories, not just the original 10): the
  // compact top row keeps showing the original categories directly, and
  // "المزيد" opens a full sheet with every one of them, so nothing is ever
  // out of reach behind horizontal scrolling alone.
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);

  // Real governorate list from Supabase (same source the post-listing wizard
  // uses), fetched once — this drives the quick-location button row below.
  useEffect(() => {
    fetchGovernorates().then(({ data }) => setGovernorates(data));
  }, []);

  // Real amenity taxonomy from Supabase, fetched once — new amenities show
  // up here automatically the moment they're added to amenity_types, no
  // app update needed.
  useEffect(() => {
    fetchAmenityTypes().then(({ data }) => setAmenityTypes(data));
  }, []);

  // Refetches on filter changes AND every time this screen regains focus
  // (e.g. returning from post-listing right after a real submission
  // auto-published) — so a newly published listing shows up without
  // requiring an app restart. Also closes any open preview sheet, since its
  // listing may no longer match a changed filter. `totalPublished` is a
  // real, zoom-level-independent country-wide count; the country-wide
  // `pins` fetch itself only runs at the overview zoom level — at property
  // level, the effect below owns `pins` instead (real listings in the
  // current visible area, not the whole country). Also re-runs whenever
  // `isPropertyLevel` flips back to false (zoomed out past the threshold),
  // so `pins` is refreshed with real country-wide data the moment that
  // happens, not just on the next focus/filter change.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        setSelectedId(null);
        setSelectedPreview(null);
        const { count } = await fetchPublishedListingsCount();
        if (cancelled) return;
        setTotalPublished(count);
        if (isPropertyLevel) return;
        setLoadingPins(true);
        const params = buildFilterParams(dealType, category, appliedFilters);
        const { data } = await fetchPublishedListings(params);
        if (!cancelled) {
          setPins(data);
          setLoadingPins(false);
        }
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [dealType, category, appliedFilters, isPropertyLevel])
  );

  // Property level's own real data source — real published listings whose
  // real lat/lng fall inside the map's CURRENT visible region, refetched as
  // the user pans/zooms (debounced so a quick flick through several small
  // camera moves doesn't fire one query per move, only the last one once
  // the camera settles) and immediately the moment the camera crosses below
  // the zoom threshold, from ANY cause — a city tap, the layers button, or
  // a plain pinch-zoom. A no-op at the overview zoom level — the effect
  // above owns `pins` there.
  useEffect(() => {
    if (!isPropertyLevel) return;
    let cancelled = false;
    const bounds = regionToBounds(currentRegion);
    const params = buildFilterParams(dealType, category, appliedFilters);
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setLoadingPins(true);
      const { data } = await fetchPublishedListingPinsInBounds(bounds, params);
      if (cancelled) return;
      setPins(data);
      setLoadingPins(false);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isPropertyLevel, currentRegion, dealType, category, appliedFilters]);

  const handleMarkerPress = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedPreview(null);
    setLoadingPreview(true);
    fetchListingPreview(id).then(({ data }) => {
      setSelectedPreview(data);
      setLoadingPreview(false);
    });
  }, []);

  const dismissPreview = useCallback(() => {
    setSelectedId(null);
    setSelectedPreview(null);
  }, []);

  // Real native camera restriction (MKMapView/GoogleMap boundary under the
  // hood, not a JS-drawn mask) — called once the native view exists, since
  // setMapBoundaries is an imperative method on the map instance, not a
  // declarative prop.
  const handleMapReady = useCallback(() => {
    mapRef.current?.setMapBoundaries(SYRIA_MAP_BOUNDARY.northEast, SYRIA_MAP_BOUNDARY.southWest);
  }, []);

  const handleMyLocation = useCallback(async () => {
    setLocating(true);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setLocating(false);
      return;
    }
    setLocationGranted(true);
    try {
      const position = await Location.getCurrentPositionAsync({});
      mapRef.current?.animateToRegion(
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        600
      );
    } finally {
      setLocating(false);
    }
  }, []);

  // The one shared entry point every governorate goes through — a city
  // label tap and the "اختر محافظة" sheet both call this, identically, for
  // all 14. It only ever moves the camera; GOVERNORATE_ZOOM_DELTA already
  // lands below PROPERTY_DETAIL_ZOOM_THRESHOLD, so arriving automatically
  // flips into property level (signs hide, real listings appear) the same
  // way any other zoom past that threshold does — no separate state to set.
  const goToGovernorate = useCallback((id: string) => {
    const coordinate = GOVERNORATE_COORDINATES[id];
    if (!coordinate) return;
    mapRef.current?.animateToRegion({ ...coordinate, ...GOVERNORATE_ZOOM_DELTA }, 600);
  }, []);

  // "القائمة" — real published listings whose real lat/lng fall inside the
  // map's current visible region, matching the same rent/sale + category +
  // filter-sheet filters already applied to the pins on screen.
  const openListView = useCallback(() => {
    setListModalOpen(true);
    setLoadingList(true);
    const bounds = regionToBounds(currentRegion);
    const params = buildFilterParams(dealType, category, appliedFilters);
    fetchListingsInBounds(bounds, params).then(({ data }) => {
      setListItems(data);
      setLoadingList(false);
    });
  }, [currentRegion, dealType, category, appliedFilters]);

  const closeListModal = useCallback(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setListModalOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setLoadingSearch(false);
  }, []);

  // Cleanup-only — cancels a pending debounced search if the screen itself
  // unmounts mid-debounce. No setState here, just clearing the timer.
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  // Debounced real search, driven from the input's own change handler
  // (not a useEffect watching searchQuery) — the React-recommended shape
  // for "fetch as the user types": 300ms after the last keystroke, query
  // Supabase under the deal-type/category/filter constraints active right
  // now. An empty query just cancels any pending request; isSearchActive/
  // activeListItems below already fall back to the viewport list.
  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      const trimmed = text.trim();
      if (!trimmed) {
        setLoadingSearch(false);
        return;
      }
      setLoadingSearch(true);
      searchDebounceRef.current = setTimeout(() => {
        const params = buildFilterParams(dealType, category, appliedFilters);
        searchPublishedListings(trimmed, params).then(({ data }) => {
          setSearchResults(data);
          setLoadingSearch(false);
        });
      }, 300);
    },
    [dealType, category, appliedFilters]
  );

  const openListingFromSearch = useCallback((id: string) => {
    closeListModal();
    router.push(`/listing/${id}`);
  }, [closeListModal]);

  // A category's applicable amenities are real data (amenity_types), so an
  // amenity selected under one category that isn't relevant to a newly
  // picked category gets dropped from the filter state.
  const clearInapplicableAmenities = useCallback(
    (f: AdvancedFilterState, nextCategory: ListingCategory | 'all') => {
      if (nextCategory === 'all' || f.amenities.length === 0) return f;
      const applicableKeys = new Set(
        amenityTypes.filter((a) => a.applicableCategories.includes(nextCategory)).map((a) => a.key)
      );
      return { ...f, amenities: f.amenities.filter((key) => applicableKeys.has(key)) };
    },
    [amenityTypes]
  );

  // Switching deal type or category can make part of the currently applied
  // advanced filters meaningless (e.g. "furnished" once you're back on
  // "sale", or bedrooms once you pick "land") — clearing them keeps both
  // the applied and in-progress draft filter state honestly matched to
  // what's actually shown as selectable in the sheet, instead of silently
  // over-filtering.
  const handleDealTypeChange = useCallback((next: DealType) => {
    setDealType(next);
    if (next !== 'rent') {
      setAppliedFilters((f) => (f.furnished ? { ...f, furnished: null } : f));
      setDraftFilters((f) => (f.furnished ? { ...f, furnished: null } : f));
    }
  }, []);

  const handleCategoryChange = useCallback(
    (next: ListingCategory | 'all') => {
      setCategory(next);
      setAppliedFilters((f) => clearInapplicableAmenities(clearIrrelevantFilters(f, next), next));
      setDraftFilters((f) => clearInapplicableAmenities(clearIrrelevantFilters(f, next), next));
    },
    [clearInapplicableAmenities]
  );

  const openFilterSheet = useCallback(() => {
    setDraftFilters(appliedFilters);
    setFilterSheetOpen(true);
  }, [appliedFilters]);

  const applyFilters = useCallback(() => {
    setAppliedFilters(draftFilters);
    setFilterSheetOpen(false);
  }, [draftFilters]);

  const resetDraftFilters = useCallback(() => {
    setDraftFilters(EMPTY_ADVANCED_FILTERS);
  }, []);

  const toggleDraftAmenity = useCallback((key: string) => {
    setDraftFilters((f) => ({
      ...f,
      amenities: f.amenities.includes(key) ? f.amenities.filter((k) => k !== key) : [...f.amenities, key],
    }));
  }, []);

  const activeFilterCount =
    (appliedFilters.minPrice !== '' ? 1 : 0) +
    (appliedFilters.maxPrice !== '' ? 1 : 0) +
    (appliedFilters.minArea !== '' ? 1 : 0) +
    (appliedFilters.maxArea !== '' ? 1 : 0) +
    (appliedFilters.minBedrooms !== '' ? 1 : 0) +
    (appliedFilters.minBathrooms !== '' ? 1 : 0) +
    (appliedFilters.minLivingRooms !== '' ? 1 : 0) +
    (appliedFilters.minCeilingHeight !== '' ? 1 : 0) +
    (appliedFilters.furnished !== null ? 1 : 0) +
    (appliedFilters.landType !== null ? 1 : 0) +
    (appliedFilters.amenities.length > 0 ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  const draftShowsBedBath = category !== 'all' && BED_BATH_CATEGORIES.includes(category);
  const draftShowsLandType = category !== 'all' && LAND_LIKE_CATEGORIES.includes(category);
  const draftShowsCeilingHeight = category === 'warehouse';
  const draftApplicableAmenities =
    category === 'all' ? [] : amenityTypes.filter((a) => a.applicableCategories.includes(category));

  const openPreviewFromList = useCallback((item: ListingPreview) => {
    closeListModal();
    setSelectedId(item.id);
    setSelectedPreview(item);
    setLoadingPreview(false);
  }, [closeListModal]);

  const showBedBath = selectedPreview ? BED_BATH_CATEGORIES.includes(selectedPreview.category) : false;

  const isSearchActive = searchQuery.trim().length > 0;
  const activeListItems = isSearchActive ? searchResults : listItems;
  const trimmedSearchQuery = searchQuery.trim();

  // What the user is currently searching/filtering, spelled out plainly
  // above the results — the real deal-type + category always shown, plus
  // how many extra filter-sheet constraints (price/area/etc.) are active.
  const currentContextLabel =
    (dealType === 'rent' ? t('home.forRent') : t('home.forSale')) +
    ' · ' +
    (category === 'all' ? t('home.categoryAll') : t(CATEGORY_LABEL_KEY[category])) +
    (activeFilterCount > 0 ? ` · ${t('home.activeFiltersSuffix').replace('{count}', formatCount(activeFilterCount, locale))}` : '');

  // The two zoom levels are strict mutual opposites, driven by the one
  // isPropertyLevel boolean above — real governorate signs (all 14, always
  // together) at the overview level, real property pins at the property
  // level. Nothing here singles out any one governorate by id, and nothing
  // but the camera's own zoom decides which layer is showing.
  const showCityLabels = !isPropertyLevel;
  const showPropertyPins = isPropertyLevel;

  const compactCategories = CATEGORIES.slice(0, COMPACT_CATEGORY_COUNT);
  const isActiveCategoryHidden = !compactCategories.includes(category);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        mapType={mapVisualization === 'aiAnalysis' ? 'hybrid' : 'standard'}
        initialRegion={SYRIA_HOME_INITIAL_REGION}
        onRegionChangeComplete={setCurrentRegion}
        onMapReady={handleMapReady}
        cameraZoomRange={SYRIA_CAMERA_ZOOM_RANGE}
        showsUserLocation={locationGranted}
        showsMyLocationButton={false}
      >
        {showCityLabels &&
          governorates.map((gov) => {
            const coordinate = GOVERNORATE_COORDINATES[gov.id];
            if (!coordinate) return null;
            return (
              <CityLabelMarker
                key={`city-${gov.id}`}
                governorateId={gov.id}
                coordinate={coordinate}
                label={locale === 'ar' ? gov.name_ar : gov.name_en}
                onSelect={goToGovernorate}
              />
            );
          })}

        {showPropertyPins &&
          pins.map((pin) => (
            <PropertyMarker key={pin.id} pin={pin} isActive={pin.id === selectedId} onPress={handleMarkerPress} />
          ))}
      </MapView>

      {selectedId && <Pressable style={[StyleSheet.absoluteFill, styles.dimOverlay]} onPress={dismissPreview} />}

      {!loadingPins && pins.length === 0 && (
        <View style={styles.noResultsBadge} pointerEvents="none">
          <Text style={styles.noResultsText}>{t('home.noResults')}</Text>
        </View>
      )}

      <SafeAreaView edges={['top']} style={styles.topSafe} pointerEvents="box-none">
        <View style={styles.topRow}>
          <View style={styles.segmented}>
            <Pressable
              style={[styles.segment, dealType === 'rent' && styles.segmentActive]}
              onPress={() => handleDealTypeChange('rent')}
            >
              <Text style={[styles.segmentText, dealType === 'rent' && styles.segmentTextActive]}>
                {t('home.forRent')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segment, dealType === 'sale' && styles.segmentActive]}
              onPress={() => handleDealTypeChange('sale')}
            >
              <Text style={[styles.segmentText, dealType === 'sale' && styles.segmentTextActive]}>
                {t('home.forSale')}
              </Text>
            </Pressable>
          </View>
          <Pressable
            style={[styles.filtersButton, hasActiveFilters && styles.filtersButtonActive]}
            onPress={openFilterSheet}
          >
            <Ionicons name="options-outline" size={15} color={hasActiveFilters ? theme.onBrandFill : theme.headingText} />
            <Text style={[styles.filtersText, hasActiveFilters && styles.filtersTextActive]}>{t('home.filters')}</Text>
            {hasActiveFilters && (
              <View style={styles.filtersBadge}>
                <Text style={styles.filtersBadgeText}>{formatCount(activeFilterCount, locale)}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {compactCategories.map((cat) => {
            const active = category === cat;
            return (
              <Pressable key={cat} style={[styles.chip, active && styles.chipActive]} onPress={() => handleCategoryChange(cat)}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {cat === 'all' ? t('home.categoryAll') : t(CATEGORY_LABEL_KEY[cat])}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            style={[styles.chip, isActiveCategoryHidden && styles.chipActive]}
            onPress={() => setCategorySheetOpen(true)}
          >
            <Text style={[styles.chipText, isActiveCategoryHidden && styles.chipTextActive]}>{t('home.moreCategories')}</Text>
          </Pressable>
        </ScrollView>

        <Pressable style={styles.governorateButton} onPress={() => setGovernorateSheetOpen(true)}>
          <Ionicons name="location-outline" size={13} color={theme.headingText} />
          <Text style={styles.governorateButtonText}>{t('home.governoratesLabel')}</Text>
          <Ionicons name="chevron-down" size={12} color={theme.mutedText} />
        </Pressable>
      </SafeAreaView>

      <View style={styles.rightFloating} pointerEvents="box-none">
        <Pressable
          style={[styles.roundButton, mapVisualization === 'aiAnalysis' && styles.roundButtonActive]}
          onPress={toggleMapVisualization}
        >
          <Ionicons name="map-outline" size={16} color={mapVisualization === 'aiAnalysis' ? theme.onBrandFill : theme.headingText} />
        </Pressable>
        <Pressable style={styles.roundButton} onPress={handleMyLocation}>
          {locating ? (
            <ActivityIndicator size="small" color={theme.headingText} />
          ) : (
            <Ionicons name="locate-outline" size={16} color={theme.headingText} />
          )}
        </Pressable>
        <Pressable
          style={styles.favoritesButton}
          onPress={() => (currentUserId ? router.push('/favorites') : showAuthPrompt('favorites-list'))}
        >
          <Ionicons name="heart" size={15} color={theme.accentGold} />
          <Text style={styles.favoritesText}>{t('home.favorites')}</Text>
        </Pressable>
      </View>

      <View style={styles.bottomArea} pointerEvents="box-none">
        {selectedId ? (
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Pressable style={styles.closeButton} onPress={dismissPreview} hitSlop={10}>
                <Ionicons name="close" size={14} color={theme.mutedText} />
              </Pressable>
            </View>
            {loadingPreview || !selectedPreview ? (
              <View style={styles.sheetLoading}>
                <ActivityIndicator color={theme.headingText} />
              </View>
            ) : (
              <>
                <View style={styles.sheetBody}>
                  {selectedPreview.photoUrl ? (
                    <Image
                      source={{ uri: selectedPreview.photoUrl }}
                      style={styles.sheetPhoto}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={[styles.sheetPhoto, styles.sheetPhotoPlaceholder]}>
                      <Ionicons name="image-outline" size={22} color={theme.mutedText} />
                    </View>
                  )}
                  <View style={styles.sheetInfo}>
                    <Text style={styles.sheetTitle} numberOfLines={1}>
                      {selectedPreview.title}
                    </Text>
                    <View style={styles.sheetLocationRow}>
                      <Ionicons name="location-outline" size={11} color={theme.mutedText} />
                      <Text style={styles.sheetLocation} numberOfLines={1}>
                        {[selectedPreview.area, selectedPreview.city].filter(Boolean).join('، ')}
                      </Text>
                    </View>
                    <View style={styles.specRow}>
                      {showBedBath && selectedPreview.bedrooms != null && (
                        <View style={styles.specItem}>
                          <Ionicons name="bed-outline" size={12} color={theme.headingText} />
                          <Text style={styles.specText}>{selectedPreview.bedrooms}</Text>
                        </View>
                      )}
                      {showBedBath && selectedPreview.bathrooms != null && (
                        <View style={styles.specItem}>
                          <Ionicons name="water-outline" size={12} color={theme.headingText} />
                          <Text style={styles.specText}>{selectedPreview.bathrooms}</Text>
                        </View>
                      )}
                      <View style={styles.specItem}>
                        <Ionicons name="resize-outline" size={12} color={theme.headingText} />
                        <Text style={styles.specText}>
                          {selectedPreview.areaSqm}
                          {t('home.sqm')}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.sheetPrice}>{formatPriceFull(selectedPreview.priceUsd)}</Text>
                  </View>
                </View>
                <Pressable
                  style={styles.detailsButton}
                  onPress={() => selectedId && router.push(`/listing/${selectedId}`)}
                >
                  <Text style={styles.detailsButtonText}>{t('home.viewFullDetails')}</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <View style={styles.summaryBar}>
            <Pressable style={styles.summaryItem} onPress={openListView}>
              <Ionicons name="menu-outline" size={14} color={theme.headingText} />
              <Text style={styles.summaryListText}>{t('home.listToggle')}</Text>
            </Pressable>
            <Text style={styles.summaryCount}>
              {loadingPins ? '…' : formatListingCount(pins.length, totalPublished, locale, t('home.listingCount'))}
            </Text>
            <Pressable
              style={styles.summaryItem}
              onPress={() => (currentUserId ? router.push('/post-listing') : showAuthPrompt('post-listing'))}
            >
              <Ionicons name="add" size={16} color={theme.success} />
              <Text style={styles.summaryAddText}>{t('home.addListing')}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <Modal visible={listModalOpen} transparent animationType="slide" onRequestClose={closeListModal}>
        <Pressable style={styles.listModalOverlay} onPress={closeListModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.listModalKeyboardWrapper}
          >
            <Pressable style={styles.listModalSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.listModalHandle} />
              <View style={styles.listModalHeader}>
                <Text style={styles.listModalTitle}>
                  {isSearchActive ? t('home.searchResultsTitle') : t('home.listToggle')}
                </Text>
                <Pressable onPress={closeListModal} hitSlop={10} style={styles.listModalCloseButton}>
                  <Ionicons name="close" size={18} color={theme.mutedText} />
                </Pressable>
              </View>
              <Text style={styles.contextLabel} numberOfLines={1}>
                {currentContextLabel}
              </Text>

              <View style={styles.searchRow}>
                <Ionicons name="search" size={18} color={theme.headingText} />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={handleSearchChange}
                  placeholder={t('home.searchPlaceholder')}
                  placeholderTextColor={theme.mutedText}
                  returnKeyType="search"
                  textAlign={locale === 'ar' ? 'right' : 'left'}
                  cursorColor={theme.headingText}
                  selectionColor={theme.headingText}
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => handleSearchChange('')} hitSlop={10} style={styles.searchClearButton}>
                    <Ionicons name="close-circle" size={20} color={theme.headingText} />
                  </Pressable>
                )}
              </View>

              {(isSearchActive ? loadingSearch : loadingList) ? (
                <View style={styles.listModalLoading}>
                  <ActivityIndicator color={theme.headingText} />
                </View>
              ) : activeListItems.length === 0 ? (
                <View style={styles.listModalEmpty}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name={isSearchActive ? 'search-outline' : 'home-outline'} size={26} color={theme.mutedText} />
                  </View>
                  <Text style={styles.noResultsText}>
                    {isSearchActive ? t('home.noSearchResults') : t('home.noResultsInView')}
                  </Text>
                  {isSearchActive && <Text style={styles.noResultsHint}>{t('home.noSearchResultsHint')}</Text>}
                </View>
              ) : (
                <>
                  <Text style={styles.resultsCountLabel}>
                    {isSearchActive
                      ? t('home.searchResultsCount')
                          .replace('{count}', formatCount(activeListItems.length, locale))
                          .replace('{query}', trimmedSearchQuery)
                      : t('home.resultsCount').replace('{count}', formatCount(activeListItems.length, locale))}
                  </Text>
                  <FlatList
                    data={activeListItems}
                    keyExtractor={(item) => item.id}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => {
                      const itemShowBedBath = BED_BATH_CATEGORIES.includes(item.category);
                      return (
                        <Pressable
                          style={styles.listRow}
                          onPress={() => (isSearchActive ? openListingFromSearch(item.id) : openPreviewFromList(item))}
                        >
                          {item.photoUrl ? (
                            <Image
                              source={{ uri: item.photoUrl }}
                              style={styles.listRowPhoto}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              recyclingKey={item.id}
                              transition={150}
                            />
                          ) : (
                            <View style={[styles.listRowPhoto, styles.sheetPhotoPlaceholder]}>
                              <Ionicons name="image-outline" size={20} color={theme.mutedText} />
                            </View>
                          )}
                          <View style={styles.listRowBody}>
                            <Text style={styles.listRowTitle} numberOfLines={1}>
                              {item.title}
                            </Text>
                            <View style={styles.sheetLocationRow}>
                              <Ionicons name="location-outline" size={11} color={theme.mutedText} />
                              <Text style={styles.sheetLocation} numberOfLines={1}>
                                {[item.area, item.city].filter(Boolean).join('، ')}
                              </Text>
                            </View>
                            <View style={styles.specRow}>
                              {itemShowBedBath && item.bedrooms != null && (
                                <View style={styles.specItem}>
                                  <Ionicons name="bed-outline" size={11} color={theme.headingText} />
                                  <Text style={styles.specText}>{item.bedrooms}</Text>
                                </View>
                              )}
                              {itemShowBedBath && item.bathrooms != null && (
                                <View style={styles.specItem}>
                                  <Ionicons name="water-outline" size={11} color={theme.headingText} />
                                  <Text style={styles.specText}>{item.bathrooms}</Text>
                                </View>
                              )}
                              <View style={styles.specItem}>
                                <Ionicons name="resize-outline" size={11} color={theme.headingText} />
                                <Text style={styles.specText}>
                                  {item.areaSqm}
                                  {t('home.sqm')}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.sheetPrice}>{formatPriceFull(item.priceUsd)}</Text>
                          </View>
                        </Pressable>
                      );
                    }}
                  />
                </>
              )}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={filterSheetOpen} transparent animationType="slide" onRequestClose={() => setFilterSheetOpen(false)}>
        <Pressable style={styles.listModalOverlay} onPress={() => setFilterSheetOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.listModalKeyboardWrapper}
          >
          <Pressable style={styles.filterSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.listModalHandle} />
            <View style={styles.listModalHeader}>
              <Text style={styles.listModalTitle}>{t('home.filtersTitle')}</Text>
              <Pressable onPress={() => setFilterSheetOpen(false)} hitSlop={10} style={styles.listModalCloseButton}>
                <Ionicons name="close" size={18} color={theme.mutedText} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.filterSheetBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.filterFieldLabel}>{t('home.propertyTypeLabel')}</Text>
              <View style={styles.filterChipRow}>
                {CATEGORIES.filter((cat) => cat !== 'all').map((cat) => {
                  const active = category === cat;
                  return (
                    <Pressable
                      key={cat}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => handleCategoryChange(active ? 'all' : cat)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {t(CATEGORY_LABEL_KEY[cat])}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.filterFieldLabel}>{t('home.priceRangeLabel')}</Text>
              <View style={styles.filterRangeRow}>
                <TextInput
                  style={styles.filterInput}
                  value={draftFilters.minPrice}
                  onChangeText={(v) => setDraftFilters((f) => ({ ...f, minPrice: v }))}
                  placeholder={t('home.minPlaceholder')}
                  placeholderTextColor={theme.mutedText}
                  keyboardType="numeric"
                />
                <TextInput
                  style={styles.filterInput}
                  value={draftFilters.maxPrice}
                  onChangeText={(v) => setDraftFilters((f) => ({ ...f, maxPrice: v }))}
                  placeholder={t('home.maxPlaceholder')}
                  placeholderTextColor={theme.mutedText}
                  keyboardType="numeric"
                />
              </View>

              <Text style={styles.filterFieldLabel}>{t('home.areaRangeLabel')}</Text>
              <View style={styles.filterRangeRow}>
                <TextInput
                  style={styles.filterInput}
                  value={draftFilters.minArea}
                  onChangeText={(v) => setDraftFilters((f) => ({ ...f, minArea: v }))}
                  placeholder={t('home.minPlaceholder')}
                  placeholderTextColor={theme.mutedText}
                  keyboardType="numeric"
                />
                <TextInput
                  style={styles.filterInput}
                  value={draftFilters.maxArea}
                  onChangeText={(v) => setDraftFilters((f) => ({ ...f, maxArea: v }))}
                  placeholder={t('home.maxPlaceholder')}
                  placeholderTextColor={theme.mutedText}
                  keyboardType="numeric"
                />
              </View>

              {draftShowsBedBath && (
                <>
                  <Text style={styles.filterFieldLabel}>{t('postListing.bedroomsLabel')}</Text>
                  <TextInput
                    style={styles.filterInput}
                    value={draftFilters.minBedrooms}
                    onChangeText={(v) => setDraftFilters((f) => ({ ...f, minBedrooms: v }))}
                    placeholder={t('home.minPlaceholder')}
                    placeholderTextColor={theme.mutedText}
                    keyboardType="number-pad"
                  />

                  <Text style={styles.filterFieldLabel}>{t('postListing.bathroomsLabel')}</Text>
                  <TextInput
                    style={styles.filterInput}
                    value={draftFilters.minBathrooms}
                    onChangeText={(v) => setDraftFilters((f) => ({ ...f, minBathrooms: v }))}
                    placeholder={t('home.minPlaceholder')}
                    placeholderTextColor={theme.mutedText}
                    keyboardType="number-pad"
                  />

                  <Text style={styles.filterFieldLabel}>{t('home.livingRoomsLabel')}</Text>
                  <TextInput
                    style={styles.filterInput}
                    value={draftFilters.minLivingRooms}
                    onChangeText={(v) => setDraftFilters((f) => ({ ...f, minLivingRooms: v }))}
                    placeholder={t('home.minPlaceholder')}
                    placeholderTextColor={theme.mutedText}
                    keyboardType="number-pad"
                  />
                </>
              )}

              {dealType === 'rent' && (
                <>
                  <Text style={styles.filterFieldLabel}>{t('postListing.furnishedLabel')}</Text>
                  <View style={styles.filterChipRow}>
                    {(['full', 'partial', 'unfurnished'] as FurnishedValue[]).map((f) => {
                      const active = draftFilters.furnished === f;
                      return (
                        <Pressable
                          key={f}
                          style={[styles.filterChip, active && styles.filterChipActive]}
                          onPress={() => setDraftFilters((d) => ({ ...d, furnished: active ? null : f }))}
                        >
                          <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                            {t(`postListing.furnished${f === 'full' ? 'Full' : f === 'partial' ? 'Partial' : 'Unfurnished'}`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {draftShowsLandType && (
                <>
                  <Text style={styles.filterFieldLabel}>{t('postListing.landTypeLabel')}</Text>
                  <View style={styles.filterChipRow}>
                    {(['residential', 'agricultural', 'commercial'] as LandTypeValue[]).map((lt) => {
                      const active = draftFilters.landType === lt;
                      return (
                        <Pressable
                          key={lt}
                          style={[styles.filterChip, active && styles.filterChipActive]}
                          onPress={() => setDraftFilters((d) => ({ ...d, landType: active ? null : lt }))}
                        >
                          <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                            {t(
                              `postListing.landType${lt === 'residential' ? 'Residential' : lt === 'agricultural' ? 'Agricultural' : 'Commercial'}`
                            )}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {draftShowsCeilingHeight && (
                <>
                  <Text style={styles.filterFieldLabel}>{t('home.ceilingHeightLabel')}</Text>
                  <TextInput
                    style={styles.filterInput}
                    value={draftFilters.minCeilingHeight}
                    onChangeText={(v) => setDraftFilters((f) => ({ ...f, minCeilingHeight: v }))}
                    placeholder={t('home.minPlaceholder')}
                    placeholderTextColor={theme.mutedText}
                    keyboardType="numeric"
                  />
                </>
              )}

              {draftApplicableAmenities.length > 0 && (
                <>
                  <Text style={styles.filterFieldLabel}>{t('home.amenitiesLabel')}</Text>
                  <View style={styles.filterChipRow}>
                    {draftApplicableAmenities.map((amenity) => {
                      const active = draftFilters.amenities.includes(amenity.key);
                      return (
                        <Pressable
                          key={amenity.key}
                          style={[styles.filterChip, active && styles.filterChipActive]}
                          onPress={() => toggleDraftAmenity(amenity.key)}
                        >
                          <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                            {locale === 'ar' ? amenity.nameAr : amenity.nameEn}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.filterFooter}>
              <Pressable style={styles.filterResetButton} onPress={resetDraftFilters}>
                <Text style={styles.filterResetText}>{t('home.resetFilters')}</Text>
              </Pressable>
              <Pressable style={styles.filterApplyButton} onPress={applyFilters}>
                <Text style={styles.filterApplyText}>{t('home.applyFilters')}</Text>
              </Pressable>
            </View>
          </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal
        visible={governorateSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setGovernorateSheetOpen(false)}
      >
        <Pressable style={styles.listModalOverlay} onPress={() => setGovernorateSheetOpen(false)}>
          <Pressable style={styles.governorateSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.listModalHandle} />
            <View style={styles.listModalHeader}>
              <Text style={styles.listModalTitle}>{t('home.selectGovernorate')}</Text>
              <Pressable onPress={() => setGovernorateSheetOpen(false)} hitSlop={10} style={styles.listModalCloseButton}>
                <Ionicons name="close" size={18} color={theme.mutedText} />
              </Pressable>
            </View>
            <FlatList
              data={governorates}
              keyExtractor={(gov) => gov.id}
              renderItem={({ item: gov }) => (
                <Pressable
                  style={styles.governorateRow}
                  onPress={() => {
                    goToGovernorate(gov.id);
                    setGovernorateSheetOpen(false);
                  }}
                >
                  <View style={styles.governorateRowIcon}>
                    <Ionicons name="location-outline" size={16} color={theme.headingText} />
                  </View>
                  <Text style={styles.governorateRowText}>{locale === 'ar' ? gov.name_ar : gov.name_en}</Text>
                  <Ionicons name="chevron-back" size={16} color={theme.mutedText} />
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={categorySheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCategorySheetOpen(false)}
      >
        <Pressable style={styles.listModalOverlay} onPress={() => setCategorySheetOpen(false)}>
          <Pressable style={styles.governorateSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.listModalHandle} />
            <View style={styles.listModalHeader}>
              <Text style={styles.listModalTitle}>{t('home.selectCategory')}</Text>
              <Pressable onPress={() => setCategorySheetOpen(false)} hitSlop={10} style={styles.listModalCloseButton}>
                <Ionicons name="close" size={18} color={theme.mutedText} />
              </Pressable>
            </View>
            <FlatList
              data={CATEGORIES}
              keyExtractor={(cat) => cat}
              renderItem={({ item: cat }) => {
                const active = category === cat;
                return (
                  <Pressable
                    style={styles.governorateRow}
                    onPress={() => {
                      handleCategoryChange(cat);
                      setCategorySheetOpen(false);
                    }}
                  >
                    <View style={styles.governorateRowIcon}>
                      <Ionicons name={cat === 'all' ? 'apps-outline' : 'business-outline'} size={16} color={theme.headingText} />
                    </View>
                    <Text style={[styles.governorateRowText, active && styles.governorateRowTextActive]}>
                      {cat === 'all' ? t('home.categoryAll') : t(CATEGORY_LABEL_KEY[cat])}
                    </Text>
                    {active && <Ionicons name="checkmark" size={18} color={theme.headingText} />}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <AuthPromptModal
        visible={authPromptVisible}
        onClose={hideAuthPrompt}
        redirectTo={
          authPromptIntent === 'post-listing' ? '/post-listing' : authPromptIntent === 'favorites-list' ? '/favorites' : undefined
        }
      />
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  const shadow = {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.surfaceAlt,
    },
    dimOverlay: {
      backgroundColor: 'rgba(11,43,33,0.28)',
      zIndex: 5,
    },
    noResultsBadge: {
      position: 'absolute',
      top: '46%',
      left: spacing.xl,
      right: spacing.xl,
      alignItems: 'center',
    },
    noResultsText: {
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.caption,
      color: theme.mutedText,
      backgroundColor: theme.surface,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radii.pill,
      overflow: 'hidden',
      ...shadow,
    },
    topSafe: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      zIndex: 6,
    },
    topRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    segmented: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: theme.surface,
      borderRadius: radii.md,
      padding: 4,
      ...shadow,
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    segmentActive: {
      borderBottomColor: theme.brandFill,
    },
    segmentText: {
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.caption,
      color: theme.mutedText,
    },
    segmentTextActive: {
      fontFamily: fonts.headingBold,
      color: theme.headingText,
    },
    filtersButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.surface,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 44,
      ...shadow,
    },
    filtersButtonActive: {
      backgroundColor: theme.brandFill,
    },
    filtersText: {
      fontFamily: fonts.headingBold,
      fontSize: fontSizes.caption,
      color: theme.headingText,
    },
    filtersTextActive: {
      color: theme.onBrandFill,
    },
    filtersBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: theme.accentGold,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filtersBadgeText: {
      fontFamily: fonts.headingBold,
      fontSize: 10,
      color: theme.headingText,
    },
    // Category chips: sized to a real 44pt minimum touch target (Apple HIG),
    // with a clearer active/inactive contrast than the previous compact pills.
    chipsRow: {
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      paddingEnd: spacing.md,
    },
    chip: {
      backgroundColor: theme.surface,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.lg,
      minHeight: 40,
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    chipActive: {
      backgroundColor: theme.brandFill,
      borderColor: theme.brandFill,
    },
    chipText: {
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.bodySmall,
      color: theme.mutedText,
    },
    chipTextActive: {
      fontFamily: fonts.headingBold,
      color: theme.onBrandFill,
    },
    // Replaces what used to be all 14 governorates as separate cramped pills
    // with a single, clean entry point into a proper scrollable sheet.
    governorateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      backgroundColor: theme.surface,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginTop: spacing.sm,
      borderWidth: 1,
      borderColor: theme.border,
      ...shadow,
    },
    governorateButtonText: {
      fontFamily: fonts.headingBold,
      fontSize: fontSizes.caption,
      color: theme.headingText,
    },
    governorateSheet: {
      backgroundColor: theme.elevatedSurface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      maxHeight: '70%',
    },
    governorateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      minHeight: 52,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    governorateRowIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    governorateRowText: {
      flex: 1,
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.body,
      color: theme.bodyText,
    },
    governorateRowTextActive: {
      fontFamily: fonts.headingBold,
      color: theme.headingText,
    },
    rightFloating: {
      position: 'absolute',
      right: spacing.md,
      bottom: 85,
      alignItems: 'center',
      gap: spacing.sm,
      zIndex: 6,
    },
    roundButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow,
    },
    roundButtonActive: {
      backgroundColor: theme.brandFill,
    },
    favoritesButton: {
      backgroundColor: theme.surface,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      gap: 2,
      ...shadow,
    },
    favoritesText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 9,
      color: theme.mutedText,
    },
    bottomArea: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      bottom: spacing.lg,
      zIndex: 7,
    },
    summaryBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surface,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      ...shadow,
    },
    summaryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    summaryListText: {
      fontFamily: fonts.headingBold,
      fontSize: fontSizes.caption,
      color: theme.headingText,
    },
    summaryCount: {
      fontFamily: fonts.bodyRegular,
      fontSize: fontSizes.caption,
      color: theme.mutedText,
    },
    summaryAddText: {
      fontFamily: fonts.headingBold,
      fontSize: fontSizes.caption,
      color: theme.success,
    },
    sheet: {
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      padding: spacing.sm,
    },
    sheetLoading: {
      paddingVertical: spacing.xxl,
      alignItems: 'center',
    },
    closeButton: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetBody: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    sheetPhoto: {
      width: 76,
      height: 76,
      borderRadius: radii.md,
      backgroundColor: theme.surfaceAlt,
    },
    sheetPhotoPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetInfo: {
      flex: 1,
      justifyContent: 'center',
    },
    sheetTitle: {
      fontFamily: fonts.headingBold,
      fontSize: fontSizes.bodySmall,
      color: theme.bodyText,
    },
    sheetLocationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginVertical: 4,
    },
    sheetLocation: {
      fontFamily: fonts.bodyRegular,
      fontSize: fontSizes.caption,
      color: theme.mutedText,
    },
    specRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: 5,
    },
    specItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    specText: {
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.caption,
      color: theme.mutedText,
    },
    sheetPrice: {
      fontFamily: fonts.headingBlack,
      fontSize: fontSizes.sectionTitle,
      color: theme.headingText,
    },
    detailsButton: {
      backgroundColor: theme.brandFill,
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    detailsButtonText: {
      fontFamily: fonts.headingBold,
      fontSize: fontSizes.bodySmall,
      color: theme.onBrandFill,
    },
    listModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(11,43,33,0.4)',
      justifyContent: 'flex-end',
    },
    listModalKeyboardWrapper: {
      width: '100%',
    },
    listModalSheet: {
      backgroundColor: theme.elevatedSurface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      maxHeight: '80%',
      minHeight: '40%',
    },
    listModalHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.surfaceAlt,
      marginTop: spacing.sm,
    },
    listModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    listModalTitle: {
      fontFamily: fonts.headingBold,
      fontSize: fontSizes.sectionTitle,
      color: theme.headingText,
    },
    listModalCloseButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Plain-language summary of what's currently constraining the results —
    // always visible, whether the user is searching or just browsing.
    contextLabel: {
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.bodySmall,
      color: theme.mutedText,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    // Field-style search bar: light neutral fill + hairline border so it
    // reads as a distinct, tappable control against the white page/sheet
    // behind it, matching the app-wide field style. Pine icons/cursor/text
    // for contrast, and a real 48pt-tall touch target.
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: theme.surfaceAlt,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: theme.fieldBorder,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      minHeight: 48,
    },
    searchInput: {
      flex: 1,
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.body,
      color: theme.bodyText,
      padding: 0,
    },
    searchClearButton: {
      padding: 2,
    },
    listModalLoading: {
      paddingVertical: spacing.xxl,
      alignItems: 'center',
    },
    listModalEmpty: {
      paddingVertical: spacing.xl,
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
    },
    emptyIconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    noResultsHint: {
      fontFamily: fonts.bodyRegular,
      fontSize: fontSizes.bodySmall,
      color: theme.mutedText,
      textAlign: 'center',
    },
    resultsCountLabel: {
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.bodySmall,
      color: theme.mutedText,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xs,
    },
    listContent: {
      paddingBottom: spacing.lg,
    },
    // Each result is its own card (not a bare divider-separated row) so a
    // dense results list still reads as distinct properties, not one crowded
    // block.
    listRow: {
      flexDirection: 'row',
      gap: spacing.md,
      backgroundColor: theme.surface,
      borderRadius: radii.md,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      padding: spacing.sm,
    },
    listRowPhoto: {
      width: 72,
      height: 72,
      borderRadius: radii.md,
      backgroundColor: theme.surfaceAlt,
    },
    listRowBody: {
      flex: 1,
      justifyContent: 'center',
    },
    listRowTitle: {
      fontFamily: fonts.headingBold,
      fontSize: fontSizes.bodySmall,
      color: theme.bodyText,
    },
    filterSheet: {
      backgroundColor: theme.elevatedSurface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      maxHeight: '85%',
    },
    filterSheetBody: {
      padding: spacing.lg,
    },
    filterFieldLabel: {
      fontFamily: fonts.headingBold,
      fontSize: fontSizes.bodySmall,
      color: theme.bodyText,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    filterRangeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    filterInput: {
      flex: 1,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.fieldBorder,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontFamily: fonts.bodyRegular,
      fontSize: fontSizes.body,
      color: theme.bodyText,
    },
    filterChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    filterChip: {
      backgroundColor: theme.surface,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    filterChipActive: {
      backgroundColor: theme.brandFill,
    },
    filterChipText: {
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.body,
      color: theme.mutedText,
    },
    filterChipTextActive: {
      fontFamily: fonts.headingBold,
      color: theme.onBrandFill,
    },
    filterFooter: {
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    filterResetButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: spacing.md,
    },
    filterResetText: {
      fontFamily: fonts.headingBold,
      fontSize: fontSizes.body,
      color: theme.mutedText,
    },
    filterApplyButton: {
      flex: 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.brandFill,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
    },
    filterApplyText: {
      fontFamily: fonts.headingBold,
      fontSize: fontSizes.body,
      color: theme.onBrandFill,
    },
  });
}
