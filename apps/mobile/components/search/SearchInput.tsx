import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useColorScheme,
  Keyboard,
  TextInput as RNTextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { colors, spacing, borderRadius, typography, lightTheme, darkTheme } from '../../theme';
import type { SearchMode } from '@gruenerator/shared/search';

interface ExampleQuestion {
  icon: string;
  text: string;
  title?: string;
}

const EXAMPLE_QUESTIONS: ExampleQuestion[] = [
  {
    icon: '🌍',
    text: 'Was macht die Grüne Fraktion für den Klimaschutz?',
    title: 'Grüner Klimaschutz',
  },
  { icon: '🏘️', text: 'Grüne Position zum Mietendeckel', title: 'Bezahlbares Wohnen' },
  { icon: '🚲', text: 'Fahrradinfrastruktur in Deutschland', title: 'Bessere Radwege' },
];

interface SearchInputProps {
  onSearch: (query: string, mode: SearchMode) => void;
  loading?: boolean;
  initialQuery?: string;
}

export function SearchInput({ onSearch, loading = false, initialQuery = '' }: SearchInputProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<SearchMode>('web');

  const handleSearch = () => {
    if (query.trim().length < 2) return;
    Keyboard.dismiss();
    onSearch(query.trim(), mode);
  };

  const handleExampleClick = (text: string) => {
    setQuery(text);
    Keyboard.dismiss();
    onSearch(text, mode);
  };

  const toggleMode = () => {
    setMode(mode === 'deep' ? 'web' : 'deep');
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.header, { color: theme.text }]}>Was möchtest du herausfinden?</Text>
      <View
        style={[styles.inputWrapper, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <RNTextInput
          value={query}
          onChangeText={setQuery}
          placeholder={mode === 'deep' ? 'Thema für Tiefenrecherche...' : 'Suche...'}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          autoCapitalize="sentences"
          autoCorrect={false}
          style={[styles.input, { color: theme.text }]}
          placeholderTextColor={theme.textSecondary}
        />
        <View style={styles.actionsRow}>
          <Pressable
            onPress={toggleMode}
            style={({ pressed }) => [
              styles.modeToggle,
              { backgroundColor: mode === 'deep' ? colors.primary[100] : 'transparent' },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons
              name={mode === 'deep' ? 'bulb' : 'bulb-outline'}
              size={20}
              color={mode === 'deep' ? colors.primary[600] : theme.textSecondary}
            />
            <Text
              style={[
                styles.modeText,
                { color: mode === 'deep' ? colors.primary[600] : theme.textSecondary },
              ]}
            >
              {mode === 'deep' ? 'Tiefenrecherche' : 'Web'}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSearch}
            disabled={loading || query.trim().length < 2}
            style={({ pressed }) => [
              styles.submitButton,
              { backgroundColor: colors.primary[600] },
              (loading || query.trim().length < 2) && { opacity: 0.5 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Ionicons name={loading ? 'hourglass' : 'search'} size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      {!query && (
        <View style={styles.exampleContainer}>
          <View style={styles.exampleList}>
            {EXAMPLE_QUESTIONS.map((example, index) => (
              <Pressable
                key={index}
                onPress={() => handleExampleClick(example.text)}
                style={({ pressed }) => [
                  styles.exampleButton,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.exampleIcon}>{example.icon}</Text>
                <Text style={[styles.exampleText, { color: theme.text }]} numberOfLines={1}>
                  {example.title || example.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.medium,
    alignItems: 'center',
  },
  header: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.small,
  },
  inputWrapper: {
    width: '100%',
    borderRadius: borderRadius.large,
    borderWidth: 0.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    overflow: 'hidden',
  },
  input: {
    ...typography.body,
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.medium,
    paddingBottom: spacing.small,
    minHeight: 80,
    maxHeight: 150,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.small,
    paddingBottom: spacing.small,
  },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.pill,
  },
  modeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  submitButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exampleContainer: {
    marginTop: spacing.small,
    width: '100%',
  },
  exampleList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
  },
  exampleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
  },
  exampleIcon: {
    fontSize: 18,
  },
  exampleText: {
    fontSize: 15,
    fontWeight: '500',
  },
});

export default SearchInput;
