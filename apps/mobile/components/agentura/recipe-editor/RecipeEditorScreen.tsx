import { agentsList, useUserLandesverbaende } from '@gruenerator/chat';
import {
  MAX_TEXT_FORM_DESCRIPTION_CHARS,
  MAX_TEXT_FORM_STYLE_CHARS,
  MAX_TEXT_FORM_TITLE_CHARS,
  type TextForm,
} from '@gruenerator/contracts';
import { isApiErrorWithStatus } from '@gruenerator/shared/api';
import {
  classifyRecipeMention,
  effectiveMention,
  EMPTY_RECIPE_FORM,
  hydrateRecipeForm,
  recipeFormToPayload,
  useDeleteRecipe,
  useOwnRecipes,
  useSaveRecipe,
  type RecipeFormState,
} from '@gruenerator/shared/grueneratoren';
import { slugifyName } from '@gruenerator/shared/utils';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../../hooks/useTheme';
import {
  recipeEditorTarget,
  shouldKeepDraft,
  useRecipeDraftHydrated,
  useRecipeEditorStore,
} from '../../../stores/recipeEditorStore';
import { BODY_FONT, borderRadius, colors, spacing, typography } from '../../../theme';
import { Button, ListRow, SkeletonRows } from '../../common';
import { AgentGlyph } from '../AgentGlyph';

import { CharCount, ErrorText, FieldInput, FormSection } from './FormParts';
import {
  examplesStatus,
  isValidMention,
  MAX_MENTION_CHARS,
  mentionBlocker,
  normalizeMention,
  recipeMetaLine,
  styleBlockValid,
  typeMention,
  type MentionNotice,
} from './recipeEditorRules';

type Mode = 'create' | 'edit';

type Source =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'not-entitled' }
  | { status: 'ready'; mode: Mode; initial: RecipeFormState };

const catalogueMentions = new Set(agentsList.map((s) => s.mention.toLowerCase()));
const isCatalogueMention = (mention: string): boolean =>
  catalogueMentions.has(mention.toLowerCase());

const detailHref = (mention: string) =>
  ({ pathname: '/(focused)/grueneratoren/rezept/[mention]', params: { mention } }) as const;

/**
 * Wie `RecipeEditorPage` im Web: eine eigene Zeile wird bearbeitet, sonst wird
 * aus der Erwähnung ein neues Rezept (frei, Preset- oder LV-Anpassung). Ein
 * Katalog-Rezept außerhalb der Landesverbände leitet der Server ebenfalls als
 * Anpassung (`recipe`) ab — es bekommt deshalb hier dieselbe feste Erwähnung.
 */
function useEditorSource(param: string): Source {
  const { lvIds, isHydrated: rolesLoaded } = useUserLandesverbaende();
  const own = useOwnRecipes(param.length > 0);

  if (!param) {
    return { status: 'ready', mode: 'create', initial: EMPTY_RECIPE_FORM };
  }
  if (own.isPending || !rolesLoaded) return { status: 'loading' };
  // Nie stillschweigend ins Anlegen fallen: ein Speichern könnte sonst eine
  // bestehende Anpassung überschreiben, die nur nicht geladen wurde.
  if (own.isError) return { status: 'error', retry: () => void own.refetch() };

  const needle = param.toLowerCase();
  const ownForm: TextForm | undefined = own.data.find(
    (r) => r.mention.toLowerCase() === needle && !r.sharedFromGroup
  );
  if (ownForm) {
    return {
      status: 'ready',
      mode: 'edit',
      initial: hydrateRecipeForm(ownForm),
    };
  }

  const classification = classifyRecipeMention(param, lvIds);
  if (!classification.entitled) return { status: 'not-entitled' };
  if (classification.kind !== 'custom') {
    return {
      status: 'ready',
      mode: 'create',
      initial: {
        ...EMPTY_RECIPE_FORM,
        kind: classification.kind,
        fixedMention: classification.mention,
        mention: classification.mention,
        textType: classification.textType,
        title: classification.label,
      },
    };
  }
  const skill = agentsList.find((s) => s.mention.toLowerCase() === needle);
  if (skill) {
    return {
      status: 'ready',
      mode: 'create',
      initial: {
        ...EMPTY_RECIPE_FORM,
        kind: 'recipe',
        fixedMention: skill.mention,
        mention: skill.mention,
        title: skill.title,
      },
    };
  }
  return { status: 'ready', mode: 'create', initial: EMPTY_RECIPE_FORM };
}

