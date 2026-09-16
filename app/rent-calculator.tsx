import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useI18n } from '@/src/i18n';
import { fonts, fontSizes, radii, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';
import type { ThemeColors } from '@/src/theme/themeTokens';
import { AppHeader } from '@/src/components/AppHeader';
import { FormInput } from '@/src/components/FormInput';

type RentType = 'monthly' | 'annual';

function formatAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const isWhole = Number.isInteger(rounded);
  const fixed = rounded.toFixed(isWhole ? 0 : 2);
  const [intPart, decPart] = fixed.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart ? `${withCommas}.${decPart}` : withCommas;
}

// Empty/blank input is valid (0) for optional fields — only a genuinely
// entered negative or non-numeric value is an error.
function parseOptionalAmount(text: string): { value: number; error: boolean } {
  const trimmed = text.trim();
  if (!trimmed) return { value: 0, error: false };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return { value: 0, error: true };
  return { value: n, error: false };
}

// The real calculation — see supabase-free, purely local by design (§14 of
// the spec: no table, no fake API, computed straight from what the user
// typed). Every intermediate value is a raw float; only the final render
// rounds for display, so totals can never drift from rounding early.
function computeRentCalculation(input: { rentAmount: number; rentType: RentType; months: number; additionalFees: number; deposit: number }) {
  const monthlyRent = input.rentType === 'monthly' ? input.rentAmount : input.rentAmount / 12;
  const annualRent = input.rentType === 'monthly' ? input.rentAmount * 12 : input.rentAmount;
  const totalRent = monthlyRent * input.months;
  const initialTotal = totalRent + input.additionalFees + input.deposit;
  return { monthlyRent, annualRent, totalRent, additionalFees: input.additionalFees, deposit: input.deposit, initialTotal };
}

