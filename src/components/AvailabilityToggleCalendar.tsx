import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { colors, fonts, radii, spacing } from '@/src/theme';
import { monthYearLabel } from '@/src/lib/arabicDate';
import type { UnavailableRange } from '@/src/lib/bookings';

// Real multi-select "block this day" calendar for an owner's own
// availability — distinct from DateRangeCalendar (which picks one
// check-in/check-out range). Tapping a free day toggles it in/out of the
// real set the caller persists to booking_listing_blackout_dates; a day
// already unavailable because of a real reservation is shown but can't be
// toggled (it's not the owner's to un-block).

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isReserved(iso: string, ranges: UnavailableRange[]): boolean {
  return ranges.some((r) => iso >= r.checkIn && iso < r.checkOut);
}

const WEEKDAY_LABELS_AR = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const WEEKDAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AvailabilityToggleCalendar({
  blockedDates,
  onToggle,
  reservedRanges = [],
}: {
  blockedDates: string[];
  onToggle: (dateIso: string) => void;
  reservedRanges?: UnavailableRange[];
}) {
  const { t, locale } = useI18n();
  const today = startOfToday();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const weekdayLabels = locale === 'ar' ? WEEKDAY_LABELS_AR : WEEKDAY_LABELS_EN;
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();

  const cells: (Date | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))];

  return (
    <View style={styles.container}>
      <View style={styles.monthHeader}>
        <Pressable
          hitSlop={10}
          onPress={() => setVisibleMonth(new Date(year, month - 1, 1))}
          disabled={year === today.getFullYear() && month === today.getMonth()}
        >
          <Ionicons
            name="chevron-forward"
            size={18}
            color={year === today.getFullYear() && month === today.getMonth() ? colors.ivory2 : colors.pine}
          />
        </Pressable>
        <Text style={styles.monthLabel}>{monthYearLabel(visibleMonth, locale)}</Text>
        <Pressable hitSlop={10} onPress={() => setVisibleMonth(new Date(year, month + 1, 1))}>
          <Ionicons name="chevron-back" size={18} color={colors.pine} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {weekdayLabels.map((label) => (
          <Text key={label} style={styles.weekdayText}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((date, i) => {
          if (!date) return <View key={`blank-${i}`} style={styles.cell} />;
          const iso = toISODate(date);
          const isPast = date < today;
          const reserved = isReserved(iso, reservedRanges);
          const blocked = blockedDates.includes(iso);
          const disabled = isPast || reserved;

          return (
            <Pressable
              key={iso}
              style={[styles.cell, blocked && styles.cellBlocked, reserved && styles.cellReserved]}
              disabled={disabled}
              onPress={() => onToggle(iso)}
            >
              <Text style={[styles.cellText, disabled && styles.cellTextDisabled, blocked && styles.cellTextBlocked]}>{date.getDate()}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#B5482C' }]} />
          <Text style={styles.legendText}>{t('booking.unavailableDatesNote')}</Text>
        </View>
        <Text style={styles.legendText}>
          {blockedDates.length > 0 ? t('booking.availabilityBlockedCount', { count: blockedDates.length }) : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  monthLabel: { fontFamily: fonts.headingBold, fontSize: 13, color: colors.pine },
  weekdayRow: { flexDirection: 'row' },
  weekdayText: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.inkSoft },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellBlocked: { backgroundColor: '#B5482C', borderRadius: radii.pill },
  cellReserved: { backgroundColor: `${colors.inkSoft}20`, borderRadius: radii.pill },
  cellText: { fontFamily: fonts.bodyRegular, fontSize: 12, color: colors.ink },
  cellTextDisabled: { color: colors.ivory2 },
  cellTextBlocked: { fontFamily: fonts.headingBold, color: colors.white },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: fonts.bodyRegular, fontSize: 10, color: colors.inkSoft },
});