export function RecipeEditorScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ mention?: string }>();
  const param = typeof params.mention === 'string' ? params.mention.trim() : '';
  const source = useEditorSource(param);
  const hydrated = useRecipeDraftHydrated();

  if (source.status === 'ready' && hydrated) {
    return (
      <EditorForm
        key={recipeEditorTarget(param || null)}
        target={recipeEditorTarget(param || null)}
        mode={source.mode}
        initial={source.initial}
      />
    );
  }

  let body: ReactNode;
  if (source.status === 'error') {
    body = (
      <View style={styles.state}>
        <Text style={[styles.stateText, { color: theme.text }]}>
          Deine Rezepte konnten nicht geladen werden.
        </Text>
        <Button variant="outline" onPress={source.retry}>
          Erneut versuchen
        </Button>
      </View>
    );
  } else if (source.status === 'not-entitled') {
    body = (
      <View style={styles.state}>
        <Text style={[styles.stateText, { color: theme.text }]}>
          Dieses Rezept ist deinem Landesverband nicht zugeteilt.
        </Text>
        <Button variant="outline" onPress={() => router.back()}>
          Zurück
        </Button>
      </View>
    );
  } else {
    body = (
      <View style={styles.content}>
        <SkeletonRows count={4} leading={0} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: param ? 'Rezept bearbeiten' : 'Neues Rezept' }} />
      {body}
    </>
  );
}

