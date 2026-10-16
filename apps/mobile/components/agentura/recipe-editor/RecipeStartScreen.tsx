import { MAX_DRAFT_BRIEF_CHARS } from '@gruenerator/contracts';
import {
  draftToRecipeForm,
  EMPTY_RECIPE_FORM,
  useDraftRecipe,
} from '@gruenerator/shared/grueneratoren';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOwnRecipes } from '../../../hooks/agents/useOwnRecipes';
import { useTheme } from '../../../hooks/useTheme';
import { NEW_RECIPE_TARGET, useRecipeEditorStore } from '../../../stores/recipeEditorStore';
import { BODY_FONT, spacing, typography } from '../../../theme';
import { Button, ListRow, SkeletonRows } from '../../common';
import { AgentGlyph } from '../AgentGlyph';

import { CharCount, ErrorText, FieldInput, FormSection } from './FormParts';
import { NUM } from './recipeEditorRules';

/** Dieselben Beispiele wie auf der Web-Startseite. */
const EXAMPLE_PROMPTS = [
  {
    label: 'Einladung',
    text: 'Ein Rezept für Einladungen zur Mitgliederversammlung: förmlicher Ton, mit Tagesordnung und Anmeldehinweis.',
  },
  {
    label: 'Bürger*innen-Mails',
    text: 'Ein Rezept für Antworten auf Bürger*innen-Mails: persönlich, verständlich, mit einer kurzen Zusammenfassung am Anfang.',
  },
  {
    label: 'LinkedIn-Post',
    text: 'Ein Rezept für LinkedIn-Posts des Kreisverbands: professioneller Ton, kurze Absätze, endet mit einer Frage an die Leser*innen.',
  },
] as const;

const EDITOR = '/(focused)/grueneratoren/rezept-editor';

/**
 * Einstieg „Neues Rezept": eine kurze Beschreibung, daraus ein KI-Entwurf, der
 * im Editor landet und erst dort gespeichert wird. Darunter die eigenen Rezepte.
 */
