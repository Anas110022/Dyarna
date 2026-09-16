import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { StatusBadge } from './StatusBadge';

type StatusTone = 'pending' | 'success' | 'danger' | 'neutral';

type PropertyCardProps = {
  photoUrl: string | null;
  title: string;
  categoryLabel: string;
  locationLabel: string;
  /** Pre-formatted — "$120,000", "$40 / ليلة"... callers vary in currency/unit. */
  priceLabel: string;
  onPress: () => void;
  status?: { label: string; tone: StatusTone };
  /** Extra row rendered under the price — e.g. a "retry publish" link. */
  footer?: ReactNode;
};

// The one shared listing-row card — photo + title/category/location/price
// — previously copy-pasted (with small drifts: 8.5px vs 10px category
// text, hand-rolled status-color maps) across favorites, my-listings and
// similar screens.
export function PropertyCard({ photoUrl, title, categoryLabel, locationLabel, priceLabel, onPress, status, footer }: PropertyCardProps) {
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable style={styles.row} onPress={onPress}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoPlaceholder]}>
          <Ionicons name="image-outline" size={18} color={theme.mutedText} />
        </View>
      )}
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {status && <StatusBadge label={status.label} tone={status.tone} />}
        </View>
        <Text style={styles.category}>{categoryLabel}</Text>
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={11} color={theme.mutedText} />
          <Text style={styles.location} numberOfLines={1}>
            {locationLabel}
          </Text>
        </View>
        <Text style={styles.price}>{priceLabel}</Text>
        {footer}
      </View>
    </Pressable>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: spacing.md,
      backgroundColor: theme.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    photo: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: theme.surfaceAlt },
    photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    info: { flex: 1, justifyContent: 'center', gap: 2 },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    title: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, flexShrink: 1 },
    category: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.accentGold },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    location: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    price: { fontFamily: fonts.headingBlack, fontSize: fontSizes.body, color: theme.headingText, marginTop: 2 },
  });
}
