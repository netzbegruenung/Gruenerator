/**
 * Rezepte, deren Rumpf im Code steht statt in `gruenerator-intern`.
 *
 * Das gilt nur für Produktmechanik, die kein Parteiinhalt ist. Die
 * „Visuellen Bausteine" hängen zudem vom Turn ab: an den Arten, die der
 * Client zeichnen kann (`visualBlocks` der Anfrage). Das Frontmatter liegt wie
 * bei jedem Systemrezept in `packages/shared/src/agents/skills/`, der Rumpf
 * kommt hier her — und ist per Konstruktion öffentlich.
 *
 * Dasselbe gilt für das Regelwerk der Übertragungs-Rezepte (Einfache/Leichte
 * Sprache): reines Handwerk, das als Persona der Pipeline ohnehin im Code steht
 * (`routes/chat/agents/pipelines/`). Ein zweiter Ort im intern-Repo hätte nur
 * Kosten — am 13.08.2026 lief der Agent zwei Stunden mit Ersatz-Persona, weil
 * der Rollout fehlte.
 *
 * Ein leerer Rumpf heißt „in diesem Turn nicht verfügbar": das Rezept fehlt
 * dann im Katalog und lässt sich nicht laden (Client ohne Renderer).
 */
import { type VisualBlockKind } from '@gruenerator/contracts';

import { buildVisualBlocksGuidance } from '../../agents/langgraph/ChatGraph/nodes/visualBlocksGuidance.js';
import { pipelineRecipeBodies } from '../../routes/chat/agents/pipelines/index.js';

import { buildSharepicDesignGuide } from './sharepicDesignGuide.js';

export interface CodeRecipeContext {
  kinds: readonly VisualBlockKind[];
}

export const CODE_RECIPE_BODIES: Readonly<Record<string, (ctx: CodeRecipeContext) => string>> = {
  'visuelle-bausteine': ({ kinds }) => buildVisualBlocksGuidance(kinds).trim(),
  'sharepic-gestalten': () => buildSharepicDesignGuide(),
  ...Object.fromEntries(
    [...pipelineRecipeBodies()].map(([mention, body]) => [mention, () => body])
  ),
};

/** Ein Code-Rezept ist verfügbar, wenn sein Rumpf in diesem Turn nicht leer ist. */
export function isCodeRecipeAvailable(mention: string, ctx: CodeRecipeContext): boolean {
  const body = CODE_RECIPE_BODIES[mention];
  return body === undefined || body(ctx) !== '';
}