export function RecipeStartScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const draftMut = useDraftRecipe();
  const begin = useRecipeEditorStore((s) => s.begin);
  const openDraft = useRecipeEditorStore((s) =>
    s.target === NEW_RECIPE_TARGET && s.dirty ? s.form : null
  );
  const recipes = useOwnRecipes();
  const [brief, setBrief] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmed = brief.trim();

  const handleGenerate = async () => {
    if (trimmed.length === 0 || draftMut.isPending) return;
    if (trimmed.length > MAX_DRAFT_BRIEF_CHARS) {
      setError(
        `Die Beschreibung ist zu lang (${NUM(trimmed.length)} von max. ${NUM(MAX_DRAFT_BRIEF_CHARS)} Zeichen).`
      );
      return;
    }
    setError(null);
    try {
      const spec = await draftMut.mutateAsync({ description: trimmed });
      begin(NEW_RECIPE_TARGET, { ...EMPTY_RECIPE_FORM, ...draftToRecipeForm(spec) }, true);
      router.replace(EDITOR);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Entwurf fehlgeschlagen.');
    }
  };

  const handleManual = () => {
    begin(NEW_RECIPE_TARGET, EMPTY_RECIPE_FORM);
    router.replace(EDITOR);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <Stack.Screen options={{ title: 'Neues Rezept' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xlarge }]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text style={[styles.intro, { color: theme.textSecondary }]}>
          Ein Rezept ist eine Schreibvorgabe für Aufbau, Ton und Länge, die du im Chat per
          @-Erwähnung aufrufst. Beschreibe es kurz — daraus entsteht ein Entwurf, den du vor dem
          Anlegen noch anpassen kannst.
        </Text>

        {openDraft ? (
          <FormSection title="Offener Entwurf">
            <ListRow
              leading={<Glyph iconKey={openDraft.iconKey} />}
              title={openDraft.title.trim() || 'Rezept ohne Namen'}
              value="Weiter bearbeiten"
              onPress={() => router.replace(EDITOR)}
              last
            />
          </FormSection>
        ) : null}

        <FormSection
          title="Was soll dein Rezept können?"
          error={error ? <ErrorText>{error}</ErrorText> : null}
        >
          <FieldInput
            value={brief}
            onChangeText={(text) => {
              setBrief(text);
              if (error) setError(null);
            }}
            placeholder="Beschreibe dein neues Rezept …"
            multiline
            maxLength={MAX_DRAFT_BRIEF_CHARS}
            editable={!draftMut.isPending}
            accessibilityLabel="Was soll dein Rezept können?"
            style={styles.briefInput}
          />
          <CharCount value={brief} max={MAX_DRAFT_BRIEF_CHARS} />
        </FormSection>

        <View style={styles.chips} accessibilityLabel="Beispiele">
          {EXAMPLE_PROMPTS.map((example) => (
            <Pressable
              key={example.label}
              onPress={() => {
                setBrief(example.text);
                setError(null);
              }}
              disabled={draftMut.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Beispiel: ${example.label}`}
              style={({ pressed }) => [
                styles.chip,
                { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.chipText, { color: theme.text }]}>{example.label}</Text>
            </Pressable>
          ))}
        </View>

        <Button
          onPress={() => void handleGenerate()}
          disabled={trimmed.length === 0}
          loading={draftMut.isPending}
        >
          Entwurf erstellen
        </Button>
        {draftMut.isPending ? (
          <Text
            style={[styles.pendingLine, { color: theme.textSecondary }]}
            accessibilityLiveRegion="polite"
          >
            Der Entwurf wird geschrieben …
          </Text>
        ) : null}
        <Button variant="ghost" onPress={handleManual} disabled={draftMut.isPending}>
          Lieber manuell anlegen
        </Button>

        <OwnRecipes recipes={recipes} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Glyph({ iconKey }: { iconKey: string | null }) {
  const theme = useTheme();
  return (
    <View style={[styles.glyph, { backgroundColor: theme.backgroundAlt }]}>
      <AgentGlyph iconKey={iconKey} size={22} color={theme.text} />
    </View>
  );
}

function OwnRecipes({ recipes }: { recipes: ReturnType<typeof useOwnRecipes> }) {
  const theme = useTheme();
  if (recipes.isPending) {
    return (
      <View style={styles.ownSection}>
        <SkeletonRows count={2} leading={44} />
      </View>
    );
  }
  if (recipes.isError) {
    return (
      <View style={styles.ownSection}>
        <FormSection title="Meine Rezepte">
          <ListRow
            icon="refresh"
            title="Deine Rezepte konnten nicht geladen werden."
            value="Erneut versuchen"
            onPress={() => void recipes.refetch()}
            last
          />
        </FormSection>
      </View>
    );
  }
  const list = recipes.data;
  if (list.length === 0) {
    return (
      <Text style={[styles.empty, { color: theme.textSecondary }]}>
        Du hast noch keine eigenen Rezepte.
      </Text>
    );
  }
  return (
    <View style={styles.ownSection}>
      <FormSection title="Meine Rezepte">
        {list.map((recipe, i) => (
          <ListRow
            key={recipe.id}
            leading={<Glyph iconKey={recipe.iconKey} />}
            title={recipe.title}
            value={recipe.description || `@${recipe.mention}`}
            onPress={() =>
              router.push({
                pathname: '/(focused)/grueneratoren/rezept/[mention]',
                params: { mention: recipe.mention },
              })
            }
            last={i === list.length - 1}
          />
        ))}
      </FormSection>
    </View>
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
  briefInput: { minHeight: 120 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    fontWeight: '500',
  },
  pendingLine: {
    ...typography.caption,
    textAlign: 'center',
  },
  ownSection: { marginTop: spacing.medium },
  empty: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginTop: spacing.medium,
  },
  glyph: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
