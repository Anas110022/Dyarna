import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { fonts, radii, spacing } from '@/src/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type PropertyPhotoViewerProps = {
  visible: boolean;
  photos: string[];
  initialIndex: number;
  onClose: () => void;
};

// One photo page. Real image, correct aspect ratio (contain-fit).
//
// NOTE: pinch/double-tap zoom was attempted here using
// react-native-gesture-handler's Gesture API + react-native-reanimated,
// but that combination crashed on real device/simulator launch with
// "TypeError: undefined is not a function" at
// RNGestureHandlerModule.installUIRuntimeBindings() — a native-module gap
// in this project's currently linked react-native-gesture-handler v3 pod
// that has no working native implementation here. Neither library was
// used anywhere else in this codebase, so this was the first real exercise
// of that native surface. Removed entirely rather than worked around, per
// the standing instruction to keep this fix minimal and not chase a risky
// native-linking rabbit hole. Swipe-between-photos below does not depend
// on either library — it's a plain FlatList, unaffected by this removal.
function PhotoPage({ uri }: { uri: string }) {
  return (
    <View style={styles.page}>
      <Image source={{ uri }} style={styles.fullImage} contentFit="contain" cachePolicy="memory-disk" recyclingKey={uri} />
    </View>
  );
}

// Holds all gallery state (current page). Given a fresh `key` (the initial
// index) by its parent below, so opening the viewer at a different
// starting photo — or reopening it — always mounts a clean instance
// instead of needing an effect to reset state on prop change.
function PhotoViewerContent({ photos, initialIndex, onClose }: Omit<PropertyPhotoViewerProps, 'visible'>) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<string>>(null);

  // getItemLayout makes initialScrollIndex reliable without waiting for a
  // real measure pass; this extra scrollToIndex right after mount is a
  // defensive fallback for the same reason many FlatList galleries add one.
  useEffect(() => {
    const task = requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      } catch {
        // Out-of-range or not yet laid out — the initial render already
        // targets the same index via initialScrollIndex, so this is only
        // ever a no-op fallback, never the sole positioning mechanism.
      }
    });
    return () => cancelAnimationFrame(task);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only, this instance never receives a new initialIndex (see the `key` on the parent)
  }, []);

  const handleScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
        keyExtractor={(uri, index) => `${uri}-${index}`}
        onMomentumScrollEnd={handleScrollEnd}
        renderItem={({ item }) => <PhotoPage uri={item} />}
      />

      <SafeAreaView edges={['top']} style={styles.topRow} pointerEvents="box-none">
        <Pressable style={styles.circleButton} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <View style={styles.counterWrap}>
          {photos.length > 0 && (
            <View style={styles.counterBadge}>
              <Text style={styles.counterText}>{`${currentIndex + 1} / ${photos.length}`}</Text>
            </View>
          )}
        </View>
        <View style={styles.circleButton} />
      </SafeAreaView>
    </View>
  );
}

// Shared full-screen photo viewer — used by both the property-details
// screen (opens at whichever photo is currently shown) and the "الصور"
// grid screen (opens at whichever photo was tapped). Takes only an
// already-loaded photo list; never fetches anything itself.
export function PropertyPhotoViewer({ visible, photos, initialIndex, onClose }: PropertyPhotoViewerProps) {
  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} presentationStyle="fullScreen" statusBarTranslucent>
      <PhotoViewerContent key={initialIndex} photos={photos} initialIndex={initialIndex} onClose={onClose} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  page: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fullImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
  topRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  circleButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterWrap: { flex: 1, alignItems: 'center' },
  counterBadge: { backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill },
  counterText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: '#fff' },
});