function EditorForm({
  target,
  mode,
  initial,
}: {
  target: string;
  mode: Mode;
  initial: RecipeFormState;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { lvIds } = useUserLandesverbaende();
  const saveMut = useSaveRecipe();
  const deleteMut = useDeleteRecipe();

  const [restored] = useState(() => shouldKeepDraft(useRecipeEditorStore.getState(), target));
  const storeForm = useRecipeEditorStore((s) => s.form);
  const storeTarget = useRecipeEditorStore((s) => s.target);
  const update = useRecipeEditorStore((s) => s.update);
  const begin = useRecipeEditorStore((s) => s.begin);
  const clear = useRecipeEditorStore((s) => s.clear);
  const [showRestored, setShowRestored] = useState(restored && mode === 'edit');
  const [mentionError, setMentionError] = useState<MentionNotice | null>(null);
  /** Gesetzt, sobald die Seite absichtlich verlassen wird (gespeichert, gelöscht, verworfen). */
  const leavingRef = useRef(false);

  // Nur beim Öffnen: spätere Refetches überschreiben die Eingaben nicht.
  const begun = useRef(false);
  useEffect(() => {
    if (begun.current) return;
    begun.current = true;
    if (!restored) begin(target, initial);
  }, [restored, begin, target, initial]);

  // Bis der Entwurf im Store steht, zeigt die Seite den Ausgangsstand.
  const ready = storeTarget === target;
  const form = ready ? storeForm : initial;

  const canEditMention = form.kind === 'custom' && mode === 'create';
  const mentionFieldValue =
    canEditMention && !form.mentionTouched ? slugifyName(form.title, '') : effectiveMention(form);
  const saveMention =
    canEditMention && form.mentionTouched ? normalizeMention(form.mention) : effectiveMention(form);

  const examples = useMemo(() => examplesStatus(form.rawExamples), [form.rawExamples]);
  const titleValid = form.title.trim().length > 0;
  const styleValid = styleBlockValid(form.styleBlock);
  const mentionValid = canEditMention ? isValidMention(normalizeMention(mentionFieldValue)) : true;
  const liveBlocker =
    canEditMention && mentionValid ? mentionBlocker(saveMention, lvIds, isCatalogueMention) : null;
  const mentionNotice = mentionError ?? liveBlocker;
  const mentionHint = !canEditMention
    ? null
    : mentionFieldValue.length === 0
      ? 'Bitte ein @-Kürzel angeben.'
      : !mentionValid
        ? 'Mindestens 2 Zeichen: Kleinbuchstaben, Ziffern und Bindestriche.'
        : 'So rufst du das Rezept im Chat auf.';

  const canSave =
    ready &&
    titleValid &&
    styleValid &&
    mentionValid &&
    !liveBlocker &&
    !examples.blockReason &&
    !saveMut.isPending &&
    !deleteMut.isPending;

  // Ungespeicherte Änderungen: vor dem Verlassen nachfragen. Wer schon geht
  // (gespeichert, gelöscht, verworfen), wird nur durchgelassen.
  const dirty = useRecipeEditorStore((s) => s.dirty);
  // A kept draft stays dirty, so leaving with it lifts the block explicitly.
  const [keepingDraft, setKeepingDraft] = useState(false);
  usePreventRemove(dirty && !keepingDraft, ({ repeat }) => {
    if (leavingRef.current) {
      repeat();
      return;
    }
    Alert.alert(
      'Ungespeicherte Änderungen',
      'Dein Entwurf bleibt auf diesem Gerät, bis du ihn speicherst oder verwirfst.',
      [
        { text: 'Weiter bearbeiten', style: 'cancel' },
        {
          text: 'Entwurf behalten',
          onPress: () => {
            leavingRef.current = true;
            setKeepingDraft(true);
            repeat();
          },
        },
        {
          text: 'Verwerfen',
          style: 'destructive',
          onPress: () => {
            leavingRef.current = true;
            clear();
            repeat();
          },
        },
      ]
    );
  });

  const handleSave = async () => {
    if (!canSave) return;
    setMentionError(null);
    try {
      const saved = await saveMut.mutateAsync({
        mention: saveMention,
        body: recipeFormToPayload(form),
      });
      leavingRef.current = true;
      clear();
      router.dismissTo(detailHref(saved.mention));
    } catch (err) {
      // 400/403/409 betreffen die Erwähnung: vergeben, Preset, oder LV nicht zugeteilt.
      const aboutMention =
        isApiErrorWithStatus(err, 409) ||
        isApiErrorWithStatus(err, 400) ||
        isApiErrorWithStatus(err, 403);
      const message = err instanceof Error ? err.message : null;
      if (aboutMention) {
        setMentionError({
          text: message ?? 'Dieses @-Kürzel ist bereits vergeben.',
          recipeMention: null,
        });
        return;
      }
      Alert.alert(
        'Speichern fehlgeschlagen',
        `${message ?? 'Unbekannter Fehler.'}\n\nDein Entwurf bleibt erhalten.`
      );
    }
  };

  const handleDelete = () => {
    const name = form.title.trim() || saveMention;
    Alert.alert(
      `„${name}“ löschen?`,
      `„${name}“ wird in den Papierkorb verschoben und kann 30 Tage lang wiederhergestellt werden.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => {
            deleteMut
              .mutateAsync(saveMention)
              .then(() => {
                leavingRef.current = true;
                clear();
                router.dismissTo('/(focused)/agents');
              })
              .catch((err: unknown) => {
                Alert.alert(
                  'Löschen fehlgeschlagen',
                  err instanceof Error ? err.message : 'Unbekannter Fehler.'
                );
              });
          },
        },
      ]
    );
  };

  const discardRestored = () => {
    begin(target, initial);
    setShowRestored(false);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <Stack.Screen
        options={{
          title: mode === 'create' ? 'Neues Rezept' : 'Rezept bearbeiten',
          headerRight: () =>
            saveMut.isPending ? (
              <ActivityIndicator color={theme.textGreen} accessibilityLabel="Wird gespeichert" />
            ) : (
              <Pressable
                onPress={() => void handleSave()}
                disabled={!canSave}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Speichern"
                accessibilityState={{ disabled: !canSave }}
                style={({ pressed }) => ({ opacity: !canSave ? 0.4 : pressed ? 0.6 : 1 })}
              >
                <Text style={[styles.headerAction, { color: theme.textGreen }]}>Speichern</Text>
              </Pressable>
            ),
        }}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xlarge }]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {showRestored ? (
          <View style={[styles.notice, { backgroundColor: theme.backgroundAlt }]}>
            <Text style={[styles.noticeText, { color: theme.text }]}>
              Ungespeicherte Änderungen von vorhin wiederhergestellt.
            </Text>
            <Pressable
              onPress={discardRestored}
              accessibilityRole="button"
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={[styles.noticeAction, { color: theme.textGreen }]}>Verwerfen</Text>
            </Pressable>
          </View>
        ) : null}

        <FormSection title="Name">
          <View style={styles.headRow}>
            <Pressable
              onPress={() => router.push('/(focused)/grueneratoren/rezept-editor/icon')}
              accessibilityRole="button"
              accessibilityLabel="Symbol ändern"
              style={({ pressed }) => [
                styles.iconSquare,
                { backgroundColor: theme.backgroundAlt, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <AgentGlyph iconKey={form.iconKey} size={28} color={theme.text} />
            </Pressable>
            <FieldInput
              value={form.title}
              onChangeText={(title) => update({ title })}
              maxLength={MAX_TEXT_FORM_TITLE_CHARS}
              placeholder="Gib deinem Rezept einen Namen"
              accessibilityLabel="Name"
              style={styles.flex}
              returnKeyType="next"
            />
          </View>
        </FormSection>

        <FormSection
          title="@-Kürzel"
          footer={canEditMention ? mentionHint : recipeMetaLine(saveMention)}
          error={
            mentionNotice ? (
              <ErrorText>
                {mentionNotice.text}
                {mentionNotice.recipeMention ? (
                  <Text
                    style={styles.link}
                    accessibilityRole="link"
                    onPress={() => router.push(detailHref(mentionNotice.recipeMention ?? ''))}
                  >
                    {' '}
                    Zum Rezept
                  </Text>
                ) : null}
              </ErrorText>
            ) : null
          }
        >
          <View style={styles.mentionRow}>
            <Text style={[styles.at, { color: theme.textSecondary }]}>@</Text>
            {canEditMention ? (
              <FieldInput
                value={mentionFieldValue}
                onChangeText={(text) => {
                  setMentionError(null);
                  update({ mentionTouched: true, mention: typeMention(text) });
                }}
                onBlur={() => {
                  const s = useRecipeEditorStore.getState().form;
                  if (s.mentionTouched) update({ mention: normalizeMention(s.mention) });
                }}
                maxLength={MAX_MENTION_CHARS}
                placeholder="mein-rezept"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="@-Kürzel"
                accessibilityHint="So rufst du das Rezept im Chat auf"
                style={[styles.flex, styles.mentionInput]}
              />
            ) : (
              <Text
                style={[styles.fixedMention, { color: theme.text }]}
                accessibilityLabel={`@-Kürzel: ${saveMention}`}
              >
                {saveMention}
              </Text>
            )}
          </View>
        </FormSection>

        <FormSection title="Beschreibung">
          <FieldInput
            value={form.description}
            onChangeText={(description) => update({ description })}
            maxLength={MAX_TEXT_FORM_DESCRIPTION_CHARS}
            placeholder="Wofür ist das Rezept da?"
            accessibilityLabel="Beschreibung"
            multiline
            style={styles.descriptionInput}
          />
          <CharCount value={form.description} max={MAX_TEXT_FORM_DESCRIPTION_CHARS} />
        </FormSection>

        <FormSection
          title="Anleitung"
          footer="Pflichtfeld · wird dem Modell als Schreibvorgabe gegeben."
        >
          <FieldInput
            value={form.styleBlock}
            onChangeText={(styleBlock) => update({ styleBlock })}
            maxLength={MAX_TEXT_FORM_STYLE_CHARS}
            placeholder="Schreibe im Stil von …"
            accessibilityLabel="Anleitung"
            multiline
            style={styles.styleInput}
          />
          <CharCount value={form.styleBlock} max={MAX_TEXT_FORM_STYLE_CHARS} />
        </FormSection>

        <FormSection
          error={examples.blockReason ? <ErrorText>{examples.blockReason}</ErrorText> : null}
          footer="Füge Beispieltexte ein — daraus entsteht eine Anleitung, die du weiter anpassen kannst."
        >
          <ListRow
            icon="sparkles-outline"
            title="Aus Beispielen lernen"
            value={
              examples.examples.length === 0
                ? 'Noch keine Beispiele'
                : `${examples.examples.length} ${examples.examples.length === 1 ? 'Beispiel' : 'Beispiele'}`
            }
            onPress={() => router.push('/(focused)/grueneratoren/rezept-editor/beispiele')}
            last
          />
        </FormSection>

        {mode === 'edit' ? (
          <FormSection>
            {form.kind === 'custom' ? (
              <ListRow
                icon="share-social-outline"
                title="Teilen"
                value="Mit Projekten oder öffentlich"
                onPress={() =>
                  router.push({
                    pathname: '/(focused)/grueneratoren/rezept/[mention]/teilen',
                    params: { mention: saveMention },
                  })
                }
              />
            ) : null}
            <ListRow
              icon="trash-outline"
              title={form.kind === 'custom' ? 'Löschen' : 'Anpassung löschen'}
              onPress={handleDelete}
              disabled={deleteMut.isPending}
              {...(deleteMut.isPending && {
                accessory: <ActivityIndicator color={colors.error[600]} />,
              })}
              destructive
              last
            />
          </FormSection>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: {
    padding: spacing.medium,
    gap: spacing.large,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
    padding: spacing.large,
  },
  stateText: {
    ...typography.body,
    textAlign: 'center',
  },
  headerAction: {
    fontFamily: BODY_FONT,
    fontSize: 17,
    fontWeight: '600',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.small,
    borderRadius: borderRadius.large,
    borderCurve: 'continuous',
  },
  noticeText: {
    ...typography.bodySmall,
    flex: 1,
  },
  noticeAction: {
    ...typography.buttonSmall,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.small,
  },
  iconSquare: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.medium,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.small,
  },
  at: {
    ...typography.body,
  },
  mentionInput: {
    paddingLeft: 2,
  },
  fixedMention: {
    ...typography.body,
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  link: {
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  descriptionInput: { minHeight: 72 },
  styleInput: { minHeight: 240 },
});
