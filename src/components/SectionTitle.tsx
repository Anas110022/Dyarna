import { StyleSheet, Text, type TextStyle } from 'react-native';

import { fonts, fontSizes } from '@/src/theme';
import { useTheme } from '@/src/theme/ThemeContext';

// The one shared in-page section heading ("كل التفاصيل", "الوحدات",
// "وصف العقار"...) — was previously ad-hoc, ranging 13–19px across screens.
export function SectionTitle({ children, style }: { children: string; style?: TextStyle }) {
  const { colors: theme } = useTheme();
  return <Text style={[styles.title, { color: theme.headingText }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.headingBold, fontSize: fontSizes.sectionTitle },
});
