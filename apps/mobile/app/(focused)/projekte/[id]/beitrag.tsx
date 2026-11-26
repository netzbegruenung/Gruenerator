import {
  GROUP_POST_FILE_LIMIT,
  GROUP_POST_MAX,
  GROUP_SHARE_NOTE_MAX,
} from '@gruenerator/contracts';
import {
  addItemsToGroup,
  addableKey,
  fileExtensionLabel,
  formatFileSize,
  groupContentKey,
  sharedContentKeys,
  useCreateGroupPost,
  useUpdateGroupPost,
  type AddableItem,
  type GroupFeedKind,
} from '@gruenerator/shared/groups';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { AddableContentList } from '../../../../components/projekte/AddableContentList';
import { FEED_KIND_ICONS } from '../../../../components/projekte/feedIcons';
import { MentionSuggestions } from '../../../../components/projekte/MentionSuggestions';
import {
  addDraftFiles,
  canSubmitPost,
  noteTooLong,
  toUploadFile,
  visibilityHint,
  type DraftFile,
} from '../../../../components/projekte/postRules';
import { useProjekteTone } from '../../../../components/projekte/projekteTone';
import { SheetHeader } from '../../../../components/projekte/SheetHeader';
import { useGroupFeed } from '../../../../hooks/useGroupContent';
import { useGroupDetails, useGroupMembers } from '../../../../hooks/useGroups';
import { useMentionDraft } from '../../../../hooks/useMentionDraft';
import { useMentionOptions } from '../../../../hooks/useMentionOptions';
import { useTheme } from '../../../../hooks/useTheme';
import { pickDocuments, pickImageFromLibrary } from '../../../../services/documentPicker';
import { useNoticeStore } from '../../../../stores/noticeStore';
import { BODY_FONT, colors, spacing } from '../../../../theme';
import { serverMessage } from '../../../../utils/serverMessage';

/**
 * „Beitrag schreiben" als formSheet mit eigener Kopfleiste (`SheetHeader`): Text mit @-Erwähnungen, dazu Fotos,
 * Dateien und eigene Inhalte („Aus meinen Inhalten“). Mit `postId` ist es
 * „Beitrag bearbeiten" — dann nur der Text. Bei einem Fehler bleibt der Entwurf
 * stehen; geschlossen wird erst nach Erfolg.
 *
 * Wie im Web (`GroupComposer`): eigene Inhalte werden beim Posten geteilt, der
 * Text wird ihre Notiz — kein zweiter Beitrag mit demselben Text. Dateien daneben
 * werden ein Beitrag ohne Text.
 */
