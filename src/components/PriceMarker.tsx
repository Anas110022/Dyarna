import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/src/theme';
import { formatCompactPrice } from '@/src/lib/numbers';

// All pins render identically (spec §4 screen 01): pine pill, price text
// only — no color variants or badges on the map itself.
export function PriceMarker({ price, selected }: { price: number; selected?: boolean }) {
  return (
    <View style={[styles.pill, selected && styles.pillSelected]}>
      <Text style={[styles.text, selected && styles.textSelected]}>{formatCompactPrice(price)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: colors.pine,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  pillSelected: {
    backgroundColor: colors.gold,
    transform: [{ scale: 1.1 }],
  },
  text: {
    fontFamily: fonts.headingBold,
    fontSize: 10,
    color: colors.goldSoft,
  },
  textSelected: {
    fontFamily: fonts.headingBlack,
    fontSize: 11,
    color: colors.pine,
  },
});
