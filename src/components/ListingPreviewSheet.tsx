import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { colors, fonts, radii, spacing } from '@/src/theme';
import { formatPrice } from '@/src/lib/numbers';
import { hasRoomSpecs, MockListing } from '@/src/data/mockListings';

export function ListingPreviewSheet({
  listing,
  onDismiss,
  onViewDetails,
}: {
  listing: MockListing;
  onDismiss: () => void;
  onViewDetails: () => void;
}) {
  const { t } = useI18n();
  const showRooms = hasRoomSpecs(listing.category);

  return (
    <View style={styles.card}>
      <View style={styles.dismissRow}>
        <Pressable style={styles.dismissButton} onPress={onDismiss} hitSlop={8}>
          <Text style={styles.dismissText}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Image source={{ uri: listing.photo }} style={styles.photo} />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {listing.title}
          </Text>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={10} color={colors.inkSoft} />
            <Text style={styles.location} numberOfLines={1}>
              {listing.location}
            </Text>
          </View>
          <View style={styles.specRow}>
            {showRooms && (
              <>
                <Spec icon="bed-outline" value={listing.bedrooms} />
                <Spec icon="water-outline" value={listing.bathrooms} />
              </>
            )}
            <Spec icon="resize-outline" value={`${listing.areaSqm}م²`} />
          </View>
          <Text style={styles.price}>
            {formatPrice(listing.price)}
            {listing.purpose === 'rent' && <Text style={styles.priceSuffix}>{t('home.perMonth')}</Text>}
          </Text>
        </View>
      </View>

      <View style={styles.ctaWrap}>
        <Pressable style={styles.cta} onPress={onViewDetails}>
          <Text style={styles.ctaText}>{t('home.viewFullDetails')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Spec({ icon, value }: { icon: keyof typeof Ionicons.glyphMap; value?: string | number }) {
  if (value === undefined) return null;
  return (
    <View style={styles.spec}>
      <Ionicons name={icon} size={10} color={colors.pine} />
      <Text style={styles.specText}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dismissRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: spacing.sm,
    paddingBottom: 0,
  },
  dismissButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.ivory2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    color: colors.inkSoft,
    fontSize: 12,
    fontFamily: fonts.headingBold,
  },
  body: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs,
  },
  photo: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: colors.ivory2,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: fonts.headingExtraBold,
    fontSize: 12.5,
    color: colors.ink,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
    marginBottom: 5,
  },
  location: {
    fontFamily: fonts.bodyRegular,
    fontSize: 9.5,
    color: colors.inkSoft,
  },
  specRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: 5,
  },
  spec: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  specText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 9,
    color: colors.inkSoft,
  },
  price: {
    fontFamily: fonts.headingBlack,
    fontSize: 14,
    color: colors.pine,
  },
  priceSuffix: {
    fontFamily: fonts.bodyRegular,
    fontSize: 10,
    color: colors.inkSoft,
  },
  ctaWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  cta: {
    backgroundColor: colors.pine,
    borderRadius: 13,
    paddingVertical: spacing.sm + 3,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: fonts.headingBold,
    fontSize: 12.5,
    color: colors.goldSoft,
  },
});
