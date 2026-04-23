import { useActionSheet } from '@expo/react-native-action-sheet';
import { Ionicons } from '@expo/vector-icons';
import { buildGroupInviteUrl } from '@gruenerator/shared/groups';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
  Pressable,
  Alert,
  Share,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupAvatar } from '../../../../components/workplace/GroupAvatar';
import {
  useDeleteGroup,
  useDeleteGroupAvatar,
  useGroupDetails,
  useGroupMembers,
  useLeaveGroup,
  useUploadGroupAvatar,
} from '../../../../hooks/useGroups';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  lightTheme,
  darkTheme,
} from '../../../../theme';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { showActionSheetWithOptions } = useActionSheet();

  const detailsQuery = useGroupDetails(id);
  const membersQuery = useGroupMembers(id);
  const deleteGroup = useDeleteGroup();
  const leaveGroup = useLeaveGroup();
  const uploadAvatar = useUploadGroupAvatar(id ?? '');
  const deleteAvatar = useDeleteGroupAvatar(id ?? '');

  const group = detailsQuery.data?.group;
  const membership = detailsQuery.data?.membership;
  const isAdmin = membership?.isAdmin ?? false;

  const handleShare = useCallback(async () => {
    if (!group?.join_token) return;
    const url = buildGroupInviteUrl(group.join_token);
    try {
      await Share.share({
        message: `Tritt der Gruppe „${group.name}" auf Grünerator bei: ${url}`,
        url,
      });
    } catch {
      // User dismissed the share sheet — silent is fine
    }
  }, [group]);

  const pickAndUploadAvatar = useCallback(
    async (source: 'camera' | 'library') => {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(
          'Berechtigung fehlt',
          source === 'camera'
            ? 'Kamera-Zugriff ist erforderlich, um ein Foto aufzunehmen.'
            : 'Medienzugriff ist erforderlich, um ein Bild auszuwählen.'
        );
        return;
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const ext = mimeType.split('/')[1] ?? 'jpg';
      const formData = new FormData();
      formData.append('avatar', {
        uri: asset.uri,
        name: `group-avatar.${ext}`,
        type: mimeType,
      } as unknown as Blob);
      uploadAvatar.mutate(formData, {
        onError: (err) =>
          Alert.alert(
            'Fehler',
            err instanceof Error ? err.message : 'Bild konnte nicht hochgeladen werden.'
          ),
      });
    },
    [uploadAvatar]
  );

  const handleAvatarPress = useCallback(() => {
    if (!isAdmin) return;
    const hasAvatar = !!group?.avatar_url;
    const options = hasAvatar
      ? ['Foto aufnehmen', 'Aus Galerie wählen', 'Bild entfernen', 'Abbrechen']
      : ['Foto aufnehmen', 'Aus Galerie wählen', 'Abbrechen'];
    const cancelButtonIndex = hasAvatar ? 3 : 2;
    const destructiveButtonIndex = hasAvatar ? 2 : undefined;
    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        ...(destructiveButtonIndex !== undefined ? { destructiveButtonIndex } : {}),
        title: 'Gruppenbild',
      },
      (idx) => {
        if (idx === 0) void pickAndUploadAvatar('camera');
        if (idx === 1) void pickAndUploadAvatar('library');
        if (hasAvatar && idx === 2) {
          Alert.alert('Bild entfernen?', 'Das Gruppenbild wird gelöscht.', [
            { text: 'Abbrechen', style: 'cancel' },
            {
              text: 'Entfernen',
              style: 'destructive',
              onPress: () =>
                deleteAvatar.mutate(undefined, {
                  onError: (err) =>
                    Alert.alert(
                      'Fehler',
                      err instanceof Error ? err.message : 'Löschen fehlgeschlagen.'
                    ),
                }),
            },
          ]);
        }
      }
    );
  }, [isAdmin, group?.avatar_url, showActionSheetWithOptions, pickAndUploadAvatar, deleteAvatar]);

  const handleDelete = useCallback(() => {
    if (!id || !group) return;
    Alert.alert(
      'Gruppe löschen?',
      `„${group.name}" wird für alle Mitglieder unwiderruflich gelöscht.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => {
            deleteGroup.mutate(id, {
              onSuccess: () => router.back(),
              onError: (err) =>
                Alert.alert(
                  'Fehler',
                  err instanceof Error ? err.message : 'Löschen fehlgeschlagen.'
                ),
            });
          },
        },
      ]
    );
  }, [id, group, deleteGroup, router]);

  const handleLeave = useCallback(() => {
    if (!id || !group) return;
    Alert.alert(
      'Gruppe verlassen?',
      `Du wirst aus „${group.name}" entfernt. Gruppe kann jederzeit wieder beigetreten werden.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Verlassen',
          style: 'destructive',
          onPress: () => {
            leaveGroup.mutate(id, {
              onSuccess: () => router.back(),
              onError: (err) =>
                Alert.alert(
                  'Fehler',
                  err instanceof Error ? err.message : 'Verlassen fehlgeschlagen.'
                ),
            });
          },
        },
      ]
    );
  }, [id, group, leaveGroup, router]);

  const showAdminMenu = useCallback(() => {
    const options = [
      'Gruppe bearbeiten',
      'Einladungslink teilen',
      'Mitglieder verwalten',
      'Links verwalten',
      'Gruppe löschen',
      'Abbrechen',
    ];
    showActionSheetWithOptions(
      {
        options,
        destructiveButtonIndex: 4,
        cancelButtonIndex: 5,
        title: group?.name,
      },
      (idx) => {
        if (idx === 0) router.push(`/(focused)/gruppen/${id}/edit`);
        if (idx === 1) void handleShare();
        if (idx === 2) router.push(`/(focused)/gruppen/${id}/members`);
        if (idx === 3) router.push(`/(focused)/gruppen/${id}/links`);
        if (idx === 4) handleDelete();
      }
    );
  }, [group?.name, id, router, showActionSheetWithOptions, handleShare, handleDelete]);

  const showMemberMenu = useCallback(() => {
    const options = ['Mitglieder ansehen', 'Gruppe verlassen', 'Abbrechen'];
    showActionSheetWithOptions(
      {
        options,
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
        title: group?.name,
      },
      (idx) => {
        if (idx === 0) router.push(`/(focused)/gruppen/${id}/members`);
        if (idx === 1) handleLeave();
      }
    );
  }, [group?.name, id, router, showActionSheetWithOptions, handleLeave]);

  if (detailsQuery.isPending) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
        edges={['top']}
      >
        <Header onBack={() => router.back()} theme={theme} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      </SafeAreaView>
    );
  }

  if (detailsQuery.error || !group) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
        edges={['top']}
      >
        <Header onBack={() => router.back()} theme={theme} />
        <View style={styles.centered}>
          <Ionicons name="alert-circle" size={48} color={colors.semantic.error} />
          <Text style={[styles.errorText, { color: colors.semantic.error }]}>
            {detailsQuery.error instanceof Error
              ? detailsQuery.error.message
              : 'Gruppe konnte nicht geladen werden.'}
          </Text>
          <Pressable
            onPress={() => void detailsQuery.refetch()}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
            ]}
          >
            <Text style={styles.primaryButtonText}>Erneut versuchen</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const roleLabel = membership?.isAdmin ? 'Admin' : 'Mitglied';
  const members = membersQuery.data ?? [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <Header
        onBack={() => router.back()}
        theme={theme}
        rightIcon="ellipsis-horizontal"
        onRightPress={isAdmin ? showAdminMenu : showMemberMenu}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={detailsQuery.isRefetching}
            onRefresh={() => {
              void detailsQuery.refetch();
              void membersQuery.refetch();
            }}
          />
        }
      >
        <View style={styles.hero}>
          <Pressable
            onPress={handleAvatarPress}
            disabled={!isAdmin || uploadAvatar.isPending || deleteAvatar.isPending}
            style={({ pressed }) => ({ opacity: pressed && isAdmin ? 0.7 : 1 })}
          >
            <GroupAvatar name={group.name} avatarUrl={group.avatar_url} size={88} />
            {isAdmin ? (
              <View style={styles.avatarBadge}>
                {uploadAvatar.isPending || deleteAvatar.isPending ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="camera" size={14} color={colors.white} />
                )}
              </View>
            ) : null}
          </Pressable>
          <Text style={[styles.groupName, { color: theme.text }]}>{group.name}</Text>
          <View style={[styles.roleBadge, { backgroundColor: colors.primary[600] + '18' }]}>
            <Text style={[styles.roleBadgeText, { color: colors.primary[600] }]}>{roleLabel}</Text>
          </View>
          {group.description ? (
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              {group.description}
            </Text>
          ) : null}
        </View>

        {isAdmin && group.join_token ? (
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [
              styles.primaryButton,
              styles.fullWidthButton,
              { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
            ]}
          >
            <Ionicons name="share-outline" size={20} color={colors.white} />
            <Text style={styles.primaryButtonText}>Einladungslink teilen</Text>
          </Pressable>
        ) : null}

        <Section title="Mitglieder" theme={theme}>
          <Pressable
            onPress={() => router.push(`/(focused)/gruppen/${id}/members`)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: pressed ? theme.surface : theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <Ionicons name="people" size={22} color={colors.primary[600]} />
            <Text style={[styles.rowLabel, { color: theme.text }]}>
              {members.length || '–'} {members.length === 1 ? 'Mitglied' : 'Mitglieder'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </Pressable>
        </Section>

        <Section title="Links" theme={theme}>
          <Pressable
            onPress={() => router.push(`/(focused)/gruppen/${id}/links`)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: pressed ? theme.surface : theme.card,
                borderColor: theme.cardBorder,
              },
            ]}
          >
            <Ionicons name="link" size={22} color={colors.primary[600]} />
            <Text style={[styles.rowLabel, { color: theme.text }]}>
              {group.links && group.links.length > 0
                ? `${group.links.length} ${group.links.length === 1 ? 'Link' : 'Links'}`
                : 'Keine Links'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </Pressable>
        </Section>

        {!isAdmin ? (
          <Pressable
            onPress={handleLeave}
            disabled={leaveGroup.isPending}
            style={({ pressed }) => [
              styles.destructiveButton,
              { opacity: pressed || leaveGroup.isPending ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="exit-outline" size={20} color={colors.semantic.error} />
            <Text style={[styles.destructiveButtonText, { color: colors.semantic.error }]}>
              Gruppe verlassen
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

type ThemeColors = typeof lightTheme | typeof darkTheme;

function Header({
  onBack,
  theme,
  rightIcon,
  onRightPress,
}: {
  onBack: () => void;
  theme: ThemeColors;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
}) {
  return (
    <View style={[styles.header, { borderBottomColor: theme.border }]}>
      <Pressable
        onPress={onBack}
        hitSlop={10}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
      >
        <Ionicons name="chevron-back" size={28} color={theme.text} />
      </Pressable>
      <View style={{ flex: 1 }} />
      {rightIcon && onRightPress ? (
        <Pressable
          onPress={onRightPress}
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Ionicons name={rightIcon} size={24} color={theme.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Section({
  title,
  children,
  theme,
}: {
  title: string;
  children: React.ReactNode;
  theme: ThemeColors;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 52,
    paddingHorizontal: spacing.medium,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: { padding: spacing.medium, paddingBottom: spacing.xxlarge, gap: spacing.large },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
    padding: spacing.xlarge,
  },
  errorText: { ...typography.body, textAlign: 'center' },
  hero: { alignItems: 'center', gap: spacing.small, paddingVertical: spacing.medium },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  groupName: { ...typography.h2, textAlign: 'center' },
  roleBadge: {
    paddingHorizontal: spacing.small,
    paddingVertical: 4,
    borderRadius: borderRadius.small,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '600' },
  description: {
    ...typography.body,
    textAlign: 'center',
    paddingHorizontal: spacing.medium,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.small + 2,
    borderRadius: borderRadius.medium,
  },
  fullWidthButton: { alignSelf: 'stretch' },
  primaryButtonText: { ...typography.body, fontWeight: '600', color: colors.white },
  section: { gap: spacing.xsmall },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.xsmall,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    padding: spacing.medium,
  },
  rowLabel: { ...typography.body, flex: 1 },
  destructiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small + 2,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    borderColor: colors.semantic.error,
    alignSelf: 'stretch',
  },
  destructiveButtonText: { ...typography.body, fontWeight: '600' },
});