export default function ProjektBeitragScreen() {
  const { id, postId, body } = useLocalSearchParams<{
    id: string;
    postId?: string;
    body?: string;
  }>();
  const editing = !!postId;
  const router = useRouter();
  const theme = useTheme();
  const tone = useProjekteTone();
  const details = useGroupDetails(id);
  const members = useGroupMembers(id ?? null);
  const isSystem = details.data?.group.is_system === true;
  // Wie in „Inhalte hinzufügen": im Team dürfen Mitglieder geteilte Docs bearbeiten.
  const isTeam = !!details.data?.group && !isSystem;
  const feed = useGroupFeed(id);
  const alreadyShared = useMemo(() => sharedContentKeys(feed.data ?? []), [feed.data]);
  const queryClient = useQueryClient();
  const mentionOptions = useMentionOptions(
    id ?? null,
    isSystem,
    !!details.data?.membership.isAdmin
  );
  const mention = useMentionDraft(mentionOptions, GROUP_POST_MAX, body ?? '');
  const [files, setFiles] = useState<DraftFile[]>([]);
  // Mit der Art, damit die gewählte Zeile ihr Symbol behält.
  const [picked, setPicked] = useState<
    ReadonlyMap<string, { item: AddableItem; kind: GroupFeedKind }>
  >(new Map());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const create = useCreateGroupPost(id ?? '');
  const update = useUpdateGroupPost(id ?? '');
  const nextId = useRef(0);
  const busy = sharing || create.isPending || update.isPending;
  const noteCapped = noteTooLong(mention.text, picked.size);

  const canPost =
    canSubmitPost(mention.text, files.length + picked.size, mention.tooLong, busy || !id) &&
    !noteCapped &&
    (!editing || mention.text.trim().length > 0);

  const togglePicked = (item: AddableItem, kind: GroupFeedKind) =>
    setPicked((prev) => {
      const next = new Map(prev);
      const key = addableKey(item);
      if (next.has(key)) next.delete(key);
      else next.set(key, { item, kind });
      return next;
    });
  const unpick = (key: string) =>
    setPicked((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });

  const addPicked = (incoming: Omit<DraftFile, 'id'>[]) => {
    if (incoming.length === 0) return;
    const r = addDraftFiles(files, incoming, () => `f${nextId.current++}`);
    setFiles(r.files);
    setLocalError(r.error);
  };

  const pickPhoto = async () => {
    const photo = await pickImageFromLibrary();
    if (photo)
      addPicked([
        { uri: photo.uri, name: photo.name, type: photo.mimeType, size: photo.size, isImage: true },
      ]);
  };

  const pickFiles = async () => {
    const picked = await pickDocuments(['*/*']);
    addPicked(
      picked.map((d) => ({
        uri: d.uri,
        name: d.name,
        type: d.mimeType,
        size: d.size,
        isImage: d.mimeType.startsWith('image/'),
      }))
    );
  };

  const fail = (error: unknown) => {
    useNoticeStore
      .getState()
      .show('error', serverMessage(error, 'Beitrag konnte nicht gespeichert werden.'));
  };
  const done = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const postFiles = (postBody: string) =>
    create.mutate(
      { body: postBody, files: files.map(toUploadFile), onProgress: setProgress },
      { onSuccess: done, onError: fail, onSettled: () => setProgress(null) }
    );

  const submit = async () => {
    if (!canPost || !id) return;
    setLocalError(null);
    if (editing && postId) {
      update.mutate({ postId, body: mention.serialize() }, { onSuccess: done, onError: fail });
      return;
    }
    if (picked.size === 0) {
      postFiles(mention.serialize());
      return;
    }
    setSharing(true);
    // addItemsToGroup wirft nie (Promise.allSettled), deshalb kein try.
    const result = await addItemsToGroup(
      id,
      [...picked.values()].map((p) => p.item),
      mention.text.trim() || null,
      {
        writeDocuments: isTeam,
      }
    );
    setSharing(false);
    void queryClient.invalidateQueries({ queryKey: groupContentKey(id) });
    if (result.failed > 0) {
      // Was geteilt ist, fällt aus dem Entwurf; der Rest bleibt mit dem Grund stehen.
      const failed = new Set(result.failures.map((f) => f.key));
      setPicked((prev) => new Map([...prev].filter(([key]) => failed.has(key))));
      setLocalError(result.firstError);
      return;
    }
    // Der Text steht schon als Notiz an den Inhalten; die Dateien kommen ohne ihn.
    if (files.length > 0) postFiles('');
    else done();
  };

  const hint = visibilityHint(isSystem ? null : (members.data?.length ?? null));
  const images = files.filter((f) => f.isImage);
  const others = files.filter((f) => !f.isImage);
  const removeFile = (fileId: string) => setFiles((prev) => prev.filter((f) => f.id !== fileId));

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SheetHeader
        title={editing ? 'Beitrag bearbeiten' : 'Beitrag'}
        onCancel={() => router.back()}
        actionLabel={editing ? 'Speichern' : 'Posten'}
        actionAccessibilityLabel={editing ? 'Änderung speichern' : 'Beitrag posten'}
        onAction={() => void submit()}
        canAct={canPost}
        busy={busy}
      />
      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.flex, { backgroundColor: theme.background }]}
      >
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {editing ? null : (
            <Text style={[styles.hint, { color: theme.textSecondary }]}>{hint}</Text>
          )}
          <TextInput
            {...mention.inputProps}
            placeholder={isSystem ? 'Schreib einen Beitrag …' : 'Schreib etwas an das Projekt …'}
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Beitrag"
            editable={!busy}
            multiline
            autoFocus
            textAlignVertical="top"
            style={[styles.body, { color: theme.text, backgroundColor: theme.buttonBackground }]}
          />
          <MentionSuggestions
            suggestions={mention.suggestions}
            memberCount={mentionOptions.memberCount}
            onChoose={mention.choose}
          />

          {images.length > 0 ? (
            <View style={styles.thumbs}>
              {images.map((f) => (
                <View key={f.id} style={[styles.thumb, { backgroundColor: theme.surface }]}>
                  <Image
                    source={{ uri: f.uri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    accessibilityIgnoresInvertColors
                  />
                  <RemoveButton name={f.name} onPress={() => removeFile(f.id)} disabled={busy} />
                </View>
              ))}
            </View>
          ) : null}

          {others.map((f) => (
            <View key={f.id} style={[styles.fileRow, { borderColor: theme.border }]}>
              <View style={[styles.badge, { backgroundColor: tone.soft }]}>
                <Text style={[styles.badgeText, { color: tone.accent }]}>
                  {fileExtensionLabel(f.name)}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}>
                  {f.name}
                </Text>
                <Text style={[styles.fileSize, { color: theme.textSecondary }]}>
                  {formatFileSize(f.size)}
                </Text>
              </View>
              <Pressable
                onPress={() => removeFile(f.id)}
                disabled={busy}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`${f.name} entfernen`}
              >
                <Ionicons name="close-circle" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
          ))}

          {pickerOpen ? (
            <View style={styles.picker}>
              <View style={styles.pickerHead}>
                <Text
                  style={[styles.pickerTitle, { color: theme.text }]}
                  accessibilityRole="header"
                >
                  Aus meinen Inhalten
                </Text>
                <Pressable
                  onPress={() => setPickerOpen(false)}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={styles.toolButton}
                >
                  <Text style={[styles.toolText, { color: tone.accent }]}>Fertig</Text>
                </Pressable>
              </View>
              <AddableContentList
                selected={new Set(picked.keys())}
                onToggle={togglePicked}
                alreadyShared={alreadyShared}
              />
            </View>
          ) : (
            [...picked.entries()].map(([key, { item, kind }]) => (
              <View key={key} style={[styles.fileRow, { borderColor: theme.border }]}>
                <View style={[styles.badge, { backgroundColor: tone.soft }]}>
                  <Ionicons name={FEED_KIND_ICONS[kind]} size={20} color={tone.accent} />
                </View>
                <Text
                  style={[styles.fileName, styles.flex, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {item.title || 'Ohne Titel'}
                </Text>
                <Pressable
                  onPress={() => unpick(key)}
                  disabled={busy}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title || 'Inhalt'} entfernen`}
                >
                  <Ionicons name="close-circle" size={22} color={theme.textSecondary} />
                </Pressable>
              </View>
            ))
          )}
          {picked.size > 0 ? (
            <Text
              style={[
                styles.hint,
                { color: noteCapped ? colors.semantic.error : theme.textSecondary },
              ]}
            >
              {noteCapped
                ? `Mit angehängten Inhalten wird der Text ihre Notiz — höchstens ${GROUP_SHARE_NOTE_MAX} Zeichen.`
                : 'Der Text wird die Notiz an den angehängten Inhalten.'}
            </Text>
          ) : null}

          {localError ? <Text style={styles.error}>{localError}</Text> : null}
          {progress !== null ? (
            <View accessibilityRole="progressbar" accessibilityLabel="Hochladen">
              <View style={[styles.track, { backgroundColor: theme.surface }]}>
                <View
                  style={[
                    styles.fill,
                    { backgroundColor: tone.accent, width: `${Math.round(progress * 100)}%` },
                  ]}
                />
              </View>
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                Wird hochgeladen … {Math.round(progress * 100)} %
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {editing ? null : (
          <View style={[styles.toolbar, { borderTopColor: theme.border }]}>
            <Pressable
              onPress={() => void pickPhoto()}
              disabled={busy || files.length >= GROUP_POST_FILE_LIMIT}
              accessibilityRole="button"
              accessibilityLabel="Foto anhängen"
              style={styles.toolButton}
            >
              <Ionicons name="image-outline" size={22} color={tone.accent} />
              <Text style={[styles.toolText, { color: tone.accent }]}>Foto</Text>
            </Pressable>
            <Pressable
              onPress={() => void pickFiles()}
              disabled={busy || files.length >= GROUP_POST_FILE_LIMIT}
              accessibilityRole="button"
              accessibilityLabel="Datei anhängen"
              style={styles.toolButton}
            >
              <Ionicons name="attach" size={22} color={tone.accent} />
              <Text style={[styles.toolText, { color: tone.accent }]}>Datei</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setPickerOpen((v) => !v);
              }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Aus meinen Inhalten anhängen"
              accessibilityState={{ expanded: pickerOpen }}
              style={styles.toolButton}
            >
              <Ionicons name="albums-outline" size={22} color={tone.accent} />
              <Text style={[styles.toolText, { color: tone.accent }]}>Inhalte</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

function RemoveButton({
  name,
  onPress,
  disabled,
}: {
  name: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${name} entfernen`}
      style={styles.remove}
    >
      <Ionicons name="close-circle" size={24} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  form: { padding: spacing.medium, gap: spacing.small },
  strong: { fontWeight: '600' },
  hint: { fontFamily: BODY_FONT, fontSize: 13 },
  body: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    minHeight: 140,
    borderRadius: 12,
    padding: 12,
  },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 96, height: 96, borderRadius: 12, overflow: 'hidden' },
  remove: { position: 'absolute', top: 4, right: 4, backgroundColor: '#0006', borderRadius: 12 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 14,
    borderWidth: 1,
    borderRadius: 14,
  },
  badge: { width: 36, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: BODY_FONT, fontSize: 10, fontWeight: '700' },
  fileName: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700' },
  fileSize: { fontFamily: BODY_FONT, fontSize: 12 },
  error: { fontFamily: BODY_FONT, fontSize: 13, color: colors.semantic.error },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  fill: { height: 6 },
  toolbar: {
    flexDirection: 'row',
    gap: spacing.medium,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.xsmall,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  toolText: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '600' },
  picker: { gap: spacing.small, paddingTop: spacing.xsmall },
  pickerHead: { flexDirection: 'row', alignItems: 'center' },
  pickerTitle: { flex: 1, fontFamily: BODY_FONT, fontSize: 17, fontWeight: '700' },
});
