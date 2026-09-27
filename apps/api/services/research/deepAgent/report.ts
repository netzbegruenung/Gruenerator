/**
 * Turning the agent's final state into a document.
 *
 * The agent writes `/bericht.md` into its virtual filesystem, which lives in the
 * graph state as `files`. Everything here is defensive: a run that aborts mid-way
 * still has to yield the best artifact it can, because the alternative is telling
 * someone their once-a-day research produced nothing.
 */

import { type SourceRef } from './types.js';

/** Where the lead agent is told to write. Mirrors prompts.ts. */
export const REPORT_PATH = '/bericht.md';

/** `FileData` is a v1/v2 union in deepagents: lines array or plain string. */
interface FileLike {
  content?: string | string[];
}

export function readFile(files: unknown, path: string): string | null {
  if (!files || typeof files !== 'object') return null;
  const entry = (files as Record<string, FileLike | undefined>)[path];
  const content = entry?.content;
  if (Array.isArray(content)) return content.join('\n');
  if (typeof content === 'string') return content;
  return null;
}

/** First `# ` heading, else the first non-empty line, else a fallback. */
export function extractTitle(markdown: string, fallback: string): string {
  const heading = /^#\s+(.+)$/m.exec(markdown);
  if (heading?.[1]) return heading[1].trim().slice(0, 200);
  const firstLine = markdown.split('\n').find((l) => l.trim().length > 0);
  return (firstLine?.replace(/^#+\s*/, '').trim() || fallback).slice(0, 200);
}

/**
 * Guarantee a `## Quellen` section.
 *
 * The model is told to write one and usually does, but a report whose sources
 * vanished is worse than one with a machine-appended list: the citations in the
 * text would point at nothing.
 */
export function ensureSources(markdown: string, sources: SourceRef[]): string {
  if (/^##\s+Quellen\s*$/m.test(markdown)) return markdown;
  if (sources.length === 0) return markdown;
  // A notebook document usually has no public address. Naming its origin beats
  // a line ending in a dangling em-dash, and beats an invented link outright.
  const list = sources
    .map((s, i) => `${i + 1}. ${s.title} — ${s.url || (s.origin ?? 'Grünerator-Notebook')}`)
    .join('\n');
  return `${markdown.trimEnd()}\n\n## Quellen\n\n${list}\n`;
}

const PARTIAL_NOTE =
  '> ⚠️ **Unvollständiger Bericht** — die Recherche wurde vorzeitig beendet. Die folgenden Abschnitte sind ein Zwischenstand.\n\n';

export function markPartial(markdown: string): string {
  // After the H1, so the document still opens with its title.
  const match = /^(#\s+.+\n)/.exec(markdown);
  if (!match) return PARTIAL_NOTE + markdown;
  return markdown.slice(0, match[0].length) + '\n' + PARTIAL_NOTE + markdown.slice(match[0].length);
}

/** Shortest usable report. Below this it is a stub, not a draft worth filing. */
const MIN_REPORT_CHARS = 400;

export function isUsableReport(markdown: string | null): markdown is string {
  return typeof markdown === 'string' && markdown.trim().length >= MIN_REPORT_CHARS;
}

/**
 * Removes the agent's own plumbing from a chat-facing sentence.
 *
 * The lead is told not to mention files, and mostly obliges — but it still ends
 * runs with "Der vollständige Bericht steht in der Datei `/bericht.md`." The
 * reader has the document linked next to the message; a virtual path that exists
 * only inside the agent is noise at best and confusing at worst.
 */
export function stripInternalReferences(text: string): string {
  return text
    .split(/\n{2,}/)
    .filter((para) => !/\/bericht\.md|`\/[a-z]|write_file|read_file|write_todos/i.test(para))
    .join('\n\n')
    .trim();
}

/**
 * A couple of sentences for the chat message, taken from the report's own
 * summary section.
 *
 * Needed because the lead agent frequently ends its turn with an empty message
 * after `write_file` — it considers the work delivered, which it is. Rather than
 * spend another model call on a sentence the report already contains, we read
 * the `## Zusammenfassung` block it was told to write.
 */
export function summaryFromReport(markdown: string, maxChars = 600): string | null {
  const match = /^##\s+Zusammenfassung\s*$/m.exec(markdown);
  if (!match) return null;
  const rest = markdown.slice(match.index + match[0].length);
  const paragraph = rest
    .split(/\n##\s/)[0]
    ?.replace(/^\s+/, '')
    .trim();
  if (!paragraph) return null;
  const plain = paragraph.replace(/\*\*/g, '').replace(/\n+/g, ' ').trim();
  if (plain.length <= maxChars) return plain;
  // Cut on a sentence boundary so the chat never shows half a clause.
  const cut = plain.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return lastStop > 200 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}
