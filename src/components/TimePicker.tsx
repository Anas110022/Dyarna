import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/src/i18n';
import { colors, fonts, radii, spacing } from '@/src/theme';

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ['00', '15', '30', '45'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Postgres `time` values only, always built from a real hour/minute/period
// pick — never parsed from free text, so a value like "22:15:00" can never
// be malformed. Shared by the booking-listing posting flow and the
// price/policy edit screen so both build the exact same real value shape.
function chipsToTime(hour12: number, minute: string, period: 'AM' | 'PM'): string {
  let hour24 = hour12 % 12;
  if (period === 'PM') hour24 += 12;
  return `${pad2(hour24)}:${minute}:00`;
}

function timeToChips(value: string | null): { hour12: number; minute: string; period: 'AM' | 'PM' } | null {
  if (!value) return null;
  const [hStr, mStr] = value.split(':');
  const hour24 = Number(hStr);
  const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  const minute = MINUTES.includes(mStr) ? mStr : '00';
  return { hour12, minute, period };
}

export function TimePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { locale } = useI18n();
  const chips = timeToChips(value);

  const set = (hour12: number, minute: string, period: 'AM' | 'PM') => {
    onChange(chipsToTime(hour12, minute, period));
  };

  return (
    <View style={styles.fieldGroup}>
      <View style={styles.timeFieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {value && (
          <Pressable onPress={() => onChange(null)}>
            <Text style={styles.clearTimeText}>{locale === 'ar' ? 'مسح' : 'Clear'}</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.timeChipsRow}>
        {HOURS.map((h) => (
          <Pressable
            key={h}
            style={[styles.timeChip, chips?.hour12 === h && styles.timeChipActive]}
            onPress={() => set(h, chips?.minute ?? '00', chips?.period ?? 'PM')}
          >
            <Text style={[styles.timeChipText, chips?.hour12 === h && styles.timeChipTextActive]}>{h}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.timeChipsRow}>
        {MINUTES.map((m) => (
          <Pressable
            key={m}
            style={[styles.timeChip, chips?.minute === m && styles.timeChipActive]}
            onPress={() => set(chips?.hour12 ?? 12, m, chips?.period ?? 'PM')}
          >
            <Text style={[styles.timeChipText, chips?.minute === m && styles.timeChipTextActive]}>{m}</Text>
          </Pressable>
        ))}
        {(['AM', 'PM'] as const).map((p) => (
          <Pressable
            key={p}
            style={[styles.timeChip, chips?.period === p && styles.timeChipActive]}
            onPress={() => set(chips?.hour12 ?? 12, chips?.minute ?? '00', p)}
          >
            <Text style={[styles.timeChipText, chips?.period === p && styles.timeChipTextActive]}>
              {p === 'AM' ? (locale === 'ar' ? 'ص' : 'AM') : locale === 'ar' ? 'م' : 'PM'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldGroup: { gap: spacing.xs },
  fieldLabel: { fontFamily: fonts.headingBold, fontSize: 12, color: colors.ink },
  timeFieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearTimeText: { fontFamily: fonts.bodyMedium, fontSize: 10.5, color: colors.inkSoft },
  timeChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  timeChip: { backgroundColor: colors.white, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 40, alignItems: 'center' },
  timeChipActive: { backgroundColor: colors.pine },
  timeChipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.inkSoft },
  timeChipTextActive: { fontFamily: fonts.headingBold, color: colors.goldSoft },
});
