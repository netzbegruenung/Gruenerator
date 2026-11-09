/**
 * „Als Rezept speichern“: eine Chat-Antwort wird zum Beispieltext eines neuen
 * Rezepts. Die Antwort reist als Navigationszustand zum Creator
 * (`/agentura/rezept/neu`, Web) bzw. als Entwurf in den Editor-Speicher
 * (Mobile); der Creator lässt daraus per Entwurfs-Endpunkt Name, Beschreibung
 * und Anleitung vorschlagen und legt die Antwort als erstes Beispiel dazu.
 */
import { MAX_TEXT_FORM_EXAMPLE_CHARS, type DraftedRecipeSpec } from '@gruenerator/contracts';

import { draftToRecipeForm, type RecipeFormState } from './recipeFormState.js';
import { joinExamples } from './splitExamples.js';

/** Der Auftrag an den Entwurfs-Endpunkt: das Beispiel liefert den Stil, nicht die Beschreibung. */
export const RECIPE_FROM_ANSWER_BRIEF = 'Ein Rezept, das Texte wie dieses Beispiel erzeugt.';

/** Was die Navigation zum Creator mitgibt (`location.state` im Web). */
export interface RecipeFromAnswerState {
  fromAnswer: { text: string };
}

/** Liest den Navigationszustand tolerant: alles, was keine nichtleere Antwort trägt, ist `null`. */
export function readFromAnswer(state: unknown): { text: string } | null {
  if (!state || typeof state !== 'object' || !('fromAnswer' in state)) return null;
  const answer = (state as { fromAnswer: unknown }).fromAnswer;
  if (!answer || typeof answer !== 'object' || !('text' in answer)) return null;
  const text = (answer as { text: unknown }).text;
  return typeof text === 'string' && text.trim().length > 0 ? { text } : null;
}

/** Die Antwort als Beispiel-Feld des Editors, gekürzt auf das Limit eines Beispiels. */
export function answerToRawExamples(text: string): string {
  return joinExamples([{ content: text.trim().slice(0, MAX_TEXT_FORM_EXAMPLE_CHARS) }]);
}

/** Der Entwurf des Creators plus die Antwort als erstes Beispiel; ohne Entwurf nur das Beispiel. */
export function recipeFormFromAnswer(
  text: string,
  spec: DraftedRecipeSpec | null
): Partial<RecipeFormState> {
  return {
    ...(spec ? draftToRecipeForm(spec) : {}),
    rawExamples: answerToRawExamples(text),
  };
}
