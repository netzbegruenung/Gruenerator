import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGroupDetails, useUpdateGroupInfo } from '../../../../hooks/useGroups';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  lightTheme,
  darkTheme,
} from '../../../../theme';

export default function EditGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const detailsQuery = useGroupDetails(id);
  const update = useUpdateGroupInfo(id ?? '');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (detailsQuery.data?.group && name === '' && description === '') {
      setName(detailsQuery.data.group.name ?? '');
      setDescription(detailsQuery.data.group.description ?? '');
    }
    // Only seed once after the first load. The empty-string guard prevents
    // clobbering user edits if a background refetch arrives mid-typing.
  }, [detailsQuery.data, name, description]);

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name erforderlich', 'Der Gruppenname darf nicht leer sein.');
      return;
    }
    update.mutate(
      { name: trimmedName, description: description.trim() || null },
      {
        onSuccess: () => router.back(),
        onError: (err) =>
          Alert.alert(
            'Fehler',
            err instanceof Error ? err.message : 'Aktualisierung fehlgeschlagen.'
          ),
      }
    );
  };

  if (detailsQuery.isPending) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
        edges={['top']}
      >
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      </SafeAreaView>
    );
  }

  const canSubmit = name.trim().length > 0 && !update.isPending;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Gruppe bearbeiten</Text>
        <Pressable onPress={submit} disabled={!canSubmit} hitSlop={10}>
          <Text
            style={{
              color: canSubmit ? colors.primary[600] : theme.textSecondary,
              ...typography.bodyBold,
            }}
          >
            Speichern
          </Text>
        </Pressable>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={80}
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.surface,
                  borderColor: theme.cardBorder,
                },
              ]}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Beschreibung</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              maxLength={400}
              style={[
                styles.input,
                styles.multilineInput,
                {
                  color: theme.text,
                  backgroundColor: theme.surface,
                  borderColor: theme.cardBorder,
                },
              ]}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 52,
    paddingHorizontal: spacing.medium,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { ...typography.bodyBold },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
});
