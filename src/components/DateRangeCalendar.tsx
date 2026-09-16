import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { colors, fonts, radii, spacing } from '@/src/theme';
import type { UnavailableRange } from '@/src/lib/bookings';
import { monthYearLabel } from '@/src/lib/arabicDate';

// Real month-grid check-in/check-out picker — no external calendar library,
// just plain date math, so it never needs a native rebuild. Dates are
// always plain 'YYYY-MM-DD' strings (matching the real `date` columns in
// Postgres) and built/compared in LOCAL time throughout — never via
// toISOString()/UTC, which would silently shift the selected day near
// midnight in some timezones.

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isBetween(iso: string, startIso: string, endIsoExclusive: string): boolean {
  return iso >= startIso && iso < endIsoExclusive;
}

// Real unavailable ranges only — from actual reservations, never invented.
function isDateUnavailable(iso: string, ranges: UnavailableRange[]): boolean {
  return ranges.some((r) => isBetween(iso, r.checkIn, r.checkOut));
}

// Would selecting endIso as checkout, given startIso as checkin, cross over
// a real booked date in between? Prevents picking a range that jumps over
// an unavailable stretch.
function rangeCrossesUnavailable(startIso: string, endIso: string, ranges: UnavailableRange[]): boolean {
  const start = parseISODate(startIso);
  const end = parseISODate(endIso);
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    if (isDateUnavailable(toISODate(d), ranges)) return true;
  }
  return false;
}

const WEEKDAY_LABELS_AR = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const WEEKDAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DateRangeCalendar({
  checkIn,
  checkOut,
  onChange,
  unavailableRanges = [],
  minimumNights = 1,
}: {
  checkIn: string | null;
  checkOut: string | null;
  onChange: (checkIn: string | null, checkOut: string | null) => void;
  unavailableRanges?: UnavailableRange[];
  minimumNights?: number;
}) {
  const { t, locale } = useI18n();
  const today = startOfToday();
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const base = checkIn ? parseISODate(checkIn) : today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const weekdayLabels = locale === 'ar' ? WEEKDAY_LABELS_AR : WEEKDAY_LABELS_EN;

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();

  const cells: (Date | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))];

  const handlePress = (date: Date) => {
    const iso = toISODate(date);
    if (!checkIn || (checkIn && checkOut)) {
      onChange(iso, null);
      return;
    }
    // checkIn set, checkOut not yet
    if (iso <= checkIn) {
      onChange(iso, null);
      return;
    }
    if (rangeCrossesUnavailable(checkIn, iso, unavailableRanges)) {
      // Can't select across a real booked stretch — restart from this date.
      onChange(iso, null);
      return;
    }
    onChange(checkIn, iso);
  };

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
          const isUnavailable = isDateUnavailable(iso, unavailableRanges);
          const disabled = isPast || isUnavailable;
          const isCheckIn = iso === checkIn;
          const isCheckOut = iso === checkOut;
          const inRange = !!checkIn && !!checkOut && isBetween(iso, checkIn, checkOut);

          return (
            <Pressable
              key={iso}
              style={[
                styles.cell,
                inRange && styles.cellInRange,
                (isCheckIn || isCheckOut) && styles.cellEdge,
              ]}
              disabled={disabled}
              onPress={() => handlePress(date)}
            >
              <Text
                style={[
                  styles.cellText,
                  disabled && styles.cellTextDisabled,
                  (isCheckIn || isCheckOut) && styles.cellTextEdge,
                ]}
              >
                {date.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.ivory2 }]} />
          <Text style={styles.legendText}>{t('booking.unavailableDatesNote')}</Text>
        </View>
        {checkIn && checkOut && (
          <Text style={styles.legendText}>{t('booking.minimumStayValue', { count: minimumNights })}</Text>
        )}
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
  cellInRange: { backgroundColor: `${colors.pine}14` },
  cellEdge: { backgroundColor: colors.pine, borderRadius: radii.pill },
  cellText: { fontFamily: fonts.bodyRegular, fontSize: 12, color: colors.ink },
  cellTextDisabled: { color: colors.ivory2 },
  cellTextEdge: { fontFamily: fonts.headingBold, color: colors.goldSoft },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: fonts.bodyRegular, fontSize: 10, color: colors.inkSoft },
});
