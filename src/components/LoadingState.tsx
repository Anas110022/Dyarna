import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeContext';

// The one shared full-area loading spinner block.
export function LoadingState() {
  const { colors: theme } = useTheme();
  return (
    <View style={styles.container}>
      <ActivityIndicator color={theme.headingText} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
