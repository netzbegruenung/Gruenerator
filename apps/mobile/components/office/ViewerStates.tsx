import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { colors, darkTheme, lightTheme } from '../../theme';

export function ViewerLoading() {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;
  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <ActivityIndicator size="large" color={colors.primary[600]} />
    </View>
  );
}

export function ViewerError({ message }: { message?: string }) {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;
  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Ionicons name="alert-circle-outline" size={56} color={colors.error[500]} />
      <Text style={[styles.title, { color: theme.text }]}>Konnte nicht geladen werden</Text>
      {message ? <Text style={[styles.msg, { color: theme.textSecondary }]}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  msg: {
    fontSize: 14,
    textAlign: 'center',
  },
});
