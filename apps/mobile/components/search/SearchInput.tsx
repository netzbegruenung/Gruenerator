import { View, Text, Pressable, StyleSheet, useColorScheme, Keyboard, TextInput as RNTextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Button } from '../common/Button';
import { colors, spacing, borderRadius, typography, lightTheme, darkTheme } from '../../theme';
import type { SearchMode } from '@gruenerator/shared/search';

interface ExampleQuestion {
  icon: string;
  text: string;
  title?: string;
}

const EXAMPLE_QUESTIONS: ExampleQuestion[] = [
  { icon: '🌍', text: 'Was macht die Grüne Fraktion für den Klimaschutz?', title: 'Klimaschutz' },
  { icon: '🏘️', text: 'Grüne Position zum Mietendeckel', title: 'Mietendeckel' },
  { icon: '🚲', text: 'Fahrradinfrastruktur in Deutschland', title: 'Fahrrad' },
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
      <Text style={[styles.header, { color: theme.text }]}>
        Was möchtest du herausfinden?
      </Text>
      <View style={styles.inputWrapper}>
        <RNTextInput
          value={query}
          onChangeText={setQuery}
          placeholder={
            mode === 'deep'
              ? 'Thema für Tiefenrecherche...'
              : 'Suche...'
          }
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCapitalize="sentences"
          autoCorrect={false}
          style={[
            styles.input,
            {
              backgroundColor: theme.surface,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
          placeholderTextColor={theme.textSecondary}
        />
        <Pressable
          onPress={toggleMode}
          style={({ pressed }) => [
            styles.modeToggle,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons
            name={mode === 'deep' ? 'bulb' : 'bulb-outline'}
            size={22}
            color={mode === 'deep' ? colors.primary[500] : theme.textSecondary}
          />
        </Pressable>
      </View>

      <Button onPress={handleSearch} loading={loading} disabled={query.trim().length < 2}>
        Suchen
      </Button>

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
    position: 'relative',
  },
  input: {
    ...typography.body,
    paddingLeft: spacing.large,
    paddingRight: spacing.xxlarge + spacing.small,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.pill,
    borderWidth: 0.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  modeToggle: {
    position: 'absolute',
    right: spacing.small,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: spacing.xsmall,
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
    gap: spacing.xxsmall,
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
  },
  exampleIcon: {
    fontSize: 14,
  },
  exampleText: {
    fontSize: 13,
  },
});

export default SearchInput;
