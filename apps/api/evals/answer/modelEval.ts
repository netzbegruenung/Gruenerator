/**
 * Modellvergleich auf LV-Notebooks: Gemma 4 (Mittel) gegen Mistral Medium 3.5
 * gegen Mistral Large 4 (Ultra), dazu Large 4 mit viel mehr Kontext.
 *
 *   EVAL_PHASE=probe   npx tsx evals/answer/modelEval.ts   # nur Suche, Treffer je Fall
 *   EVAL_PHASE=answers npx tsx evals/answer/modelEval.ts   # Antworten + Zeiten
 *
 * Fährt den Produktions-Stream (`handleNotebookStream`) wie generateAnswers.ts.
 * Die `large4`-Varianten setzen Ultra = `mistral-large-4` voraus (PR #4192);
 * ohne ihn misst `gruenerator-ultra` Medium 3.5. Ergebnisse vom 06.10.2026:
 * model-eval-2026-10-06.md.
 * `pinProfiles` fixiert `deep` auf den schmalen Stand vor dem Lauf und borgt
 * sich `ultra` für die breite Variante — `getNotebookDepthProfile` gibt das
 * Profil-Objekt selbst zurück.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

dotenv.config();

const { handleNotebookStream } = await import('../../routes/chat/notebookStreamCore.js');
const { notebookQAService } = await import('../../services/notebook/index.js');
const { getNotebookDepthProfile } = await import('../../config/notebookDepthProfiles.js');

import { type NotebookDepth } from '@gruenerator/contracts';

import { type NotebookStreamOptions } from '../../routes/chat/notebookStreamCore.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, process.env.EVAL_OUT ?? 'model-eval-answers.json');
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 2);
const WIDE_PASSAGES = Number(process.env.EVAL_WIDE_PASSAGES ?? 100);

type Variant = 'gemma' | 'medium35' | 'large4' | 'large4-wide' | 'gemma-wide';
const VARIANTS: Record<Variant, { model: string; depth: NotebookDepth }> = {
  gemma: { model: 'gruenerator-medium', depth: 'deep' },
  medium35: { model: 'mistral-medium-3.5', depth: 'deep' },
  large4: { model: 'gruenerator-ultra', depth: 'deep' },
  'large4-wide': { model: 'gruenerator-ultra', depth: 'ultra' },
  'gemma-wide': { model: 'gruenerator-medium', depth: 'ultra' },
};

interface ModelCase {
  id: string;
  collectionId: string;
  kind: 'fakt' | 'position' | 'ueberblick';
  question: string;
}

export const MODEL_CASES: ModelCase[] = [
  // Bayern
  {
    id: 'by-fakt',
    collectionId: 'bayern-system',
    kind: 'fakt',
    question: 'Wer sind die Landesvorsitzenden der bayerischen Grünen?',
  },
  {
    id: 'by-position',
    collectionId: 'bayern-system',
    kind: 'position',
    question: 'Was fordern die Grünen in Bayern beim Ausbau der Windkraft?',
  },
  {
    id: 'by-ueberblick',
    collectionId: 'bayern-system',
    kind: 'ueberblick',
    question:
      'Gib mir einen Überblick über alle Positionen der bayerischen Grünen zur Landwirtschaft und zum Artenschutz.',
  },
  // Berlin
  {
    id: 'be-fakt',
    collectionId: 'berlin-system',
    kind: 'fakt',
    question: 'Wann ist die nächste Wahl zum Berliner Abgeordnetenhaus?',
  },
  {
    id: 'be-position',
    collectionId: 'berlin-system',
    kind: 'position',
    question: 'Was wollen die Berliner Grünen gegen steigende Mieten tun?',
  },
  {
    id: 'be-ueberblick',
    collectionId: 'berlin-system',
    kind: 'ueberblick',
    question:
      'Fasse zusammen, was die Berliner Grünen zur Verkehrswende fordern – ÖPNV, Radverkehr und Autoverkehr.',
  },
  // Hessen
  {
    id: 'he-position',
    collectionId: 'hessen-system',
    kind: 'position',
    question: 'Was sagen die hessischen Grünen zur Bildungspolitik und zu Schulen?',
  },
  {
    id: 'he-ueberblick',
    collectionId: 'hessen-system',
    kind: 'ueberblick',
    question:
      'Welche Forderungen stellen die hessischen Grünen an die Landesregierung? Gib einen strukturierten Überblick.',
  },
  {
    id: 'he-fakt',
    collectionId: 'hessen-system',
    kind: 'fakt',
    question: 'Wer sind die Landesvorsitzenden der Grünen in Hessen?',
  },
  // Thüringen
  {
    id: 'th-position',
    collectionId: 'thueringen-system',
    kind: 'position',
    question: 'Was fordern die Thüringer Grünen für den ländlichen Raum?',
  },
  {
    id: 'th-fakt',
    collectionId: 'thueringen-system',
    kind: 'fakt',
    question: 'Wer sind die Landessprecher*innen der Grünen in Thüringen?',
  },
  {
    id: 'th-ueberblick',
    collectionId: 'thueringen-system',
    kind: 'ueberblick',
    question: 'Gib einen strukturierten Überblick über das Wahlprogramm der Thüringer Grünen.',
  },
  // Brandenburg
  {
    id: 'bb-position',
    collectionId: 'brandenburg-system',
    kind: 'position',
    question: 'Was sagen die Brandenburger Grünen zum Wassermangel und zum Wasserhaushalt?',
  },
  {
    id: 'bb-ueberblick',
    collectionId: 'brandenburg-system',
    kind: 'ueberblick',
    question:
      'Gib einen Überblick über die Energiepolitik der Brandenburger Grünen über alle Dokumente hinweg.',
  },
  // Mecklenburg-Vorpommern
  {
    id: 'mv-position',
    collectionId: 'mecklenburg-vorpommern-system',
    kind: 'position',
    question: 'Was fordern die Grünen in Mecklenburg-Vorpommern zum Tourismus und Naturschutz?',
  },
  {
    id: 'mv-ueberblick',
    collectionId: 'mecklenburg-vorpommern-system',
    kind: 'ueberblick',
    question:
      'Fasse zusammen, wie sich die Grünen in Mecklenburg-Vorpommern zur Landtagswahl 2026 aufstellen: Kandidierende, Schwerpunkte und Forderungen.',
  },
  // Sachsen-Anhalt
  {
    id: 'lsa-position',
    collectionId: 'sachsen-anhalt-system',
    kind: 'position',
    question: 'Was sagen die Grünen in Sachsen-Anhalt zur Ansiedlung von Industrie und zu Intel?',
  },
  {
    id: 'lsa-ueberblick',
    collectionId: 'sachsen-anhalt-system',
    kind: 'ueberblick',
    question:
      'Gib einen Überblick über die Themen, zu denen sich die Grünen in Sachsen-Anhalt in den letzten Monaten geäußert haben.',
  },
  // Saarland
  {
    id: 'sl-position',
    collectionId: 'saarland-system',
    kind: 'position',
    question: 'Welche Positionen haben die Saar-Grünen zur Transformation der Stahlindustrie?',
  },
  {
    id: 'sl-ueberblick',
    collectionId: 'saarland-system',
    kind: 'ueberblick',
    question:
      'Welche Forderungen haben die Grünen im Saarland zur Verkehrspolitik, über Programme und Pressemitteilungen hinweg?',
  },
  // Österreich
  {
    id: 'at-position',
    collectionId: 'oesterreich-gruene-system',
    kind: 'position',
    question: 'Was fordern die Grünen in Österreich beim Klimaschutz?',
  },
  {
    id: 'at-ueberblick',
    collectionId: 'oesterreich-gruene-system',
    kind: 'ueberblick',
    question:
      'Gib einen strukturierten Überblick über die sozialpolitischen Forderungen der österreichischen Grünen.',
  },
  {
    id: 'at-fakt',
    collectionId: 'oesterreich-gruene-system',
    kind: 'fakt',
    question: 'Wer ist Bundessprecherin bzw. Bundessprecher der Grünen in Österreich?',
  },
];

export interface ModelAnswer {
  caseId: string;
  variant: Variant;
  question: string;
  answer: string;
  citations: { index: string; title: string; url: string | null; text: string }[];
  passages: number;
  fallback: unknown[];
  searchMs: number;
  /** response_start → erstes text_delta: was das Modell an Wartezeit kostet. */
  ttftMs: number | null;
  /** response_start → erstes reasoning_delta; null = das Modell hat nicht gedacht. */
  reasoningStartMs: number | null;
  reasoningChars: number;
  /** response_start → completion. */
  generateMs: number | null;
  totalMs: number;
}

