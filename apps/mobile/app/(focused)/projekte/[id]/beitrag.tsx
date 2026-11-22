import { GROUP_POST_FILE_LIMIT, GROUP_POST_MAX } from '@gruenerator/contracts';
import {
  fileExtensionLabel,
  formatFileSize,
  useCreateGroupPost,
  useUpdateGroupPost,
} from '@gruenerator/shared/groups';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { MentionSuggestions } from '../../../../components/projekte/MentionSuggestions';
import {
  addDraftFiles,
  canSubmitPost,
  toUploadFile,
  visibilityHint,
  type DraftFile,
} from '../../../../components/projekte/postRules';
import { useProjekteTone } from '../../../../components/projekte/projekteTone';
import { SheetHeader } from '../../../../components/projekte/SheetHeader';
import { useGroupDetails, useGroupMembers } from '../../../../hooks/useGroups';
import { useMentionDraft } from '../../../../hooks/useMentionDraft';
import { useMentionOptions } from '../../../../hooks/useMentionOptions';
import { useTheme } from '../../../../hooks/useTheme';
import { pickDocuments, pickImageFromLibrary } from '../../../../services/documentPicker';
import { useNoticeStore } from '../../../../stores/noticeStore';
import { BODY_FONT, colors, spacing } from '../../../../theme';
import { serverMessage } from '../../../../utils/serverMessage';

/**
 * „Beitrag schreiben" als formSheet mit eigener Kopfleiste (`SheetHeader`): Text mit @-Erwähnungen, dazu Fotos und
 * Dateien. Mit `postId` ist es „Beitrag bearbeiten" — dann nur der Text. Bei
 * einem Fehler bleibt der Entwurf stehen; geschlossen wird erst nach Erfolg.
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
  const mentionOptions = useMentionOptions(
    id ?? null,
    isSystem,
    !!details.data?.membership.isAdmin
  );
  const mention = useMentionDraft(mentionOptions, GROUP_POST_MAX, body ?? '');
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const create = useCreateGroupPost(id ?? '');
  const update = useUpdateGroupPost(id ?? '');
  const nextId = useRef(0);
  const busy = create.isPending || update.isPending;

  const canPost =
    canSubmitPost(mention.text, files.length, mention.tooLong, busy || !id) &&
    (!editing || mention.text.trim().length > 0);

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

  const submit = () => {
    if (!canPost) return;
    setLocalError(null);
    if (editing && postId) {
      update.mutate({ postId, body: mention.serialize() }, { onSuccess: done, onError: fail });
      return;
    }
    create.mutate(
      { body: mention.serialize(), files: files.map(toUploadFile), onProgress: setProgress },
      { onSuccess: done, onError: fail, onSettled: () => setProgress(null) }
    );
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
        onAction={submit}
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
});
