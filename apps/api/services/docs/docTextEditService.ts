/**
 * Targeted text edits on a collaborative document: exact replacements on the
 * document's markdown instead of the whole text re-written into the chat. Each
 * `alt` must occur exactly once, so a replacement can never land on the wrong
 * passage. The write goes through `replaceDocumentHtml` (live doc first).
 */
import TurndownService from 'turndown';

import { aiObject } from '../ai/generate.js';

import { ensureHtml } from './contentNormalization.js';
import { getDocumentHtml, replaceDocumentHtml } from './docContentService.js';

export interface TextReplacement {
  alt: string;
  neu: string;
}

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });

export async function readDocumentMarkdown(docId: string): Promise<string> {
  const { html } = await getDocumentHtml(docId);
  return html.trim() ? turndown.turndown(html) : '';
}

function occurrences(text: string, needle: string): number {
  let count = 0;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) {
    count++;
  }
  return count;
}

export type ApplyReplacementsResult = { ok: true; text: string } | { ok: false; error: string };

export function applyReplacements(
  text: string,
  replacements: readonly TextReplacement[]
): ApplyReplacementsResult {
  let out = text;
  for (const { alt, neu } of replacements) {
    if (!alt) return { ok: false, error: 'Eine Ersetzung hat keinen alten Text.' };
    const n = occurrences(out, alt);
    if (n === 0) {
      return {
        ok: false,
        error: `„${alt.slice(0, 80)}" steht so nicht im Dokument. Lies es mit read_document und nimm den Wortlaut von dort.`,
      };
    }
    if (n > 1) {
      return {
        ok: false,
        error: `„${alt.slice(0, 80)}" steht ${n}× im Dokument. Nimm mehr Kontext, damit die Stelle eindeutig ist.`,
      };
    }
    out = out.replace(alt, () => neu);
  }
  return { ok: true, text: out };
}

/** The compact before/after the person confirms — never the whole document. */
export function describeReplacements(replacements: readonly TextReplacement[]): string {
  return replacements
    .map(({ alt, neu }) => `- vorher: „${alt.slice(0, 200)}"\n  nachher: „${neu.slice(0, 200)}"`)
    .join('\n');
}

export async function writeDocumentMarkdown(
  docId: string,
  markdown: string,
  userId: string
): Promise<void> {
  await replaceDocumentHtml(docId, ensureHtml(markdown), { userId });
}

const REPLACEMENTS_SCHEMA = {
  type: 'object',
  properties: {
    ersetzungen: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        properties: {
          alt: {
            type: 'string',
            description: 'Wörtlicher Ausschnitt aus dem Dokument, genau einmal vorhanden',
          },
          neu: { type: 'string', description: 'Der neue Text an seiner Stelle' },
        },
        required: ['alt', 'neu'],
      },
    },
  },
  required: ['ersetzungen'],
} as const;

const PLAN_SYSTEM = `Du änderst ein bestehendes Dokument gezielt. Gib NUR die Stellen zurück, die sich ändern: je Stelle einen wörtlichen Ausschnitt ("alt", Zeichen für Zeichen aus dem Dokument kopiert, lang genug, dass er genau EINMAL vorkommt) und den neuen Text ("neu"). Für eine Einfügung nimm den Satz davor als "alt" und hänge den neuen Text an. Alles andere bleibt unverändert. Erfinde keine Fakten.`;

/**
 * Plans the replacements for an instruction. The model only has to find the
 * passages; uniqueness is checked here, and a miss goes back to it once.
 * Planner models in the loop could not be trusted to retype passages exactly
 * (live 11.10.2026 they stopped after reading).
 */
export async function planReplacements(
  markdown: string,
  instruction: string
): Promise<{ ok: true; ersetzungen: TextReplacement[] } | { ok: false; error: string }> {
  const generated = await aiObject<{ ersetzungen: TextReplacement[] }>({
    lane: 'universal',
    system: PLAN_SYSTEM,
    prompt: `## DOKUMENT\n${markdown.slice(0, 24_000)}\n\n## ÄNDERUNG\n${instruction}`,
    toolName: 'aendere_dokument',
    toolDescription: 'Gibt die wörtlichen Ersetzungen für die Änderung zurück.',
    schema: REPLACEMENTS_SCHEMA as unknown as Record<string, unknown>,
    validate: (input) => {
      const ersetzungen = (input as { ersetzungen?: unknown })?.ersetzungen;
      if (!Array.isArray(ersetzungen) || ersetzungen.length === 0) {
        return { ok: false, error: 'Keine Ersetzungen geliefert.' };
      }
      const pairs = ersetzungen as TextReplacement[];
      const applied = applyReplacements(markdown, pairs);
      return applied.ok
        ? { ok: true, value: { ersetzungen: pairs } }
        : { ok: false, error: applied.error };
    },
    temperature: 0.1,
    label: 'doc_text_edit',
  });
  return generated.ok
    ? { ok: true, ersetzungen: generated.data.ersetzungen }
    : { ok: false, error: generated.error };
}
