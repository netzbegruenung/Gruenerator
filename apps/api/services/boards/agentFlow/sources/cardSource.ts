/**
 * Source: card content. The card's title/description already go into the
 * instruction (see presets.buildInstruction), so this resolver adds no extra
 * context text.
 */
import { type BoardFlowCardContext, type BoardFlowSource } from '@gruenerator/contracts';

export function cardSource(
  _source: Extract<BoardFlowSource, { type: 'card' }>,
  _ctx: BoardFlowCardContext
): Promise<string> {
  return Promise.resolve('');
}
