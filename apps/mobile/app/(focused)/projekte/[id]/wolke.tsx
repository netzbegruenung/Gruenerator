import { useAttachGroupWolkeFolder } from '@gruenerator/shared/groups';
import { checkCloudShareLink } from '@gruenerator/shared/utils';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { SheetHeader } from '../../../../components/projekte/SheetHeader';
import { useTheme } from '../../../../hooks/useTheme';
import { useNoticeStore } from '../../../../stores/noticeStore';
import { BODY_FONT, colors, spacing } from '../../../../theme';

const NAME_MAX = 120;

/**
 * „Wolke-Ordner verbinden" (experimentell, #5945) als formSheet: Freigabelink,
 * optional ein Name, Unterordner ja/nein. Die ersten Dateien liest der Server
 * sofort ein, den Rest der stündliche Abgleich. Bei einem Fehler bleibt die
 * Eingabe stehen; geschlossen wird erst nach Erfolg.
 */
export default function ProjektWolkeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const attach = useAttachGroupWolkeFolder(id ?? '');
  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [includeSubfolders, setIncludeSubfolders] = useState(true);

  const check = checkCloudShareLink(link.trim());
  const problem =
    check.ok || check.problem === 'empty'
      ? null
      : 'Das sieht nicht nach einem Nextcloud-Freigabelink aus (…/s/…).';
  const canSave = !!id && link.trim().length > 0 && !problem && !attach.isPending;

  const save = () => {
    if (!canSave) return;
    attach.mutate(
      { url: link.trim(), includeSubfolders, ...(name.trim() ? { name: name.trim() } : {}) },
      {
        onSuccess: (result) => {
          if (result.source.lastError) {
            useNoticeStore.getState().show('error', result.source.lastError);
          } else {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          router.back();
        },
        onError: (error: Error) => useNoticeStore.getState().show('error', error.message),
      }
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SheetHeader
        title="Wolke-Ordner verbinden"
        onCancel={() => router.back()}
        actionLabel="Verbinden"
        actionAccessibilityLabel="Wolke-Ordner verbinden"
        onAction={save}
        canAct={canSave}
        busy={attach.isPending}
      />
      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.flex, { backgroundColor: theme.background }]}
      >
        <View style={styles.form}>
          <Text style={[styles.intro, { color: theme.textSecondary }]}>
            Die Dateien des Ordners werden als Projektwissen eingelesen und stündlich abgeglichen:
            Neue kommen dazu, gelöschte verschwinden aus dem Projekt. Gelesen wird mit deinem
            Freigabelink.
          </Text>
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="https://wolke.netzbegruenung.de/s/…"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Freigabelink des Ordners"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!attach.isPending}
            style={[styles.input, { color: theme.text, backgroundColor: theme.buttonBackground }]}
          />
          <Text
            style={[styles.hint, { color: problem ? colors.semantic.error : theme.textSecondary }]}
          >
            {problem ??
              'In der Wolke: Ordner → Teilen → „Link kopieren". Höchstens 200 Dateien je Ordner.'}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={NAME_MAX}
            placeholder="Name im Projekt (optional)"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Name im Projekt (optional)"
            editable={!attach.isPending}
            style={[styles.input, { color: theme.text, backgroundColor: theme.buttonBackground }]}
          />
          <View style={styles.switchRow}>
            <Text style={[styles.label, { color: theme.text }]}>Unterordner einbeziehen</Text>
            <Switch
              value={includeSubfolders}
              onValueChange={setIncludeSubfolders}
              disabled={attach.isPending}
              accessibilityLabel="Unterordner einbeziehen"
              trackColor={{ true: colors.primary[600], false: colors.grey[300] }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { flex: 1, padding: spacing.medium, gap: spacing.small },
  intro: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20 },
  input: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  hint: { fontFamily: BODY_FONT, fontSize: 12 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  label: { fontFamily: BODY_FONT, fontSize: 16 },
});
