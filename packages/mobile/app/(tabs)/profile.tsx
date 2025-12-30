import { StyleSheet, Text, View, useColorScheme, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { lightTheme, darkTheme, typography, spacing, colors } from '../../theme';
import { useAuth } from '@gruenerator/shared/hooks';
import { logout } from '../../services/auth';
import { Button, ProfileAvatar } from '../../components/common';

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { user, isAuthenticated, isLoading, isLoggingOut } = useAuth();

  const handleLogin = () => {
    router.push('/(auth)/login');
  };

  const handleLogout = async () => {
    await logout();
  };

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </View>
    );
  }

  // Authenticated view
  if (isAuthenticated && user) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <ProfileAvatar
              avatarRobotId={user.avatar_robot_id}
              displayName={user.display_name}
              email={user.email}
              size="large"
            />
          </View>

          <Text style={[styles.displayName, { color: theme.text }]}>
            {user.display_name || 'Grünerator-Nutzer'}
          </Text>

          <Text style={[styles.email, { color: theme.textSecondary }]}>
            {user.email}
          </Text>
        </View>

        <View style={styles.infoSection}>
          <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Region</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {user.locale === 'de-AT' ? 'Österreich' : 'Deutschland'}
            </Text>
          </View>

          {user.igel_modus && (
            <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Igel-Modus</Text>
              <Text style={[styles.infoValue, { color: colors.primary[600] }]}>Aktiv</Text>
            </View>
          )}
        </View>

        <View style={styles.logoutSection}>
          <Button
            variant="outline"
            onPress={handleLogout}
            loading={isLoggingOut}
          >
            Abmelden
          </Button>
        </View>
      </View>
    );
  }

  // Unauthenticated view
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.centered, { flex: 0, paddingTop: spacing.xxlarge }]}>
        <Text style={[styles.title, { color: theme.text }]}>
          Profil
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Melde dich an, um alle Funktionen zu nutzen
        </Text>

        <View style={styles.loginButton}>
          <Button onPress={handleLogin}>Anmelden</Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
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
    width: '100%',
    maxWidth: 300,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: spacing.xlarge,
    paddingHorizontal: spacing.medium,
  },
  avatarContainer: {
    marginBottom: spacing.medium,
  },
  displayName: {
    ...typography.h3,
    marginBottom: spacing.xsmall,
  },
  email: {
    ...typography.body,
  },
  infoSection: {
    paddingHorizontal: spacing.medium,
    marginTop: spacing.medium,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.medium,
    borderBottomWidth: 1,
  },
  infoLabel: {
    ...typography.body,
  },
  infoValue: {
    ...typography.body,
    fontWeight: '500',
  },
  logoutSection: {
    padding: spacing.medium,
    marginTop: 'auto',
    marginBottom: spacing.large,
  },
});