/**
 * Fixiert die beiden Tiefen auf die Zahlen vom 06.10.2026, unabhängig davon,
 * was `notebookDepthProfiles.ts` heute sagt: `deep` = schmal (40 → 18, der
 * Stand vor dem Lauf), `ultra` = breit (wie deep, nur `WIDE_PASSAGES`).
 * Schreibt in die Profil-Objekte dieses Prozesses — nur für dieses Skript.
 */
function pinProfiles(): void {
  const deep = getNotebookDepthProfile('deep');
  Object.assign(deep, {
    searchLimit: 40,
    recallLimitFloor: 80,
    threshold: 0.35,
    sortLimit: { single: 40, multi: 60 },
    rerankInput: 40,
    rerankOutput: 18,
    queryVariants: 1,
    history: false,
    queryRewrite: true,
  });
  Object.assign(getNotebookDepthProfile('ultra'), {
    ...deep,
    searchLimit: WIDE_PASSAGES,
    recallLimitFloor: WIDE_PASSAGES,
    sortLimit: { single: WIDE_PASSAGES, multi: WIDE_PASSAGES },
    rerankInput: WIDE_PASSAGES,
    rerankOutput: WIDE_PASSAGES,
  });
}

function makeReqRes() {
  const sent: { event: string; data: Record<string, unknown>; at: number }[] = [];
  const req = { on: () => {} } as unknown as NotebookStreamOptions['req'];
  const res = {
    headersSent: true,
    write: () => {},
    end: () => {},
    setHeader: () => {},
    flushHeaders: () => {},
  } as unknown as NotebookStreamOptions['res'];
  const sse = {
    send: (event: string, data: Record<string, unknown>) =>
      sent.push({ event, data, at: Date.now() }),
    end: () => {},
    isEnded: () => false,
  } as unknown as NonNullable<NotebookStreamOptions['sse']>;
  return { req, res, sse, sent };
}

