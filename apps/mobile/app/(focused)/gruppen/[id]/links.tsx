import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useAddGroupLink,
  useDeleteGroupLink,
  useGroupDetails,
  useUpdateGroupLink,
  type GroupLink,
} from '../../../../hooks/useGroups';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  lightTheme,
  darkTheme,
} from '../../../../theme';

const ICON_CHOICES = [
  { key: 'link', ion: 'link' },
  { key: 'globe', ion: 'globe-outline' },
  { key: 'mail', ion: 'mail-outline' },
  { key: 'calendar', ion: 'calendar-outline' },
  { key: 'chat', ion: 'chatbubble-outline' },
  { key: 'folder', ion: 'folder-outline' },
  { key: 'document', ion: 'document-outline' },
  { key: 'video', ion: 'videocam-outline' },
  { key: 'phone', ion: 'call-outline' },
  { key: 'drive', ion: 'cloud-outline' },
] as const satisfies ReadonlyArray<{ key: string; ion: IoniconsIconName }>;

type IconKey = (typeof ICON_CHOICES)[number]['key'];

function iconForKey(key: string): IoniconsIconName {
  return ICON_CHOICES.find((c) => c.key === key)?.ion ?? 'link';
}

export default function GroupLinksScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const detailsQuery = useGroupDetails(id);
  const addLink = useAddGroupLink(id ?? '');
  const updateLink = useUpdateGroupLink(id ?? '');
  const deleteLink = useDeleteGroupLink(id ?? '');

  const group = detailsQuery.data?.group;
  const isAdmin = detailsQuery.data?.membership?.isAdmin ?? false;
  const links = group?.links ?? [];

  const [editing, setEditing] = useState<GroupLink | null>(null);
  const [creating, setCreating] = useState(false);

  const openLink = useCallback(async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else Alert.alert('Fehler', 'Link kann nicht geöffnet werden.');
    } catch {
      Alert.alert('Fehler', 'Link kann nicht geöffnet werden.');
    }
  }, []);

  const confirmDelete = useCallback(
    (link: GroupLink) => {
      Alert.alert('Link löschen?', `„${link.title}" wird entfernt.`, [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => {
            deleteLink.mutate(link.id, {
              onError: (err) =>
                Alert.alert(
                  'Fehler',
                  err instanceof Error ? err.message : 'Löschen fehlgeschlagen.'
                ),
            });
          },
        },
      ]);
    },
    [deleteLink]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Links</Text>
        {isAdmin ? (
          <Pressable onPress={() => setCreating(true)} hitSlop={10}>
            <Ionicons name="add" size={26} color={theme.text} />
          </Pressable>
        ) : (
          <View style={{ width: 28 }} />
        )}
      </View>

      {detailsQuery.isPending ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      ) : links.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="link-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.empty, { color: theme.textSecondary }]}>Noch keine Links</Text>
          {isAdmin ? (
            <Pressable
              onPress={() => setCreating(true)}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
              ]}
            >
              <Text style={styles.primaryButtonText}>Link hinzufügen</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {links.map((link) => (
            <Pressable
              key={link.id}
              onPress={() => void openLink(link.url)}
              onLongPress={isAdmin ? () => setEditing(link) : undefined}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? theme.surface : theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              <View style={[styles.iconBubble, { backgroundColor: colors.primary[600] + '18' }]}>
                <Ionicons name={iconForKey(link.icon)} size={20} color={colors.primary[600]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                  {link.title}
                </Text>
                <Text style={[styles.url, { color: theme.textSecondary }]} numberOfLines={1}>
                  {link.url}
                </Text>
                {link.description ? (
                  <Text
                    style={[styles.description, { color: theme.textSecondary }]}
                    numberOfLines={2}
                  >
                    {link.description}
                  </Text>
                ) : null}
              </View>
              {isAdmin ? (
                <Pressable onPress={() => confirmDelete(link)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={20} color={colors.semantic.error} />
                </Pressable>
              ) : null}
            </Pressable>
          ))}
          {isAdmin ? (
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              Lange tippen zum Bearbeiten.
            </Text>
          ) : null}
        </ScrollView>
      )}

      <LinkEditor
        key={editing?.id ?? (creating ? 'new' : 'closed')}
        visible={creating || !!editing}
        initial={editing}
        theme={theme}
        saving={addLink.isPending || updateLink.isPending}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSave={(payload) => {
          if (editing) {
            updateLink.mutate(
              { linkId: editing.id, ...payload },
              {
                onSuccess: () => setEditing(null),
                onError: (err) =>
                  Alert.alert(
                    'Fehler',
                    err instanceof Error ? err.message : 'Aktualisieren fehlgeschlagen.'
                  ),
              }
            );
          } else {
            addLink.mutate(payload, {
              onSuccess: () => setCreating(false),
              onError: (err) =>
                Alert.alert(
                  'Fehler',
                  err instanceof Error ? err.message : 'Hinzufügen fehlgeschlagen.'
                ),
            });
          }
        }}
      />
    </SafeAreaView>
  );
}

