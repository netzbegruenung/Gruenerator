import { GROUP_SHARE_NOTE_MAX } from '@gruenerator/contracts';
import { useUpdateGroupShare } from '@gruenerator/shared/groups';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { useTheme } from '../../../../hooks/useTheme';
import { useNoticeStore } from '../../../../stores/noticeStore';
import { spacing, BODY_FONT } from '../../../../theme';

/**
 * „Notiz bearbeiten" als formSheet. Eine leere Notiz löscht sie (`note: ''`).
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
      <Stack.Screen
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.45, 1],
          sheetGrabberVisible: true,
          headerShown: true,
          title: 'Notiz bearbeiten',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Abbrechen"
              hitSlop={8}
            >
              <Text style={[styles.headerText, { color: theme.text }]}>Abbrechen</Text>
            </Pressable>
          ),
          headerRight: () =>
            busy ? (
              <ActivityIndicator />
            ) : (
              <Pressable
                onPress={save}
                disabled={!canSave}
                accessibilityRole="button"
                accessibilityLabel="Notiz speichern"
                accessibilityState={{ disabled: !canSave }}
                hitSlop={8}
              >
                <Text
                  style={[
                    styles.headerText,
                    styles.save,
                    { color: theme.text, opacity: canSave ? 1 : 0.4 },
                  ]}
                >
                  Speichern
                </Text>
              </Pressable>
            ),
        }}
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
  headerText: { fontFamily: BODY_FONT, fontSize: 16 },
  save: { fontWeight: '600' },
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
