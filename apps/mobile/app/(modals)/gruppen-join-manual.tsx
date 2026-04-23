import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';

import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../theme';

export default function JoinGroupManualScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const [value, setValue] = useState('');

  const extractToken = (input: string): string => {
    const trimmed = input.trim();
    // If the user pasted the full URL, grab the last path segment.
    const match =
      trimmed.match(/\/join-group\/([a-f0-9]+)/i) ?? trimmed.match(/gruppen-join\/([a-f0-9]+)/i);
    return match ? match[1] : trimmed;
  };

  const submit = () => {
    const token = extractToken(value);
    if (!token) return;
    router.back();
    router.push(`/gruppen-join/${token}`);
  };

  const canSubmit = value.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: 'Einladung einlösen',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Text style={{ color: colors.primary[600], ...typography.body }}>Abbrechen</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={submit} disabled={!canSubmit} hitSlop={10}>
              <Text
                style={{
                  color: canSubmit ? colors.primary[600] : theme.textSecondary,
                  ...typography.bodyBold,
                }}
              >
                Weiter
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Füge den Einladungslink oder den Code ein, den du erhalten hast.
        </Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="Link oder Code einfügen"
          placeholderTextColor={theme.textSecondary}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.surface, borderColor: theme.cardBorder },
          ]}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.medium, gap: spacing.medium },
  hint: { ...typography.body },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small + 2,
    ...typography.body,
  },
});