async function runOne(c: ModelCase, variant: Variant): Promise<ModelAnswer | null> {
  const { model, depth } = VARIANTS[variant];
  const { req, res, sse, sent } = makeReqRes();
  const t0 = Date.now();
  try {
    await handleNotebookStream({
      req,
      res,
      sse,
      messages: [{ role: 'user', content: c.question }],
      collectionId: c.collectionId,
      userId: 'SYSTEM',
      mode: depth,
      model,
      closeStream: false,
    });
  } catch (error) {
    console.error(`[${c.id}::${variant}] threw:`, error);
    return null;
  }
  const at = (name: string) => sent.find((e) => e.event === name)?.at ?? null;
  const completion = [...sent].reverse().find((e) => e.event === 'completion');
  if (!completion) {
    console.warn(`[${c.id}::${variant}] no completion`);
    return null;
  }
  const start = at('response_start');
  const firstDelta = at('text_delta');
  const searchDone = at('search_complete');
  const raw = Array.isArray(completion.data.citations) ? completion.data.citations : [];
  return {
    caseId: c.id,
    variant,
    question: c.question,
    answer: typeof completion.data.answer === 'string' ? completion.data.answer : '',
    citations: raw.map((e) => {
      const x = (e ?? {}) as {
        index?: unknown;
        document_title?: unknown;
        source_url?: unknown;
        cited_text?: unknown;
      };
      return {
        index: String(x.index ?? ''),
        title: typeof x.document_title === 'string' ? x.document_title : '',
        url: typeof x.source_url === 'string' ? x.source_url : null,
        text: typeof x.cited_text === 'string' ? x.cited_text : '',
      };
    }),
    passages: Array.isArray(completion.data.sources) ? completion.data.sources.length : 0,
    fallback: sent.filter((e) => e.event === 'fallback').map((e) => e.data),
    searchMs: (searchDone ?? t0) - t0,
    ttftMs: start && firstDelta ? firstDelta - start : null,
    reasoningStartMs: start && at('reasoning_delta') ? at('reasoning_delta')! - start : null,
    reasoningChars: sent
      .filter((e) => e.event === 'reasoning_delta')
      .reduce((n, e) => n + String(e.data.text ?? '').length, 0),
    generateMs: start ? completion.at - start : null,
    totalMs: completion.at - t0,
  };
}

async function probe(): Promise<void> {
  for (const c of MODEL_CASES) {
    const ctx = await notebookQAService.getSearchContext({
      question: c.question,
      collectionId: c.collectionId,
      userId: 'SYSTEM',
      depth: 'deep',
      queries: [c.question],
    });
    console.log(
      `${c.id.padEnd(15)} results=${String(ctx?.sortedResults.length ?? 0).padStart(3)} top=${ctx?.evidenceTop?.toFixed(3) ?? '-'}`
    );
  }
}

async function answers(): Promise<void> {
  pinProfiles();
  const only = process.env.EVAL_VARIANTS?.split(',') as Variant[] | undefined;
  const variants = only ?? (Object.keys(VARIANTS) as Variant[]);
  const done: ModelAnswer[] = existsSync(OUT)
    ? (JSON.parse(readFileSync(OUT, 'utf8')) as ModelAnswer[])
    : [];
  const have = new Set(done.map((a) => `${a.caseId}::${a.variant}`));
  const work: { c: ModelCase; v: Variant }[] = [];
  const onlyCases = process.env.EVAL_CASES?.split(',');
  for (const c of MODEL_CASES.filter((x) => !onlyCases || onlyCases.includes(x.id))) {
    const order = [...variants].sort(() => Math.random() - 0.5);
    for (const v of order) if (!have.has(`${c.id}::${v}`)) work.push({ c, v });
  }
  console.log(`Running ${work.length} answers (concurrency ${CONCURRENCY})`);
  let cursor = 0;
  let n = 0;
  async function worker(): Promise<void> {
    while (cursor < work.length) {
      const item = work[cursor++];
      if (!item) continue;
      const r = await runOne(item.c, item.v);
      n++;
      if (r) {
        done.push(r);
        writeFileSync(OUT, `${JSON.stringify(done, null, 2)}\n`);
      }
      console.log(
        `[${n}/${work.length}] ${item.c.id}::${item.v} ${r ? `ttft=${r.ttftMs}ms gen=${r.generateMs}ms think=${r.reasoningChars} passages=${r.passages}${r.fallback.length ? ' FALLBACK' : ''}` : 'FAILED'}`
      );
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
}

const phase = process.env.EVAL_PHASE ?? 'probe';
await (phase === 'answers' ? answers() : probe());
process.exit(0);
