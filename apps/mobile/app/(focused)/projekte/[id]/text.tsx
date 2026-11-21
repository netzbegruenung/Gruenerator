import { groupContentKey } from '@gruenerator/shared/groups';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { SheetHeader } from '../../../../components/projekte/SheetHeader';
import { useTheme } from '../../../../hooks/useTheme';
import { getGlobalApiClient } from '../../../../services/api';
import { useNoticeStore } from '../../../../stores/noticeStore';
import { spacing, BODY_FONT } from '../../../../theme';
import { serverMessage } from '../../../../utils/serverMessage';

/** Wie im Web: ein Text wird in einem Zug eingebettet, Längeres gehört in eine Datei. */
const TEXT_MAX = 100_000;
const TITLE_MAX = 200;

/**
 * „Text hinzufügen" als formSheet mit eigener Kopfleiste (`SheetHeader`): Titel und Text werden als Dokument angelegt
 * (`POST /documents/add-text`) und im selben Zug ins Projekt geteilt. Bei einem
 * Fehler bleibt der Entwurf stehen; geschlossen wird erst nach Erfolg.
 */
export default function ProjektTextScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const canSave = title.trim().length > 0 && text.trim().length > 0 && !busy && !!id;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await getGlobalApiClient().post('/documents/add-text', {
        title: title.trim(),
        content: text.trim(),
        groupId: id,
      });
      void queryClient.invalidateQueries({ queryKey: groupContentKey(id) });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      useNoticeStore
        .getState()
        .show('error', serverMessage(err, 'Text konnte nicht hinzugefügt werden.'));
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SheetHeader
        title="Text hinzufügen"
        onCancel={() => router.back()}
        actionLabel="Speichern"
        actionAccessibilityLabel="Text speichern"
        onAction={() => void save()}
        canAct={canSave}
        busy={busy}
      />
      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.flex, { backgroundColor: theme.background }]}
      >
        <View style={styles.form}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={TITLE_MAX}
            placeholder="Titel"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Titel"
            editable={!busy}
            returnKeyType="next"
            style={[styles.title, { color: theme.text, backgroundColor: theme.buttonBackground }]}
          />
          <TextInput
            value={text}
            onChangeText={setText}
            maxLength={TEXT_MAX}
            placeholder="Text einfügen oder schreiben"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Text"
            editable={!busy}
            multiline
            textAlignVertical="top"
            style={[styles.body, { color: theme.text, backgroundColor: theme.buttonBackground }]}
          />
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { flex: 1, padding: spacing.medium, gap: spacing.small },
  title: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  body: {
    flex: 1,
    fontFamily: BODY_FONT,
    fontSize: 16,
    borderRadius: 12,
    padding: 12,
  },
});
