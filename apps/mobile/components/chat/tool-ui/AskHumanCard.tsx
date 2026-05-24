import { getString, getArray } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius } from '../../../theme';

import type { Theme } from '../../../theme/colors';

// Native counterpart of web's AskHumanToolUI (ask_human): an interactive card
// that asks a clarifying question and submits the answer back into the run via
// `addResult` — option buttons plus a free-text field. Once answered it
// collapses to a compact confirmation badge.
export function AskHumanCard({
  args,
  result,
  addResult,
  theme,
}: {
  args: Record<string, unknown>;
  result?: unknown;
  addResult: (result: string) => void;
  theme: Theme;
}) {
  const [customInput, setCustomInput] = useState('');

  const question = getString(args, 'question') ?? 'Wie kann ich dir helfen?';
  const options = (getArray(args, 'options') ?? []).filter(
    (o): o is string => typeof o === 'string'
  );

  if (result !== undefined) {
    return (
      <View
        style={[styles.answered, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <Ionicons name="checkmark-circle" size={14} color={colors.primary[500]} />
        <Text style={[styles.answeredLabel, { color: theme.text }]}>Klärung</Text>
        <Text style={[styles.answeredValue, { color: theme.textSecondary }]} numberOfLines={1}>
          {String(result)}
        </Text>
      </View>
    );
  }

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) addResult(trimmed);
  };

  return (
    <View
      style={[styles.card, { backgroundColor: theme.surface, borderColor: colors.primary[500] }]}
    >
      <View style={styles.questionRow}>
        <Ionicons name="help-circle-outline" size={16} color={colors.primary[600]} />
        <Text style={[styles.question, { color: theme.text }]}>{question}</Text>
      </View>

      {options.length > 0 && (
        <View style={styles.options}>
          {options.map((option, idx) => (
            <Pressable
              key={idx}
              onPress={() => addResult(option)}
              style={({ pressed }) => [
                styles.option,
                {
                  borderColor: colors.primary[300],
                  backgroundColor: pressed ? colors.primary[50] : theme.card,
                },
              ]}
            >
              <Text style={[styles.optionText, { color: theme.text }]}>{option}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          value={customInput}
          onChangeText={setCustomInput}
          onSubmitEditing={() => submit(customInput)}
          placeholder="Oder eigene Antwort eingeben…"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="send"
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
        />
        <Pressable
          onPress={() => submit(customInput)}
          disabled={!customInput.trim()}
          style={[styles.sendButton, { opacity: customInput.trim() ? 1 : 0.4 }]}
        >
          <Ionicons name="send" size={16} color={colors.primary[600]} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: spacing.xsmall,
    padding: spacing.small,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    gap: spacing.small,
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xxsmall,
  },
  question: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
  },
  option: {
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  optionText: {
    fontSize: 13,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    fontSize: 14,
  },
  sendButton: {
    padding: spacing.xsmall,
  },
  answered: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    alignSelf: 'flex-start',
    marginBottom: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  answeredLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  answeredValue: {
    flexShrink: 1,
    fontSize: 12,
  },
});
