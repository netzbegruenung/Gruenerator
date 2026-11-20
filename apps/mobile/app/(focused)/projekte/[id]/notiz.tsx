import { GROUP_SHARE_NOTE_MAX } from '@gruenerator/contracts';
import { useUpdateGroupShare } from '@gruenerator/shared/groups';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { SheetHeader } from '../../../../components/projekte/SheetHeader';
import { useTheme } from '../../../../hooks/useTheme';
import { useNoticeStore } from '../../../../stores/noticeStore';
import { spacing, BODY_FONT } from '../../../../theme';

/**
 * „Notiz bearbeiten" als formSheet mit eigener Kopfleiste (`SheetHeader`). Eine leere Notiz löscht sie (`note: ''`).
 * Bei einem Fehler bleibt der Entwurf stehen; geschlossen wird erst nach Erfolg.
 */
export default function ProjektNotizScreen() {
  const { id, shareId, note } = useLocalSearchParams<{
    id: string;
    shareId: string;
    note?: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const update = useUpdateGroupShare(id ?? '');
  const [text, setText] = useState(note ?? '');
  const busy = update.isPending;
  const canSave = !busy && !!id && !!shareId && text.trim() !== (note ?? '').trim();

  const save = () => {
    if (!canSave) return;
    update.mutate(
      { shareId, note: text.trim() },
      {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
        onError: (e) => useNoticeStore.getState().show('error', e.message),
      }
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SheetHeader
        title="Notiz bearbeiten"
        onCancel={() => router.back()}
        actionLabel="Speichern"
        actionAccessibilityLabel="Notiz speichern"
        onAction={save}
        canAct={canSave}
        busy={busy}
      />
      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.flex, { backgroundColor: theme.background }]}
      >
        <View style={styles.form}>
          <TextInput
            value={text}
            onChangeText={setText}
            maxLength={GROUP_SHARE_NOTE_MAX}
            placeholder="Notiz zur Freigabe"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Notiz"
            editable={!busy}
            multiline
            autoFocus
            textAlignVertical="top"
            style={[styles.input, { color: theme.text, backgroundColor: theme.buttonBackground }]}
          />
          <Text style={[styles.counter, { color: theme.textSecondary }]}>
            {text.length} / {GROUP_SHARE_NOTE_MAX}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { flex: 1, padding: spacing.medium, gap: spacing.xsmall },
  input: {
    flex: 1,
    fontFamily: BODY_FONT,
    fontSize: 16,
    borderRadius: 12,
    padding: 12,
  },
  counter: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
