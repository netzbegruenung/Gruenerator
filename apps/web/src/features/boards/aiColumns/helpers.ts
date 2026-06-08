/**
 * Helpers for reading the AI-column config off a card and building the card
 * context sent to the agent-run endpoint.
 */
import { FIELD_IDS } from '../types';

import type { Field, Row, SelectOption } from '../types';
import type { BoardAiTask, BoardFlowCardContext } from '@gruenerator/contracts';

/**
 * Find the AI-column config that applies to a card. Grünerator-Spalten live as options of
 * whichever singleSelect field the board groups by (Status by default, but the
 * group-by field can change), so we scan every singleSelect field rather than
 * hardcoding Status — the first option the card sits in that carries an aiTask wins.
 */
export function getCardAiTask(fields: Field[], row: Row): BoardAiTask | undefined {
  for (const field of fields) {
    if (field.type !== 'singleSelect') continue;
    const optionId = row.cells[field.id];
    if (typeof optionId !== 'string' || !optionId) continue;
    const options = (field.typeOptions.options ?? []) as SelectOption[];
    const aiTask = options.find((o) => o.id === optionId)?.aiTask;
    if (aiTask) return aiTask;
  }
  return undefined;
}

/** Extract the title/description/url/handle the AI flow needs from the card. */
export function buildCardContext(
  row: Row,
  fields: Field[],
  aiTask: BoardAiTask
): BoardFlowCardContext {
  const title = (row.cells[FIELD_IDS.TITLE] as string) || '';
  const description = (row.cells[FIELD_IDS.DESCRIPTION] as string) || '';

  // URL source: first url-type field's cell.
  const urlField = fields.find((f) => f.type === 'url');
  const url = urlField ? (row.cells[urlField.id] as string) || undefined : undefined;

  // Apify handle: from the configured field, else the title is used server-side.
  let handle: string | undefined;
  if (aiTask.source.type === 'apify_social' && aiTask.source.handleField) {
    handle = (row.cells[aiTask.source.handleField] as string) || undefined;
  }

  return {
    title,
    description,
    ...(url && { url }),
    ...(handle && { handle }),
  };
}
