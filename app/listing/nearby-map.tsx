import { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { openGoogleMapsNavigation } from '@/src/lib/directions';
import { AppHeader } from '@/src/components/AppHeader';

// Full-screen "الخدمات المجاورة" — reached by tapping the small, non-
// interactive map preview on a listing's details page. Real Google Maps,
// centered on that listing's real stored lat/lng (route params, never
// invented), with normal pan/pinch zoom so the user can actually explore
// real nearby roads/places the way the small preview never allowed. No
// location permission of any kind is requested anywhere on this screen —
// showing a known destination and opening real directions to it never
// needs to know where the device currently is.
export default function NearbyMapScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{ lat: string; lng: string; title?: string }>();
  const mapRef = useRef<MapView>(null);

  const lat = Number(params.lat);
  const lng = Number(params.lng);
  const hasValidCoordinate = Number.isFinite(lat) && Number.isFinite(lng);

  if (!hasValidCoordinate) {
    router.back();
    return null;
  }

  const region = { latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 };

  return (
    <View style={styles.flex}>
      <AppHeader title={t('listingDetail.nearbyServicesTitle')} />

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={region}
          // initialRegion alone isn't reliably applied for PROVIDER_GOOGLE
          // on iOS (the same real issue already fixed for the Add Listing
          // location picker). This is a real, already-known destination —
          // an instant (0ms) snap once the native view is ready guarantees
          // the property is the true center of the screen; it's making the
          // one real region actually take effect, not an exploratory/
          // random camera move.
          onMapReady={() => mapRef.current?.animateToRegion(region, 0)}
        >
          <Marker coordinate={{ latitude: lat, longitude: lng }} title={params.title} />
        </MapView>
      </View>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <Pressable style={styles.navigateButton} onPress={() => openGoogleMapsNavigation({ lat, lng })}>
          <Ionicons name="navigate-outline" size={16} color={theme.onBrandFill} />
          <Text style={styles.navigateButtonText}>{t('listingDetail.goToLocation')}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    mapWrap: { flex: 1 },
    footer: {
      backgroundColor: theme.background,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    navigateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: theme.brandFill,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      marginBottom: spacing.sm,
    },
    navigateButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.onBrandFill },
  });
}
