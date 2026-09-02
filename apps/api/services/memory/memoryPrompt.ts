/**
 * The memory block as the model reads it, and the numbering the `memory` tool
 * resolves `nr` against.
 *
 * The numbers are turn-local: they are positions in the list rendered for
 * this prompt, instructions first, then facts. That keeps them short and
 * closed (the tool rejects a number it did not render) and free of the `[N]`
 * shape the citation system owns. Pure module — no IO — so the prompt shape is
 * pinned by a test rather than by a live turn.
 */
import type { TurnMemories } from './memoryRetrieval.js';
import type { UserMemoryRow } from '../../database/schema/index.js';
import type { MemoryKind } from '@gruenerator/contracts';

export interface RenderedMemory {
  nr: number;
  id: string;
  kind: MemoryKind;
  text: string;
  updatedAt: Date;
}

export function numberMemories(turn: TurnMemories): RenderedMemory[] {
  const toRendered = (row: UserMemoryRow, nr: number): RenderedMemory => ({
    nr,
    id: row.id,
    kind: row.kind,
    text: row.text,
    updatedAt: row.updated_at,
  });
  let nr = 0;
  return [
    ...turn.anweisungen.map((r) => toRendered(r, ++nr)),
    ...turn.fakten.map((r) => toRendered(r, ++nr)),
  ];
}

function germanDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

const line = (m: RenderedMemory): string => `Nr. ${m.nr} (${germanDate(m.updatedAt)}): ${m.text}`;

/**
 * The two sections, without the surrounding header and rules — those are
 * added by `formatMemoryContext` in respondNode, which also wraps this text
 * as untrusted content (it is user-authored text entering the system prompt).
 * Empty string when there is nothing to show, so callers can test for it.
 */
export function renderMemoryLines(rendered: readonly RenderedMemory[]): string {
  const anweisungen = rendered.filter((m) => m.kind === 'anweisung');
  const fakten = rendered.filter((m) => m.kind === 'fakt');
  const parts: string[] = [];
  if (anweisungen.length > 0) {
    parts.push(['### Dauerhafte Anweisungen', ...anweisungen.map(line)].join('\n'));
  }
  if (fakten.length > 0) {
    parts.push(['### Fakten zur Person', ...fakten.map(line)].join('\n'));
  }
  return parts.join('\n\n');
}
