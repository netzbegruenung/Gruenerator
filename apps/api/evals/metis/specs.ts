/**
 * Eine Spec = ein Resolver des Klassifikators als geschlossene Frage mit
 * gelabeltem Korpus. Neuer Resolver: Spec hier ergänzen, `pnpm eval:metis <name>`.
 *
 * `label` und beide Antworten sind derselbe Wertebereich (Schlüssel der
 * Metis-`criteria`), damit der Vergleich ohne Übersetzung auskommt.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveGenerationScope } from '../../agents/langgraph/ChatGraph/nodes/generationResolver.js';

import type { MetisQuestion } from './metisClient.js';

export interface ResolverCase {
  id: string;
  text: string;
  label: string;
  note?: string;
}

export interface ResolverSpec {
  name: string;
  question: MetisQuestion & { type: 'choice' };
  cases: ResolverCase[];
  /** Der heutige LLM-Resolver; `null` = nichts entschieden (fällt durch). */
  baseline: (c: ResolverCase) => Promise<string | null>;
}

const here = dirname(fileURLToPath(import.meta.url));

function loadCases(file: string): ResolverCase[] {
  return readFileSync(join(here, file), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l, i) => {
      const c = JSON.parse(l) as Partial<ResolverCase>;
      if (!c.id || !c.text || !c.label) throw new Error(`${file}:${i + 1}: id/text/label fehlt`);
      return c as ResolverCase;
    });
}

const generation: ResolverSpec = {
  name: 'generation',
  question: {
    type: 'choice',
    instructions:
      'Soll diese Nachricht ein ARTEFAKT erzeugen (eine Datei, ein Bild oder einen Beitrag, der neben der Antwort entsteht)? Ein Text IN der Antwort ist kein Artefakt. Ein Verbot des Erzeugens ist keine Bestellung. Im Zweifel: keine.',
    criteria: {
      save_as_doc: 'ein Text soll als Dokument gespeichert/angelegt werden',
      sharepic: 'ein Bild mit Text darauf, für Social Media',
      image: 'ein reines Bild ohne Textebene, gemalt oder fotorealistisch',
      create_sheet: 'eine Tabelle/Kalkulation als Datei',
      create_presentation: 'Folien',
      create_pdf: 'ein PDF',
      chart: 'ein Diagramm/Chart aus Zahlen',
      keine:
        'alles andere: Social-Post oder Pressemitteilung schreiben, zusammenfassen, kürzen, prüfen, erklären, umformulieren, übersetzen, beraten, Verbote',
    },
  },
  cases: loadCases('generation.jsonl'),
  baseline: async (c) => {
    const v = await resolveGenerationScope({ userContent: c.text, conversationContext: null });
    return v === null ? null : v === 'keine' ? 'keine' : v.intent;
  },
};

export const SPECS: Record<string, ResolverSpec> = { generation };
