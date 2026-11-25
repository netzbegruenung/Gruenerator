import { useUserLandesverbaende } from '@gruenerator/chat';
import {
  MAX_TEXT_FORM_EXAMPLES,
  MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS,
  RESERVED_TEXT_FORM_MENTIONS,
  isUserRecipeDescriptionValid,
  type TextForm,
} from '@gruenerator/contracts';
import { isApiErrorWithStatus } from '@gruenerator/shared/api';
import { groupContentKey } from '@gruenerator/shared/groups';
import {
  useOwnRecipes,
  useSaveRecipe,
  useShareRecipeWithGroup,
  classifyRecipeMention,
  splitExamples,
  effectiveMention,
  recipeFormToPayload,
  type RecipeFormState,
} from '@gruenerator/shared/grueneratoren';
import { slugifyName } from '@gruenerator/shared/utils';
import { toast } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';

/**
 * `slugifyName` kappt bei 40 Zeichen — das Eingabefeld darf nicht mehr
 * zulassen, sonst tippt jemand ins Leere und der gespeicherte Name weicht
 * stillschweigend vom eingegebenen ab.
 */
export const MAX_MENTION_CHARS = 40;

export type RecipeFieldKey = 'title' | 'mention' | 'styleBlock' | 'description';

export interface MentionProblem {
  text: string;
  href: string | null;
}

/**
 * Was der Erwähnung im Weg steht, bevor irgendetwas zum Server geht. Der
 * Server lehnt beides ohnehin ab (400 „… ist ein Preset, nicht kind='custom'."
 * bzw. 403 für einen nicht zugeteilten Landesverband) — aber erst nach dem
 * Klick auf Speichern und in seinen Worten. Wer „Presse" als Titel tippt, soll
 * vorher wissen, wohin der eigene Stil stattdessen gehört.
 */
function mentionBlocker(mention: string, lvIds: readonly string[] | null): MentionProblem | null {
  if (RESERVED_TEXT_FORM_MENTIONS.includes(mention)) {
    return { text: 'Dieser Name ist reserviert.', href: null };
  }
  const classification = classifyRecipeMention(mention, lvIds);
  if (classification.kind === 'custom') return null;
  return {
    text: `@${mention} gehört zu einem mitgelieferten Rezept — dort kannst du deinen eigenen Stil hinterlegen.`,
    href: `/agentura/rezept/${encodeURIComponent(mention)}`,
  };
}

/**
 * Beim Tippen slugifizieren, ohne den gerade getippten Trenner zu schlucken:
 * `slugifyName` schneidet Bindestriche am Ende ab, weshalb „mein-" zu „mein"
 * wurde und „mein-rezept" nie zustande kam. Beim Verlassen des Feldes räumt
 * `normalizeMention` nach.
 */
function typeMention(raw: string): string {
  const slug = slugifyName(raw, '');
  const endsOnSeparator = /[^a-zA-Z0-9]$/.test(raw);
  return endsOnSeparator && slug.length > 0 && slug.length < MAX_MENTION_CHARS ? `${slug}-` : slug;
}

export interface RecipeSaveResult {
  saved: TextForm;
  /** `null`: kein Projekt im Spiel. `false`: gespeichert, aber das Teilen scheiterte. */
  sharedToProject: boolean | null;
}

interface UseRecipeEditorOptions {
  mode: 'create' | 'edit';
  initialState: RecipeFormState;
  /** Beim Anlegen gleich in dieses Projekt teilen. */
  projectId?: string | null;
}

/**
 * Zustand und Speichern eines Rezepts — geteilt von der Seite
 * (`RecipeEditor`) und dem Dialog im Projekt (`RecipeCreateDialog`), damit
 * beide dieselben Regeln prüfen und dieselben Fehler an dieselben Felder
 * schreiben.
 *
 * Speichern ist nie gesperrt: ein Klick mit Lücken zeigt die Fehler an den
 * Feldern und setzt den Fokus auf das erste, statt einen grauen Knopf ohne
 * Erklärung stehen zu lassen.
 */