export default function RentCalculatorScreen() {
  const { t } = useI18n();
  const { colors: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [rentAmount, setRentAmount] = useState('');
  const [rentType, setRentType] = useState<RentType>('monthly');
  const [months, setMonths] = useState('');
  const [additionalFees, setAdditionalFees] = useState('');
  const [deposit, setDeposit] = useState('');
  const [hasInteracted, setHasInteracted] = useState(false);

  const markInteracted = () => {
    if (!hasInteracted) setHasInteracted(true);
  };

  const rentTrimmed = rentAmount.trim();
  const rentNum = Number(rentTrimmed);
  const rentError = !rentTrimmed
    ? t('rentCalculator.rentRequired')
    : !Number.isFinite(rentNum) || rentNum <= 0
      ? t('rentCalculator.rentInvalid')
      : null;

  const monthsTrimmed = months.trim();
  const monthsNum = Number(monthsTrimmed);
  const monthsError = !monthsTrimmed
    ? t('rentCalculator.durationRequired')
    : !Number.isFinite(monthsNum) || monthsNum <= 0
      ? t('rentCalculator.durationInvalid')
      : null;

  const fees = parseOptionalAmount(additionalFees);
  const depositParsed = parseOptionalAmount(deposit);

  const canCalculate = !rentError && !monthsError && !fees.error && !depositParsed.error;

  const result = useMemo(() => {
    if (!canCalculate) return null;
    return computeRentCalculation({ rentAmount: rentNum, rentType, months: monthsNum, additionalFees: fees.value, deposit: depositParsed.value });
  }, [canCalculate, rentNum, rentType, monthsNum, fees.value, depositParsed.value]);

  const handleReset = () => {
    setRentAmount('');
    setRentType('monthly');
    setMonths('');
    setAdditionalFees('');
    setDeposit('');
    setHasInteracted(false);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader title={t('rentCalculator.title')} />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.description}>{t('rentCalculator.description')}</Text>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t('rentCalculator.rentAmountLabel')}</Text>
          <View style={styles.amountInputRow}>
            <View style={styles.currencyBadge}>
              <Text style={styles.currencyBadgeText}>USD</Text>
            </View>
            <FormInput
              value={rentAmount}
              onChangeText={(v) => {
                markInteracted();
                setRentAmount(v);
              }}
              keyboardType="decimal-pad"
              textAlign="left"
              containerStyle={styles.amountInput}
            />
          </View>
          {hasInteracted && rentError && <Text style={styles.errorText}>{rentError}</Text>}

          <Text style={styles.fieldLabel}>{t('rentCalculator.rentTypeLabel')}</Text>
          <View style={styles.rowWrap}>
            <Pressable
              style={[styles.choiceChip, rentType === 'monthly' && styles.choiceChipActive]}
              onPress={() => setRentType('monthly')}
            >
              <Text style={[styles.choiceChipText, rentType === 'monthly' && styles.choiceChipTextActive]}>
                {t('rentCalculator.rentTypeMonthly')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.choiceChip, rentType === 'annual' && styles.choiceChipActive]}
              onPress={() => setRentType('annual')}
            >
              <Text style={[styles.choiceChipText, rentType === 'annual' && styles.choiceChipTextActive]}>
                {t('rentCalculator.rentTypeAnnual')}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>{t('rentCalculator.durationLabel')}</Text>
          <Text style={styles.subLabel}>{t('rentCalculator.durationMonthsLabel')}</Text>
          <FormInput
            value={months}
            onChangeText={(v) => {
              markInteracted();
              setMonths(v);
            }}
            keyboardType="number-pad"
          />
          {hasInteracted && monthsError && <Text style={styles.errorText}>{monthsError}</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t('rentCalculator.additionalFeesLabel')}</Text>
          <View style={styles.amountInputRow}>
            <View style={styles.currencyBadge}>
              <Text style={styles.currencyBadgeText}>USD</Text>
            </View>
            <FormInput
              value={additionalFees}
              onChangeText={(v) => {
                markInteracted();
                setAdditionalFees(v);
              }}
              keyboardType="decimal-pad"
              textAlign="left"
              containerStyle={styles.amountInput}
            />
          </View>
          {hasInteracted && fees.error && <Text style={styles.errorText}>{t('rentCalculator.optionalFieldInvalid')}</Text>}

          <Text style={styles.fieldLabel}>{t('rentCalculator.depositLabel')}</Text>
          <View style={styles.amountInputRow}>
            <View style={styles.currencyBadge}>
              <Text style={styles.currencyBadgeText}>USD</Text>
            </View>
            <FormInput
              value={deposit}
              onChangeText={(v) => {
                markInteracted();
                setDeposit(v);
              }}
              keyboardType="decimal-pad"
              textAlign="left"
              containerStyle={styles.amountInput}
            />
          </View>
          {hasInteracted && depositParsed.error && <Text style={styles.errorText}>{t('rentCalculator.optionalFieldInvalid')}</Text>}
        </View>

        {result && (
          <View style={styles.resultsCard}>
            <Text style={styles.resultsTitle}>{t('rentCalculator.resultsTitle')}</Text>

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>{t('rentCalculator.monthlyRentResult')}</Text>
              <Text style={styles.resultValue}>${formatAmount(result.monthlyRent)}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>{t('rentCalculator.annualRentResult')}</Text>
              <Text style={styles.resultValue}>${formatAmount(result.annualRent)}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>{t('rentCalculator.durationResult')}</Text>
              <Text style={styles.resultValue}>
                {monthsNum} {t('rentCalculator.monthsUnit')}
              </Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>{t('rentCalculator.totalRentResult')}</Text>
              <Text style={styles.resultValue}>${formatAmount(result.totalRent)}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>{t('rentCalculator.additionalFeesResult')}</Text>
              <Text style={styles.resultValue}>${formatAmount(result.additionalFees)}</Text>
            </View>
            <View style={[styles.resultRow, styles.resultRowLast]}>
              <Text style={styles.resultLabel}>{t('rentCalculator.depositResult')}</Text>
              <Text style={styles.resultValue}>${formatAmount(result.deposit)}</Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('rentCalculator.initialTotalResult')}</Text>
              <Text style={styles.totalValue}>${formatAmount(result.initialTotal)}</Text>
            </View>
          </View>
        )}

        <Pressable style={styles.resetButton} onPress={handleReset}>
          <Ionicons name="refresh-outline" size={15} color={theme.headingText} />
          <Text style={styles.resetButtonText}>{t('rentCalculator.resetButton')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.background },
    scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
    description: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.bodySmall, color: theme.mutedText, lineHeight: 19, marginBottom: spacing.lg },

    card: { backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
    fieldLabel: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText, marginTop: spacing.md, marginBottom: spacing.xs },
    subLabel: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText, marginBottom: 4 },

    amountInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    currencyBadge: { backgroundColor: theme.surfaceAlt, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
    currencyBadgeText: { fontFamily: fonts.headingBold, fontSize: fontSizes.caption, color: theme.headingText },
    amountInput: { flex: 1 },

    errorText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.caption, color: theme.danger, marginTop: 4 },

    rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    choiceChip: { backgroundColor: theme.background, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    choiceChipActive: { backgroundColor: theme.brandFill },
    choiceChipText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.bodySmall, color: theme.mutedText },
    choiceChipTextActive: { fontFamily: fonts.headingBold, color: theme.onBrandFill },

    resultsCard: { backgroundColor: theme.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.md },
    resultsTitle: { fontFamily: fonts.headingExtraBold, fontSize: fontSizes.body, color: theme.headingText, marginBottom: spacing.sm },
    resultRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    resultRowLast: { borderBottomWidth: 0 },
    resultLabel: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.caption, color: theme.mutedText },
    resultValue: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.bodyText },

    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.brandFill,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginTop: spacing.sm,
    },
    totalLabel: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.onBrandFill },
    totalValue: { fontFamily: fonts.headingBlack, fontSize: fontSizes.sectionTitle, color: theme.onBrandFill },

    resetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1.5,
      borderColor: theme.headingText,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
    },
    resetButtonText: { fontFamily: fonts.headingBold, fontSize: fontSizes.bodySmall, color: theme.headingText },
  });
}
