import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
} from 'react-native';

import { lightTheme, darkTheme, colors, spacing, borderRadius } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';

// Quick edit actions that prefill the prompt for the current selection. German
// chips matching the in-editor AI menu's editing options.
const EDIT_PRESETS = [
  { label: 'Kürzen', text: 'Kürze den markierten Text.' },
  { label: 'Umformulieren', text: 'Formuliere den markierten Text um.' },
  { label: 'Ausführlicher', text: 'Schreibe den markierten Text ausführlicher.' },
  { label: 'Förmlicher', text: 'Formuliere den markierten Text förmlicher.' },
  { label: 'Korrigieren', text: 'Korrigiere Rechtschreibung und Grammatik im markierten Text.' },
] as const;

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
  isLoading?: boolean;
}

export function DocAiEditSheet({ visible, onClose, onSubmit, isLoading }: Props) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const [prompt, setPrompt] = useState('');

  const canSubmit = prompt.trim().length >= 3 && !isLoading;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(prompt.trim());
    setPrompt('');
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} keyboardAvoiding>
      <Text style={[styles.title, { color: theme.text }]}>Mit KI bearbeiten</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Beschreibe, wie der markierte Text bearbeitet werden soll.
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
      >
        {EDIT_PRESETS.map((p) => (
          <Pressable
            key={p.label}
            onPress={() => setPrompt(p.text)}
            style={[styles.chip, { borderColor: theme.border, backgroundColor: theme.surface }]}
          >
            <Text style={[styles.chipText, { color: theme.text }]}>{p.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="z.B. Förmlicher formulieren…"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          multiline
          editable={!isLoading}
          onSubmitEditing={submit}
        />
        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          style={[
            styles.send,
            { backgroundColor: colors.secondary[600], opacity: canSubmit ? 1 : 0.4 },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.sendText}>Bearbeiten</Text>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingBottom: spacing.xxsmall,
  },
  subtitle: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingBottom: spacing.small,
  },
  chips: {
    paddingHorizontal: 20,
    gap: spacing.xsmall,
    paddingBottom: spacing.small,
  },
  chip: {
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xsmall,
    paddingHorizontal: 20,
    paddingBottom: spacing.medium,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    fontSize: 15,
  },
  send: {
    height: 44,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