type ThemeColors = typeof lightTheme | typeof darkTheme;

function LinkEditor({
  visible,
  initial,
  theme,
  saving,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initial: GroupLink | null;
  theme: ThemeColors;
  saving: boolean;
  onCancel: () => void;
  onSave: (payload: Omit<GroupLink, 'id'>) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [icon, setIcon] = useState<IconKey>(
    (ICON_CHOICES.find((c) => c.key === initial?.icon)?.key ?? 'link') as IconKey
  );

  const submit = () => {
    const trimmedTitle = title.trim();
    const trimmedUrl = url.trim();
    if (!trimmedTitle || !trimmedUrl) {
      Alert.alert('Fehlende Angaben', 'Titel und URL sind erforderlich.');
      return;
    }
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      Alert.alert('Ungültige URL', 'URL muss mit http:// oder https:// beginnen.');
      return;
    }
    const payload: Omit<GroupLink, 'id'> = { title: trimmedTitle, url: trimmedUrl, icon };
    const trimmedDescription = description.trim();
    if (trimmedDescription) payload.description = trimmedDescription;
    onSave(payload);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={[editorStyles.container, { backgroundColor: theme.background }]}>
        <View style={[editorStyles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={onCancel} hitSlop={10}>
            <Text style={{ color: colors.primary[600], ...typography.body }}>Abbrechen</Text>
          </Pressable>
          <Text style={[editorStyles.title, { color: theme.text }]}>
            {initial ? 'Link bearbeiten' : 'Neuer Link'}
          </Text>
          <Pressable onPress={submit} disabled={saving} hitSlop={10}>
            <Text
              style={{
                color: saving ? theme.textSecondary : colors.primary[600],
                ...typography.bodyBold,
              }}
            >
              {saving ? '...' : 'Speichern'}
            </Text>
          </Pressable>
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={editorStyles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={editorStyles.field}>
              <Text style={[editorStyles.label, { color: theme.textSecondary }]}>Titel</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                maxLength={100}
                autoFocus
                style={[
                  editorStyles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.surface,
                    borderColor: theme.cardBorder,
                  },
                ]}
              />
            </View>
            <View style={editorStyles.field}>
              <Text style={[editorStyles.label, { color: theme.textSecondary }]}>URL</Text>
              <TextInput
                value={url}
                onChangeText={setUrl}
                placeholder="https://..."
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={[
                  editorStyles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.surface,
                    borderColor: theme.cardBorder,
                  },
                ]}
              />
            </View>
            <View style={editorStyles.field}>
              <Text style={[editorStyles.label, { color: theme.textSecondary }]}>Symbol</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={editorStyles.iconRow}
              >
                {ICON_CHOICES.map((choice) => {
                  const selected = icon === choice.key;
                  return (
                    <Pressable
                      key={choice.key}
                      onPress={() => setIcon(choice.key as IconKey)}
                      style={[
                        editorStyles.iconOption,
                        {
                          backgroundColor: selected ? colors.primary[600] : theme.surface,
                          borderColor: selected ? colors.primary[600] : theme.cardBorder,
                        },
                      ]}
                    >
                      <Ionicons
                        name={choice.ion}
                        size={22}
                        color={selected ? colors.white : theme.text}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <View style={editorStyles.field}>
              <Text style={[editorStyles.label, { color: theme.textSecondary }]}>
                Beschreibung (optional)
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                maxLength={300}
                style={[
                  editorStyles.input,
                  editorStyles.multiline,
                  {
                    color: theme.text,
                    backgroundColor: theme.surface,
                    borderColor: theme.cardBorder,
                  },
                ]}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 52,
    paddingHorizontal: spacing.medium,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { ...typography.bodyBold },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
    padding: spacing.xlarge,
  },
  empty: { ...typography.body },
  list: { padding: spacing.medium, gap: spacing.small, paddingBottom: spacing.xxlarge },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    padding: spacing.medium,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.body, fontWeight: '600' },
  url: { ...typography.bodySmall },
  description: { ...typography.bodySmall, marginTop: 2 },
  hint: { ...typography.bodySmall, textAlign: 'center', marginTop: spacing.small },
  primaryButton: {
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
  },
  primaryButtonText: { ...typography.body, fontWeight: '600', color: colors.white },
});

const editorStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 52,
    paddingHorizontal: spacing.medium,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { ...typography.bodyBold },
  content: { padding: spacing.medium, gap: spacing.large },
  field: { gap: spacing.xsmall },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small + 2,
    ...typography.body,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  iconRow: { gap: spacing.xsmall, paddingVertical: 2 },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
