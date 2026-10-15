import { type PublicTextForm, type TextForm } from '@gruenerator/contracts';
import { type Agent } from '@gruenerator/shared/agents';
import {
  DEFAULT_SCHEDULE,
  type FormState,
  type ScheduleState,
  type UserAgentInput,
} from '@gruenerator/shared/grueneratoren';
import { isModelEnabledByDefault, TEXT_MODELS } from '@gruenerator/shared/models';
import { slugifyName, slugSuffixFrom } from '@gruenerator/shared/utils';

/** Dieselbe Modellauswahl wie im Chat-Composer, aus dem Katalog. */
export const MODEL_OPTIONS = TEXT_MODELS.filter((m) => isModelEnabledByDefault(m.id));

/** Die Anleitung wird zur Anweisung der wiederkehrenden Aufgabe; der Vertrag deckelt sie. */
export const MAX_TASK_INSTRUCTION = 4000;
export const MIN_SYSTEM_ROLE = 10;
export const MAX_TITLE = 100;
export const MAX_DESCRIPTION = 500;

export function toggleIn(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Was dem Speichern noch fehlt — `null` heißt speicherbar. */
export function missingForSave(form: FormState): string | null {
  if (form.title.trim().length === 0) return 'Gib deinem Agent einen Namen.';
  if (form.description.trim().length === 0) return 'Beschreibe kurz, was der Agent tut.';
  if (form.systemRole.trim().length < MIN_SYSTEM_ROLE)
    return `Die Anleitung braucht mindestens ${MIN_SYSTEM_ROLE} Zeichen.`;
  return null;
}

/** Vor dem ersten Aufruf prüfen — sonst stünde der Agent schon, und die Aufgabe scheiterte bei jedem neuen Versuch. */
export function taskInstructionTooLong(form: FormState): boolean {
  return form.systemRole.trim().length > MAX_TASK_INSTRUCTION;
}

/** Zufallsbytes — in der App `getRandomBytes` aus `expo-crypto` (Hermes hat kein `crypto`). */
export type RandomBytes = (count: number) => Uint8Array;

/** Suffix klein, damit der Identifier `^[a-z0-9-]+$` erfüllt. */
export function newAgentIdentifier(title: string, randomBytes: RandomBytes): string {
  return `${slugifyName(title, 'agent')}-${slugSuffixFrom(randomBytes).toLowerCase()}`;
}

const COPY_SUFFIX = ' (Kopie)';

/** `title` ist auf 100 Zeichen begrenzt — der Zusatz muss hineinpassen. */
export function copyTitle(title: string): string {
  const room = MAX_TITLE - COPY_SUFFIX.length;
  return `${title.length > room ? title.slice(0, room).trimEnd() : title}${COPY_SUFFIX}`;
}

/** Duplikat wie im Web (`useDuplicateAgent`): gewöhnliches Anlegen mit kopierten Feldern. */
export function duplicateAgentInput(agent: Agent, randomBytes: RandomBytes): UserAgentInput {
  return {
    identifier: newAgentIdentifier(agent.title, randomBytes),
    title: copyTitle(agent.title),
    description: agent.description,
    systemRole: agent.systemRole,
    avatar: agent.avatar,
    iconKey: agent.iconKey,
    backgroundColor: agent.backgroundColor,
    tags: [...agent.tags],
    model: agent.model,
    defaultModel: agent.defaultModel,
    provider: agent.provider,
    params: agent.params,
    openingMessage: agent.openingMessage,
    openingQuestions: [...agent.openingQuestions],
    locale: agent.locale,
    author: agent.author,
    ...(agent.defaultNotebookIds && { defaultNotebookIds: [...agent.defaultNotebookIds] }),
    ...(agent.plugins && { plugins: [...agent.plugins] }),
    ...(agent.enabledTools && { enabledTools: [...agent.enabledTools] }),
    ...(agent.fewShotExamples && { fewShotExamples: [...agent.fewShotExamples] }),
    inlineSourceLinks: agent.inlineSourceLinks,
    defaultRecipeMention: agent.defaultRecipeMention,
    defaultRecipeId: agent.defaultRecipeId,
  };
}

/** Das gespeicherte {model, provider}-Paar zurück auf eine Katalog-Id. */
export function currentModelId(form: Pick<FormState, 'model' | 'provider'>): string | null {
  return (
    MODEL_OPTIONS.find((m) => m.model === form.model && m.provider === form.provider)?.id ?? null
  );
}

export interface CustomRecipeOption {
  id: string;
  mention: string;
  title: string;
}

/**
 * Eigene, geteilte und öffentliche Rezepte mit eigener Identität (wie web
 * `RecipePicker`): Überschreibungen von System-Rezepten haben keine eigene
 * Mention und stehen schon unter den System-Rezepten. Dedupliziert nach
 * Mention, das eigene gewinnt.
 */
export function customRecipeOptions(
  own: readonly TextForm[],
  publicRecipes: readonly PublicTextForm[]
): CustomRecipeOption[] {
  const map = new Map<string, CustomRecipeOption>();
  for (const f of [...own, ...publicRecipes]) {
    if (f.kind === 'custom' && !map.has(f.mention)) {
      map.set(f.mention, { id: f.id, mention: f.mention, title: f.title });
    }
  }
  return [...map.values()];
}

export function countLabel(label: string, n: number): string {
  return n > 0 ? `${label} · ${n}` : label;
}

/** Österreichische Profile bekommen Wiener Zeit als Vorgabe. */
export function defaultScheduleFor(locale: 'de-DE' | 'de-AT'): ScheduleState {
  return { ...DEFAULT_SCHEDULE, timezone: locale === 'de-AT' ? 'Europe/Vienna' : 'Europe/Berlin' };
}