export function useRecipeEditor({ mode, initialState, projectId = null }: UseRecipeEditorOptions) {
  const queryClient = useQueryClient();
  const saveMut = useSaveRecipe();
  const shareMut = useShareRecipeWithGroup();
  const { lvIds } = useUserLandesverbaende();
  const idBase = useId();
  const fieldIds: Record<RecipeFieldKey, string> = {
    title: `${idBase}-title`,
    mention: `${idBase}-mention`,
    styleBlock: `${idBase}-style`,
    description: `${idBase}-description`,
  };

  const [form, setForm] = useState<RecipeFormState>(initialState);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentionProblem, setMentionProblem] = useState<MentionProblem | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const set = <K extends keyof RecipeFormState>(k: K, v: RecipeFormState[K]) => {
    setJustSaved(false);
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  // Nur die Erwähnung eines eigenen Rezepts ist frei, und nur beim Anlegen.
  // `effectiveMention` hält beim Bearbeiten die gespeicherte `originalMention`.
  const canEditMention = form.kind === 'custom' && mode === 'create';
  const mention = effectiveMention(form);
  // Was im Feld steht, solange niemand getippt hat: der aus dem Titel
  // abgeleitete Entwurf, ohne `effectiveMention`s Notfallnamen „textform".
  const mentionFieldValue =
    canEditMention && !form.mentionTouched ? slugifyName(form.title, '') : mention;

  const setMentionInput = (raw: string) => {
    setJustSaved(false);
    setMentionProblem(null);
    setForm((prev) => ({ ...prev, mentionTouched: true, mention: typeMention(raw) }));
  };
  const normalizeMentionInput = () =>
    setForm((prev) =>
      prev.mentionTouched ? { ...prev, mention: slugifyName(prev.mention, '') } : prev
    );

  const split = useMemo(() => splitExamples(form.rawExamples), [form.rawExamples]);
  const exampleCount = split.examples.length;
  const examplesProblem =
    exampleCount > MAX_TEXT_FORM_EXAMPLES
      ? `Höchstens ${MAX_TEXT_FORM_EXAMPLES} Beispiele erlaubt — bitte unter „Aus Beispielen lernen“ kürzen.`
      : form.rawExamples.trim().length > MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS
        ? 'Zu viele Zeichen in den Beispielen — bitte unter „Aus Beispielen lernen“ kürzen.'
        : null;

  // Die Beschreibung ist die einzige Auswahlgrundlage des Modells. Beim
  // Bearbeiten bleibt eine unveränderte kurze Beschreibung speicherbar.
  const descriptionValid = isUserRecipeDescriptionValid(
    form.description,
    mode === 'edit' ? initialState.description : null
  );

  // Geprüft wird, was IM FELD steht, nicht `effectiveMention`: slugt der Titel
  // auf nichts (etwa „!!!"), fiele `effectiveMention` auf „textform" zurück —
  // gespeichert würde ein Name, den niemand gesehen hat.
  const fieldErrors: Partial<Record<RecipeFieldKey, string>> = {};
  if (form.title.trim().length === 0) fieldErrors.title = 'Gib dem Rezept einen Namen.';
  if (canEditMention && mentionFieldValue.length < 2)
    fieldErrors.mention = 'Der Name im Chat braucht mindestens zwei Buchstaben oder Ziffern.';
  if (form.styleBlock.trim().length === 0)
    fieldErrors.styleBlock = 'Schreib eine Anleitung oder lass sie aus Beispielen erstellen.';
  if (!descriptionValid)
    fieldErrors.description = 'Beschreib in mindestens 30 Zeichen, wann das Rezept passt.';

  const visibleErrors = submitted ? fieldErrors : {};

  const focusField = (key: RecipeFieldKey) => document.getElementById(fieldIds[key])?.focus();

  const save = async (): Promise<RecipeSaveResult | null> => {
    setSubmitted(true);
    setError(null);
    setMentionProblem(null);
    const order: RecipeFieldKey[] = ['title', 'mention', 'styleBlock', 'description'];
    const firstInvalid = order.find((k) => fieldErrors[k]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return null;
    }
    if (examplesProblem) return null;
    // Nur eine frei getippte Erwähnung kann kollidieren: eine Preset-/LV-
    // Anpassung trägt ihre feste Erwähnung absichtlich.
    if (canEditMention) {
      const blocker = mentionBlocker(mention, lvIds);
      if (blocker) {
        setMentionProblem(blocker);
        focusField('mention');
        return null;
      }
    }
    try {
      const saved = await saveMut.mutateAsync({ mention, body: recipeFormToPayload(form) });
      if (mode === 'edit') setJustSaved(true);
      if (mode !== 'create' || !projectId) return { saved, sharedToProject: null };
      // Das Rezept gehört der Person; scheitert nur das Teilen, bleibt es
      // gespeichert und lässt sich vom Rezept aus nachholen.
      try {
        await shareMut.mutateAsync({ mention: saved.mention, groupId: projectId });
        void queryClient.invalidateQueries({ queryKey: groupContentKey(projectId) });
        return { saved, sharedToProject: true };
      } catch (shareErr) {
        toast.error(
          `Rezept gespeichert, aber nicht ins Projekt geteilt: ${
            shareErr instanceof Error ? shareErr.message : 'unbekannter Fehler'
          }`
        );
        return { saved, sharedToProject: false };
      }
    } catch (err) {
      // 400/403/409 sind hier allesamt Auskünfte über die Erwähnung: vergeben,
      // einem Preset zugehörig oder Landesverband nicht zugeteilt. Sie gehören
      // an das Feld, nicht als Banner nach oben.
      if (
        isApiErrorWithStatus(err, 409) ||
        isApiErrorWithStatus(err, 400) ||
        isApiErrorWithStatus(err, 403)
      ) {
        setMentionProblem({
          text: err instanceof Error ? err.message : 'Diese Mention ist bereits vergeben.',
          href: null,
        });
        return null;
      }
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
      return null;
    }
  };

  // Der Chat-Deep-Link will auch die Zeilen-Id; sie steht in der eigenen Liste.
  // Verglichen wird ohne Groß-/Kleinschreibung, wie in `useRecipeByMention`.
  const ownRecipesQuery = useOwnRecipes(mode === 'edit');
  const recipeId =
    mode === 'edit'
      ? (ownRecipesQuery.data?.find((r) => r.mention.toLowerCase() === mention.toLowerCase())?.id ??
        null)
      : null;

  return {
    mode,
    form,
    set,
    fieldIds,
    canEditMention,
    mention,
    mentionFieldValue,
    setMentionInput,
    normalizeMentionInput,
    mentionProblem,
    fieldErrors: visibleErrors,
    descriptionValid,
    exampleCount,
    examplesProblem,
    error,
    setError,
    justSaved,
    isSaving: saveMut.isPending || shareMut.isPending,
    save,
    recipeId,
  };
}

export type RecipeEditorState = ReturnType<typeof useRecipeEditor>;
