import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { lightTheme, darkTheme, spacing } from '../../theme';
import { ProfileAvatar } from '../common';

interface ProfileHeaderProps {
  user: {
    avatar_robot_id?: string;
    display_name?: string;
    email?: string;
  };
  compact?: boolean;
}

export function ProfileHeader({ user, compact = false }: ProfileHeaderProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  if (compact) {
    return (
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerName, { color: theme.text }]} numberOfLines={1}>
            {user.display_name || 'Grünerator-Nutzer'}
          </Text>
          <Text style={[styles.headerEmail, { color: theme.textSecondary }]} numberOfLines={1}>
            {user.email}
          </Text>
        </View>
        <ProfileAvatar
          avatarRobotId={user.avatar_robot_id}
          displayName={user.display_name}
          email={user.email}
          size="small"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
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
      <Text style={[styles.email, { color: theme.textSecondary }]}>{user.email}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.large,
    paddingHorizontal: spacing.medium,
  },
  avatarContainer: {
    marginBottom: spacing.medium,
  },
  displayName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.xsmall,
  },
  email: {
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  headerInfo: {
    flex: 1,
    marginRight: spacing.small,
  },
  headerName: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerEmail: {
    fontSize: 13,
    marginTop: 2,
  },
});
