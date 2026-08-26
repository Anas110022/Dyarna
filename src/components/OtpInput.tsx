import { useRef } from 'react';
import { NativeSyntheticEvent, StyleSheet, TextInput, TextInputKeyPressEventData, View } from 'react-native';

import { colors, fonts, radii, spacing } from '@/src/theme';

export function OtpInput({
  length,
  value,
  onChange,
}: {
  length: number;
  value: string;
  onChange: (next: string) => void;
}) {
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const setDigit = (index: number, digit: string) => {
    const chars = value.split('');
    chars[index] = digit;
    onChange(chars.join('').slice(0, length));
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.row}>
      {digits.map((digit, index) => (
        <TextInput
          key={index}
          ref={(ref) => {
            inputRefs.current[index] = ref;
          }}
          style={[styles.box, digit && styles.boxFilled]}
          value={digit}
          onChangeText={(text) => setDigit(index, text.replace(/\D/g, '').slice(-1))}
          onKeyPress={(e) => handleKeyPress(index, e)}
          keyboardType="number-pad"
          maxLength={1}
          textAlign="center"
          autoFocus={index === 0}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm + 2,
  },
  box: {
    width: 44,
    height: 52,
    borderRadius: radii.md + 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(201,168,95,0.35)',
    color: colors.goldSoft,
    fontFamily: fonts.headingExtraBold,
    fontSize: 18,
  },
  boxFilled: {
    borderColor: colors.gold,
  },
});
