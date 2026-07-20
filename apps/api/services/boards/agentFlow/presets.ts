/**
 * Stage 2 (AI step): turn the column's task config + card context into the
 * instruction string handed to the agent generation. Presets are curated prompt
 * templates that steer the universal agent toward the right tool; `custom` passes
 * the user's free-text prompt through verbatim ("KI dazwischenschalten").
 */
import {
  type BoardAiPreset,
  type BoardFlowCardContext,
  type BoardFlowTask,
} from '@gruenerator/contracts';

function cardBlock(ctx: BoardFlowCardContext): string {
  const parts: string[] = [];
  if (ctx.title) parts.push(`Titel: ${ctx.title}`);
  if (ctx.description) parts.push(`Beschreibung: ${ctx.description}`);
  return parts.join('\n');
}

const PRESET_PROMPTS: Record<BoardAiPreset, (ctx: BoardFlowCardContext) => string> = {
  web_research: (ctx) =>
    `Führe eine Webrecherche durch und fasse die aktuellen, belegten Erkenntnisse zu folgendem Thema zusammen.\n\n${cardBlock(ctx)}`,
  deep_research: (ctx) =>
    `Erstelle eine tiefgehende, mehrquellige Recherche mit Quellenangaben zu folgendem Thema.\n\n${cardBlock(ctx)}`,
  doc_search: (ctx) =>
    `Durchsuche die grünen Parteiprogramme, Beschlüsse und Positionen und fasse die relevanten Inhalte zu folgendem Thema zusammen.\n\n${cardBlock(ctx)}`,
  summarize: (ctx) =>
    `Fasse den folgenden Karteninhalt prägnant und strukturiert zusammen.\n\n${cardBlock(ctx)}`,
};

/** Build the instruction for the AI step (before any source data is appended). */
export function buildInstruction(task: BoardFlowTask, ctx: BoardFlowCardContext): string {
  if (task.type === 'custom') {
    const block = cardBlock(ctx);
    return block ? `${task.prompt}\n\n--- KARTE ---\n${block}` : task.prompt;
  }
  return PRESET_PROMPTS[task.preset](ctx);
}

/**
 * Long-form generation (document mode) when the flow produces a document, sheet,
 * presentation or email deliverable; otherwise concise comment mode. Sheet/
 * presentation need researched prose to structure from, like a document.
 */
export function wantsLongForm(outputs: ReadonlyArray<{ type: string }>): boolean {
  return outputs.some(
    (o) =>
      o.type === 'document' || o.type === 'sheet' || o.type === 'presentation' || o.type === 'email'
  );
}
