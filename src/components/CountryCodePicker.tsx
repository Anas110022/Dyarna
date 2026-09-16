import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, radii, spacing } from '@/src/theme';
import { COUNTRY_CODES, type CountryCode } from '@/src/lib/countryCodes';

export function CountryCodePicker({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: CountryCode;
  onSelect: (country: CountryCode) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return COUNTRY_CODES;
    return COUNTRY_CODES.filter((c) => c.nameAr.includes(q) || c.dialCode.includes(q.replace(/[+\s]/g, '')));
  }, [query]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={15} color={colors.inkSoft} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="ابحث عن دولة أو رمز"
              placeholderTextColor={colors.inkSoft}
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.iso}
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onSelect(item);
                  setQuery('');
                  onClose();
                }}
              >
                <Text style={styles.flag}>{item.flag}</Text>
                <Text style={styles.name}>{item.nameAr}</Text>
                <Text style={styles.dialCode}>{`+${item.dialCode}`}</Text>
                {item.iso === selected.iso && <Ionicons name="checkmark" size={16} color={colors.pine} />}
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(11,43,33,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, maxHeight: '70%', paddingVertical: spacing.sm },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ivory2,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radii.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInput: { flex: 1, fontFamily: fonts.bodyRegular, fontSize: 13, color: colors.ink, padding: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  flag: { fontSize: 20 },
  name: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  dialCode: { fontFamily: fonts.headingBold, fontSize: 13, color: colors.inkSoft },
});
