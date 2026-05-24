import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  useColorScheme,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useJoinGroup, useVerifyJoinToken } from '../../hooks/useGroups';
import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../theme';

export default function JoinGroupScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const verify = useVerifyJoinToken(token);
  const joinGroup = useJoinGroup();

  // If the user is already a member, route straight to the group detail.
  useEffect(() => {
    if (verify.data?.alreadyMember && verify.data.group.id) {
      router.replace(`/(focused)/gruppen/${verify.data.group.id}`);
    }
  }, [verify.data, router]);

  const confirm = () => {
    if (!token) return;
    joinGroup.mutate(token, {
      onSuccess: (result) => {
        if (result.group?.id) {
          router.replace(`/(focused)/gruppen/${result.group.id}`);
        } else {
          router.replace('/(tabs)/(desk)/gruppen');
        }
      },
      onError: (err) => {
        Alert.alert(
          'Beitritt fehlgeschlagen',
          err instanceof Error ? err.message : 'Unbekannter Fehler.'
        );
      },
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.content}>
        {verify.isPending ? (
          <>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={[styles.text, { color: theme.textSecondary }]}>
              Einladung wird geprüft...
            </Text>
          </>
        ) : verify.error ? (
          <>
            <Ionicons name="close-circle" size={64} color={colors.semantic.error} />
            <Text style={[styles.heading, { color: theme.text }]}>Einladung ungültig</Text>
            <Text style={[styles.text, { color: theme.textSecondary }]}>
              {verify.error instanceof Error
                ? verify.error.message
                : 'Der Link ist nicht mehr gültig.'}
            </Text>
            <Pressable
              onPress={() => router.replace('/(tabs)/(desk)/gruppen')}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
              ]}
            >
              <Text style={styles.primaryButtonText}>Zu meinen Gruppen</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary[600] + '18' }]}>
              <Ionicons name="people" size={48} color={colors.primary[600]} />
            </View>
            <Text style={[styles.heading, { color: theme.text }]}>{verify.data?.group.name}</Text>
            <Text style={[styles.text, { color: theme.textSecondary }]}>
              Möchtest du dieser Gruppe beitreten?
            </Text>
            <Pressable
              onPress={confirm}
              disabled={joinGroup.isPending}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: pressed ? colors.primary[700] : colors.primary[600],
                  opacity: joinGroup.isPending ? 0.6 : 1,
                },
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {joinGroup.isPending ? 'Wird beigetreten...' : 'Beitreten'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/(tabs)/(desk)/gruppen');
              }}
              hitSlop={10}
            >
              <Text style={[styles.text, { color: theme.textSecondary }]}>Abbrechen</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xlarge,
    gap: spacing.medium,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.small,
  },
  heading: { ...typography.h1, textAlign: 'center' },
  text: { ...typography.body, textAlign: 'center' },
  primaryButton: {
    paddingHorizontal: spacing.xlarge,
    paddingVertical: spacing.small + 2,
    borderRadius: borderRadius.medium,
    marginTop: spacing.medium,
  },
  primaryButtonText: { ...typography.body, fontWeight: '600', color: colors.white },
});
