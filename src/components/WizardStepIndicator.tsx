import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, spacing } from '@/src/theme';

// Real Dyarna-styled wizard stepper — a horizontal row of numbered steps
// with short labels, the current step highlighted in pine/gold, completed
// steps shown with a checkmark. A completed step is tappable so the owner
// can jump back to review/edit it without losing anything already entered
// (the caller's form state lives above this component and is untouched by
// navigating between steps). Never lets the owner skip ahead past the
// current step — only step <= currentStep is tappable.

export function WizardStepIndicator({
  currentStep,
  totalSteps,
  labels,
  onStepPress,
}: {
  currentStep: number;
  totalSteps: number;
  labels: string[];
  onStepPress: (step: number) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => {
        const isCurrent = step === currentStep;
        const isDone = step < currentStep;
        const isReachable = step <= currentStep;
        return (
          <Pressable
            key={step}
            style={styles.item}
            disabled={!isReachable}
            onPress={() => onStepPress(step)}
          >
            <View style={[styles.badge, isCurrent && styles.badgeCurrent, isDone && styles.badgeDone]}>
              {isDone ? (
                <Ionicons name="checkmark" size={13} color={colors.goldSoft} />
              ) : (
                <Text style={[styles.badgeText, isCurrent && styles.badgeTextCurrent]}>{step}</Text>
              )}
            </View>
            <Text style={[styles.label, (isCurrent || isDone) && styles.labelActive]} numberOfLines={1}>
              {labels[step - 1]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.lg, gap: spacing.md, paddingVertical: spacing.sm },
  item: { alignItems: 'center', width: 68, gap: 4 },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.ivory2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCurrent: { backgroundColor: colors.pine, borderColor: colors.pine },
  badgeDone: { backgroundColor: colors.pine, borderColor: colors.pine },
  badgeText: { fontFamily: fonts.headingBold, fontSize: 11, color: colors.inkSoft },
  badgeTextCurrent: { color: colors.goldSoft },
  label: { fontFamily: fonts.bodyMedium, fontSize: 9.5, color: colors.inkSoft, textAlign: 'center' },
  labelActive: { fontFamily: fonts.headingBold, color: colors.pine },
});
