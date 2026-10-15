import { MAX_TEXT_FORM_EXAMPLES, MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS } from '@gruenerator/contracts';
import { useAnalyzeRecipe } from '@gruenerator/shared/grueneratoren';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../../hooks/useTheme';
import { useRecipeEditorStore } from '../../../stores/recipeEditorStore';
import { spacing, typography } from '../../../theme';
import { Button } from '../../common';

import { ErrorText, FieldInput, FormSection } from './FormParts';
import { examplesStatus } from './recipeEditorRules';

function confirmOverwrite(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Vorhandene Anleitung ersetzen?',
      'Die Analyse schreibt die Anleitung komplett neu. Was jetzt darin steht — auch selbst Geschriebenes — geht dabei verloren.',
      [
        { text: 'Behalten', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Neu analysieren', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

/**
 * „Aus Beispielen lernen": alle Beispieltexte in ein Feld, automatisch getrennt;
 * die Analyse schreibt daraus die Anleitung des Entwurfs im Editor.
 */
export function RecipeExamplesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const form = useRecipeEditorStore((s) => s.form);
  const update = useRecipeEditorStore((s) => s.update);
  const analyzeMut = useAnalyzeRecipe();
  const [error, setError] = useState<string | null>(null);

  const status = useMemo(() => examplesStatus(form.rawExamples), [form.rawExamples]);
  const labelMissing = form.title.trim().length === 0;

  const handleAnalyze = async () => {
    setError(null);
    if (status.examples.length === 0) {
      setError('Bitte mindestens ein Beispiel einfügen.');
      return;
    }
    if (status.blockReason) {
      setError(status.blockReason);
      return;
    }
    if (labelMissing) {
      setError('Bitte gib dem Rezept zuerst einen Namen.');
      return;
    }
    if (form.styleBlock.trim().length > 0 && !(await confirmOverwrite())) return;
    analyzeMut.mutate(
      {
        ...(form.textType ? { textType: form.textType } : {}),
        title: form.title.trim(),
        examples: status.examples.map((content) => ({ content })),
      },
      {
        onSuccess: (styleBlock) => {
          update({ styleBlock });
          router.back();
        },
        onError: (err) => setError(err.message || 'Analyse fehlgeschlagen.'),
      }
    );
  };

  const disabled = status.examples.length === 0 || !!status.blockReason || labelMissing;

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <Stack.Screen options={{ title: 'Aus Beispielen lernen' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text style={[styles.intro, { color: theme.textSecondary }]}>
          Füge bis zu {MAX_TEXT_FORM_EXAMPLES} Beispieltexte hintereinander ein. Getrennt wird
          automatisch — an einer Zeile aus „---“, an Überschriften wie „Beispiel 2“, an einer
          Nummerierung oder an doppelten Leerzeilen.
        </Text>
        <FormSection
          title="Beispiele"
          footer={status.summary}
          error={
            status.blockReason ? (
              <ErrorText>
                {status.summary} — {status.blockReason}
              </ErrorText>
            ) : null
          }
        >
          <FieldInput
            value={form.rawExamples}
            onChangeText={(rawExamples) => {
              setError(null);
              update({ rawExamples });
            }}
            maxLength={MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS}
            placeholder={'Beispiel 1 …\n\n---\n\nBeispiel 2 …'}
            accessibilityLabel="Beispieltexte"
            accessibilityHint={status.summary}
            editable={!analyzeMut.isPending}
            multiline
            style={styles.input}
          />
        </FormSection>
      </ScrollView>
      <View
        style={[
          styles.footer,
          { borderTopColor: theme.border, paddingBottom: insets.bottom + spacing.small },
        ]}
      >
        {error ? (
          <View accessibilityRole="alert" accessibilityLiveRegion="polite">
            <ErrorText>{error}</ErrorText>
          </View>
        ) : labelMissing ? (
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Gib dem Rezept im Editor einen Namen — er beschriftet den erkannten Stil.
          </Text>
        ) : null}
        <Button
          onPress={() => void handleAnalyze()}
          disabled={disabled}
          loading={analyzeMut.isPending}
        >
          Stil analysieren
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    padding: spacing.medium,
    gap: spacing.medium,
  },
  intro: {
    ...typography.bodySmall,
    paddingHorizontal: spacing.xsmall,
  },
  input: { minHeight: 320 },
  footer: {
    gap: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  hint: {
    ...typography.caption,
    paddingHorizontal: spacing.xsmall,
  },
});
