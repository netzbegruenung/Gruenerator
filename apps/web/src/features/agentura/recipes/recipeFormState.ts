/**
 * Editable form state for one recipe ("Rezept") — the create/edit wizard's
 * single source of truth, mirroring `agents/agentFormState.ts`.
 *
 * `mention` handling follows `TextFormEditor`'s existing rule: a preset or LV
 * recipe carries a `fixedMention` the user can't change; a custom recipe
 * either keeps the mention the user typed (`mentionTouched`) or derives it
 * from the title as they type (`slugifyName`) — UNLESS it already has an
 * `originalMention` (an existing saved row), in which case that wins over a
 * live-changing title, mirroring `TextFormEditor`'s `if (initialForm) return
 * initialForm.mention` branch. Without this, editing a saved custom recipe's
 * title would silently re-slug the PUT target on every keystroke.
 */
import {
  type DraftedRecipeSpec,
  type SaveTextFormBody,
  type TextForm,
  type TextFormKind,
  type TextFormType,
} from '@gruenerator/contracts';
import { DEFAULT_AGENT_ICON } from '@gruenerator/shared/agents';
import { slugifyName } from '@gruenerator/shared/utils';

import { joinExamples, splitExamples } from './splitExamples';

export interface RecipeFormState {
  kind: TextFormKind;
  /** Preset/LV recipe mention the user can't change; `null` only for custom. */
  fixedMention: string | null;
  mention: string;
  mentionTouched: boolean;
  textType: TextFormType | null;
  title: string;
  description: string;
  iconKey: string;
  styleBlock: string;
  rawExamples: string;
  /** The mention an already-saved row was loaded with; `null` for a new (or drafted) recipe. */
  originalMention: string | null;
}

export const EMPTY_RECIPE_FORM: RecipeFormState = {
  kind: 'custom',
  fixedMention: null,
  mention: '',
  mentionTouched: false,
  textType: null,
  title: '',
  description: '',
  iconKey: DEFAULT_AGENT_ICON,
  styleBlock: '',
  rawExamples: '',
  originalMention: null,
};

/** The mention a save actually uses — same precedence as `TextFormEditor`. */
export function effectiveMention(form: RecipeFormState): string {
  if (form.fixedMention) return form.fixedMention;
  if (form.originalMention) return form.originalMention;
  return form.mentionTouched ? form.mention : slugifyName(form.title, 'textform');
}

/** Map the editable form state to the save payload (`PUT /:mention` body). */
export function recipeFormToPayload(form: RecipeFormState): SaveTextFormBody {
  const { examples } = splitExamples(form.rawExamples);
  return {
    kind: form.kind,
    textType: form.textType,
    title: form.title.trim(),
    examples: examples.map((content) => ({ content })),
    styleBlock: form.styleBlock.trim(),
    description: form.description.trim() || null,
    iconKey: form.iconKey,
  };
}

/** Build the editable form state from a saved recipe (edit view). */
export function hydrateRecipeForm(form: TextForm): RecipeFormState {
  return {
    kind: form.kind,
    fixedMention: form.kind === 'custom' ? null : form.mention,
    mention: form.mention,
    mentionTouched: false,
    textType: form.textType,
    title: form.title,
    description: form.description ?? '',
    iconKey: form.iconKey ?? DEFAULT_AGENT_ICON,
    styleBlock: form.styleBlock,
    rawExamples: joinExamples(form.examples),
    originalMention: form.mention,
  };
}

/**
 * Map a synthesized draft into the create wizard's form state. Always a
 * custom recipe — the creator only ever synthesizes new, user-owned recipes,
 * never a preset/LV override. `mentionTouched: true` keeps the spec's own
 * mention instead of re-deriving one from the title.
 */
export function draftToRecipeForm(spec: DraftedRecipeSpec): Partial<RecipeFormState> {
  return {
    kind: 'custom',
    fixedMention: null,
    mention: spec.mention,
    mentionTouched: true,
    title: spec.title,
    description: spec.description,
    iconKey: spec.iconKey,
    styleBlock: spec.styleBlock,
  };
}
