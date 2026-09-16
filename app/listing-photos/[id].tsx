import { useMemo, useState } from 'react';
import { Dimensions, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';

import { useI18n } from '@/src/i18n';
import { radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { PropertyPhotoViewer } from '@/src/components/PropertyPhotoViewer';
import { AppHeader } from '@/src/components/AppHeader';

const { width } = Dimensions.get('window');
const COLUMNS = 3;
const GRID_GAP = spacing.xs;
const TILE_SIZE = (width - spacing.lg * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

// Real photo list only — passed in from the property-details screen (the
// caller already has it loaded), never refetched from Supabase here.
function parsePhotos(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export default function ListingPhotosScreen() {
  const { photos: photosParam, title } = useLocalSearchParams<{ id: string; photos?: string; title?: string }>();
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const photos = useMemo(() => parsePhotos(photosParam), [photosParam]);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  return (
    <View style={styles.flex}>
      <AppHeader title={t('listingDetail.photosTitle', { count: photos.length })} subtitle={title} />

      <FlatList
        data={photos}
        numColumns={COLUMNS}
        keyExtractor={(uri, index) => `${uri}-${index}`}
        contentContainerStyle={styles.gridContent}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item, index }) => (
          <Pressable
            style={styles.tile}
            onPress={() => {
              setViewerIndex(index);
              setViewerVisible(true);
            }}
          >
            <Image source={{ uri: item }} style={styles.tileImage} contentFit="cover" cachePolicy="memory-disk" recyclingKey={item} />
          </Pressable>
        )}
      />

      <PropertyPhotoViewer visible={viewerVisible} photos={photos} initialIndex={viewerIndex} onClose={() => setViewerVisible(false)} />
    </View>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    gridContent: { padding: spacing.lg },
    gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },
    tile: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: theme.surfaceAlt },
    tileImage: { width: '100%', height: '100%' },
  });
}
