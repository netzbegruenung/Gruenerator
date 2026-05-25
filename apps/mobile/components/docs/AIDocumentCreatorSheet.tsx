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

// Mirrors packages/docs AIDocumentCreator's presets so mobile and web offer the
// same starting points. (Web's list is local to that component; kept in sync here.)
const EXAMPLE_PROMPTS = [
  { label: 'Pressemitteilung', text: 'Pressemitteilung zum Klimaschutz in unserer Kommune' },
  { label: 'Antrag', text: 'Antrag für den Kreisparteitag zum Thema nachhaltige Mobilität' },
  { label: 'Protokoll', text: 'Protokoll der letzten Vorstandssitzung' },
  { label: 'Einladung', text: 'Einladung zur nächsten Mitgliederversammlung' },
  { label: 'Redaktionsplan', text: 'Redaktionsplan für Social Media im nächsten Monat' },
] as const;

interface Props {
  visible: boolean;
  onClose: () => void;
  onGenerate: (description: string) => void;
  isLoading: boolean;
}

export function AIDocumentCreatorSheet({ visible, onClose, onGenerate, isLoading }: Props) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const [description, setDescription] = useState('');

  const canSubmit = description.trim().length >= 3 && !isLoading;

  const submit = () => {
    if (!canSubmit) return;
    onGenerate(description.trim());
    setDescription('');
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.title, { color: theme.text }]}>Mit KI erstellen</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Beschreibe, welches Dokument du erstellen möchtest.
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
      >
        {EXAMPLE_PROMPTS.map((p) => (
          <Pressable
            key={p.label}
            onPress={() => setDescription(p.text)}
            style={[styles.chip, { borderColor: theme.border, backgroundColor: theme.surface }]}
          >
            <Text style={[styles.chipText, { color: theme.text }]}>{p.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="z.B. Pressemitteilung zum Klimaschutz…"
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
            { backgroundColor: colors.primary[600], opacity: canSubmit ? 1 : 0.4 },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.sendText}>Erstellen</Text>
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
