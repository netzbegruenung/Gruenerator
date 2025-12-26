import { StyleSheet, Text, View, Pressable, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { lightTheme, darkTheme, typography, spacing, colors, borderRadius } from '../../theme';

/**
 * Profile screen
 * User account and settings
 */
export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const handleLogin = () => {
    router.push('/(auth)/login');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>
        Profil
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Melde dich an, um alle Funktionen zu nutzen
      </Text>

      <Pressable
        style={({ pressed }) => [
          styles.loginButton,
          {
            backgroundColor: colors.primary[600],
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        onPress={handleLogin}
      >
        <Text style={styles.loginButtonText}>Anmelden</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.medium,
  },
  title: {
    ...typography.h2,
    marginBottom: spacing.small,
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.large,
  },
  loginButton: {
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.large,
    borderRadius: borderRadius.medium,
  },
  loginButtonText: {
    ...typography.button,
    color: colors.white,
  },
});
