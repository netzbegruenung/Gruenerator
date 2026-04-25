import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  useColorScheme,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';

import { useCreateGroup } from '../../hooks/useGroups';
import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../theme';

export default function CreateGroupScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const createGroup = useCreateGroup();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name erforderlich', 'Bitte gib der Gruppe einen Namen.');
      return;
    }
    const payload: { name: string; description?: string } = { name: trimmedName };
    const trimmedDescription = description.trim();
    if (trimmedDescription) {
      payload.description = trimmedDescription;
    }
    createGroup.mutate(payload, {
      onSuccess: (group) => {
        router.back();
        router.push(`/(focused)/gruppen/${group.id}`);
      },
      onError: (err) => {
        Alert.alert(
          'Fehler',
          err instanceof Error ? err.message : 'Gruppe konnte nicht erstellt werden.'
        );
      },
    });
  };

  const canSubmit = name.trim().length > 0 && !createGroup.isPending;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: 'Neue Gruppe',
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
                Erstellen
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Z. B. Kreisverband Mitte"
            placeholderTextColor={theme.textSecondary}
            autoFocus
            maxLength={80}
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.surface, borderColor: theme.cardBorder },
            ]}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            Beschreibung (optional)
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Wofür steht diese Gruppe?"
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={4}
            maxLength={400}
            style={[
              styles.input,
              styles.multilineInput,
              { color: theme.text, backgroundColor: theme.surface, borderColor: theme.cardBorder },
            ]}
          />
        </View>

        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Als Erstellende*r bist du automatisch Admin und kannst andere einladen.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.medium, gap: spacing.large },
  field: { gap: spacing.xsmall },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small + 2,
    ...typography.body,
  },
  multilineInput: { minHeight: 100, textAlignVertical: 'top' },
  hint: { ...typography.bodySmall },
});
