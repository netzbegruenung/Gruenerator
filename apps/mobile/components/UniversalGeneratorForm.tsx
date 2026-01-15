import { useState } from 'react';
import { View, StyleSheet, ScrollView, useColorScheme } from 'react-native';
import { TextInput, Button } from './common';
import { spacing, lightTheme, darkTheme } from '../theme';

interface UniversalGeneratorFormProps {
  onSubmit: (data: { textForm: string; inhalt: string }) => void;
  isLoading: boolean;
}

export function UniversalGeneratorForm({ onSubmit, isLoading }: UniversalGeneratorFormProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [textForm, setTextForm] = useState('Pressemitteilung');
  const [inhalt, setInhalt] = useState('');

  const handleSubmit = () => {
    if (!inhalt.trim()) return;

    onSubmit({
      textForm,
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
