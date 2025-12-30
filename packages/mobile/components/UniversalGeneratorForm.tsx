import { useState } from 'react';
import { View, StyleSheet, ScrollView, useColorScheme } from 'react-native';
import { TextInput, Button } from './common';
import { spacing, lightTheme, darkTheme } from '../theme';

const TEXT_FORM_OPTIONS = [
  'Pressemitteilung',
  'Brief',
  'Social Media Post',
  'E-Mail',
  'Rede',
  'Flyer-Text',
  'Newsletter',
  'Sonstiges',
];

interface UniversalGeneratorFormProps {
  onSubmit: (data: { textForm: string; sprache: string; inhalt: string }) => void;
  isLoading: boolean;
}

export function UniversalGeneratorForm({ onSubmit, isLoading }: UniversalGeneratorFormProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [textForm, setTextForm] = useState('Pressemitteilung');
  const [sprache, setSprache] = useState('');
  const [inhalt, setInhalt] = useState('');

  const handleSubmit = () => {
    if (!inhalt.trim()) return;

    onSubmit({
      textForm,
      sprache: sprache || 'Sachlich und klar',
      inhalt: inhalt.trim(),
    });
  };

  const isValid = inhalt.trim().length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <TextInput
        label="Textart"
        value={textForm}
        onChangeText={setTextForm}
        placeholder="z.B. Pressemitteilung, Brief, Social Media..."
      />

      <TextInput
        label="Stil / Tonalität (optional)"
        value={sprache}
        onChangeText={setSprache}
        placeholder="z.B. formal, locker, motivierend..."
      />

      <TextInput
        label="Inhalt & Kontext"
        value={inhalt}
        onChangeText={setInhalt}
        placeholder="Beschreibe, worum es gehen soll..."
        multiline
        numberOfLines={6}
      />

      <View style={styles.buttonContainer}>
        <Button
          onPress={handleSubmit}
          disabled={!isValid}
          loading={isLoading}
        >
          Text grünerieren
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.medium,
  },
  buttonContainer: {
    marginTop: spacing.medium,
  },
});
