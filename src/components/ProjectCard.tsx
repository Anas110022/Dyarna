import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';

type ProjectCardProps = {
  coverPhotoUrl: string | null;
  deliveryStatusLabel: string;
  title: string;
  projectTypeLabel: string;
  locationLabel: string;
  /** Pre-formatted, e.g. "starting from $80,000" — null when the project has no listed starting price. */
  priceLabel: string | null;
  developerName: string | null;
  unitsLabel: string | null;
  onPress: () => void;
};

// The one shared developer-project card — photo with a delivery-status
// tag overlay, then title/type/location/price+developer/units — was
// previously only ever built inline on the projects tab.
export function ProjectCard({
  coverPhotoUrl,
  deliveryStatusLabel,
  title,
  projectTypeLabel,
  locationLabel,
  priceLabel,
  developerName,
  unitsLabel,
  onPress,
}: ProjectCardProps) {
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.photoWrap}>
        {coverPhotoUrl ? (
          <Image source={{ uri: coverPhotoUrl }} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" recyclingKey={coverPhotoUrl} transition={150} />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Ionicons name="business-outline" size={26} color={theme.mutedText} />
          </View>
        )}
        <View style={styles.deliveryTag}>
          <Text style={styles.deliveryTagText}>{deliveryStatusLabel}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.projectType}>{projectTypeLabel}</Text>
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={11} color={theme.mutedText} />
          <Text style={styles.location} numberOfLines={1}>
            {locationLabel}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          {priceLabel ? <Text style={styles.price}>{priceLabel}</Text> : <View />}
          {!!developerName && (
            <Text style={styles.developer} numberOfLines={1}>
              {developerName}
            </Text>
          )}
        </View>

        {!!unitsLabel && <Text style={styles.unitsCount}>{unitsLabel}</Text>}
      </View>
    </Pressable>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      overflow: 'hidden',
      marginBottom: spacing.md,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    photoWrap: { height: 160, backgroundColor: theme.surfaceAlt },
    photo: { width: '100%', height: '100%' },
    photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    deliveryTag: {
      position: 'absolute',
      top: spacing.sm,
      start: spacing.sm,
      backgroundColor: theme.brandFill,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    deliveryTagText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.onBrandFill },

    cardBody: { padding: spacing.md, gap: 3 },
    title: { fontFamily: fonts.headingBold, fontSize: fontSizes.body, color: theme.bodyText },
    projectType: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.accentGold },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    location: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },

    bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs, gap: spacing.sm },
    price: { fontFamily: fonts.headingBlack, fontSize: fontSizes.sectionTitle, color: theme.headingText },
    developer: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.mutedText, flexShrink: 1 },
    unitsCount: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, marginTop: 2 },
  });
}
