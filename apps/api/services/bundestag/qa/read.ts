/**
 * Stufe „read" des Bundestag-Q&A: jedes Dokument wird in Fenster geteilt, jedes
 * Fenster einzeln und isoliert gelesen. Ein Punkt zählt nur, wenn sein Zitat
 * im Fenster auffindbar ist (`locateQuote`); sonst entfällt er.
 */
import { type BundestagAuftrag, type BundestagPoint } from '@gruenerator/contracts';

import { createLogger } from '../../../utils/logger.js';
import { aiObject, type AiCall } from '../../ai/generate.js';
import { INTERMEDIATE_LANES } from '../../ai/intermediateLanes.js';
import { laneTarget } from '../../ai/lanes.js';
import { locateQuote } from '../../notebook/sourceCite.js';

import {
  type Budget,
  MAX_POINTS_PER_WINDOW,
  MAX_WINDOWS_PER_DOC,
  READ_CONCURRENCY,
  readWindowChars,
} from './budget.js';
import { type FetchedDoc } from './fetchTexts.js';
import { readPrompt, readSystem } from './readPrompt.js';

const log = createLogger('BundestagQaRead');

/** Ein Beleg unter dieser Länge (ein Wort, eine Zahl) steht fast überall im Text und belegt nichts. */
const MIN_QUOTE_WORDS = 4;
const MIN_QUOTE_CHARS = 25;

export interface ReadResult {
  doc: FetchedDoc;
  relevant: boolean;
  points: BundestagPoint[];
  droppedPoints: number;
  windowsRead: number;
  windowsTotal: number;
  skipped: 'budget' | 'deadline' | 'missing' | null;
  /** Nur mit Fokus: stand der Anker im Text? Ohne Fokus `null`. */
  fokusFound?: boolean | null;
  /** `aiObject` meldet keine Tokens; bis das ändert, bleibt es null statt erfunden. */
  /** Summe der Fensterlängen, die tatsächlich ans Modell gingen. */
  charsRead: number;
  usage: { inputTokens: number; outputTokens: number } | null;
}

export interface ReadParams {
  question: string;
  keywords: string[];
  auftrag: BundestagAuftrag;
  docs: FetchedDoc[];
  budget: Budget;
  signal?: AbortSignal;
  /** `AiCall.pinned`; nur der Vergleichslauf aus Task 10 setzt es. */
  target?: AiCall['pinned'];
  /** Abschnitt, Artikel oder Paragraf, auf den sich das Lesen richtet („Artikel 3", „§ 14", „Kosten"). */
  fokus?: string | undefined;
}

const READ_JSON_SCHEMA = {
  type: 'object',
  properties: {
    relevant: { type: 'boolean' },
    punkte: {
      type: 'array',
      items: {
        type: 'object',
        properties: { aussage: { type: 'string' }, zitat: { type: 'string' } },
        required: ['aussage', 'zitat'],
      },
    },
  },
  required: ['relevant', 'punkte'],
};

interface RawPoint {
  aussage: string;
  zitat: string;
}
interface RawWindow {
  relevant: boolean;
  punkte: RawPoint[];
}

function validateWindow(input: unknown) {
  const o = input as { relevant?: unknown; punkte?: unknown } | null;
  if (!o || typeof o.relevant !== 'boolean' || !Array.isArray(o.punkte)) {
    return { ok: false as const, error: 'relevant/punkte fehlen' };
  }
  const punkte: RawPoint[] = [];
  for (const p of o.punkte) {
    const q = p as { aussage?: unknown; zitat?: unknown } | null;
    if (typeof q?.aussage === 'string' && typeof q.zitat === 'string') {
      punkte.push({ aussage: q.aussage, zitat: q.zitat });
    }
  }
  return {
    ok: true as const,
    value: { relevant: o.relevant, punkte: punkte.slice(0, MAX_POINTS_PER_WINDOW) } as RawWindow,
  };
}

/** Das Modell, das den Aufruf tatsächlich bedient: `target` hat Vorrang vor der Lane. */
function modelFor(target: AiCall['pinned']): string {
  if (target) {
    return typeof target === 'string' ? INTERMEDIATE_LANES[target].model : target.model;
  }
  return laneTarget('bundestag_read').model ?? '';
}

/** Teilt an Absatzgrenzen in Stücke bis `size`; ein einzelner Riesenabsatz wird hart geschnitten. */
export function splitWindows(text: string, size: number): string[] {
  const windows: string[] = [];
  let current = '';
  const push = () => {
    if (current) windows.push(current);
    current = '';
  };
  for (const para of text.split('\n\n')) {
    if (para.length > size) {
      push();
      for (let i = 0; i < para.length; i += size) windows.push(para.slice(i, i + size));
      continue;
    }
    if (current && current.length + 2 + para.length > size) push();
    current = current ? `${current}\n\n${para}` : para;
  }
  push();
  return windows;
}

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Muster für den Fokus: „Art."/„Artikel" und „§"/„Paragraf" werden vereinheitlicht,
 * „Artikel 3 Absatz 2" gilt als „Artikel 3". Alles andere ist eine Überschrift
 * oder ein Stichwort („Begründung", „Erfüllungsaufwand"). `null` bei leerem Fokus.
 */
export function focusPattern(fokus: string): string | null {
  const f = fokus.trim();
  if (!f) return null;
  const art = /^(?:artikel|art\.?)\s*(\d+\s?[a-z]?)(?![\p{L}\d])/iu.exec(f);
  if (art) return `(?:Artikel|Art\\.)\\s*${escapeRe(art[1]!.replace(/\s+/g, ''))}(?![\\p{L}\\d])`;
  const par = /^(?:§§?|paragraf|paragraph)\s*(\d+\s?[a-z]?)(?![\p{L}\d])/iu.exec(f);
  if (par)
    return `(?:§§?|Paragraf|Paragraph)\\s*${escapeRe(par[1]!.replace(/\s+/g, ''))}(?![\\p{L}\\d])`;
  return escapeRe(f).replace(/\s+/g, '\\s+');
}

/**
 * Wie gut ein Fenster den Anker trägt: jede Zeile, die mit dem Anker BEGINNT
 * (Überschrift, auch „Zu Artikel 3" in der Begründung), zählt 10, jede weitere
 * Erwähnung 1. 0 heißt: der Anker steht nicht im Fenster.
 */
export function focusScore(window: string, fokus: string): number {
  const pattern = focusPattern(fokus);
  if (!pattern) return 0;
  const head = new RegExp(`^\\s*(?:#+\\s*)?(?:Zu\\s+)?${pattern}`, 'imu');
  const any = new RegExp(pattern, 'giu');
  let score = 0;
  for (const line of window.split('\n')) {
    if (head.test(line)) score += 10;
  }
  score += window.match(any)?.length ?? 0;
  return score;
}

/** Indizes der zu lesenden Fenster, aufsteigend. */
function pickWindows(
  windows: string[],
  auftrag: BundestagAuftrag,
  keywords: string[],
  fokus?: string
): number[] {
  if (windows.length <= MAX_WINDOWS_PER_DOC) return windows.map((_, i) => i);
  const focused = fokus
    ? windows
        .map((w, index) => ({ index, score: focusScore(w, fokus) }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, MAX_WINDOWS_PER_DOC)
        .map((s) => s.index)
    : [];
  if (focused.length > 0) return focused.sort((a, b) => a - b);
  if (auftrag === 'zusammenfassung') return [0, 1, 2];
  const lower = keywords.map((k) => k.toLowerCase());
  const scored = windows.slice(1).map((w, i) => {
    const hay = w.toLowerCase();
    return { index: i + 1, hits: lower.reduce((n, k) => n + (hay.includes(k) ? 1 : 0), 0) };
  });
  // Früheres Fenster gewinnt bei Gleichstand (stabile Sortierung nach Index).
  scored.sort((a, b) => b.hits - a.hits || a.index - b.index);
  const rest = scored.slice(0, MAX_WINDOWS_PER_DOC - 1).map((s) => s.index);
  return [0, ...rest].sort((a, b) => a - b);
}

/** Lässt höchstens `limit` Aufgaben gleichzeitig laufen. */
function createLimiter(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= limit) return;
    const run = queue.shift();
    if (run) {
      active++;
      run();
    }
  };
  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}

interface Plan {
  doc: FetchedDoc;
  total: number;
  /** Fenster, die gelesen werden (Text + Teil-Nummer, 1-basiert). */
  picked: { text: string; part: number }[];
  skipped: ReadResult['skipped'];
  fokusFound: boolean | null;
}

export async function readDocuments({
  question,
  keywords,
  auftrag,
  docs,
  budget,
  signal,
  target,
  fokus,
}: ReadParams): Promise<ReadResult[]> {
  const startedAt = Date.now();
  const size = readWindowChars(modelFor(target));
  const limit = createLimiter(READ_CONCURRENCY);

  // Budget wird vorab in Dokumentreihenfolge verteilt: so hängt es nicht vom Zufall der Laufzeiten ab.
  let reserved = 0;
  const plans: Plan[] = docs.map((doc) => {
    if (doc.textSource === 'missing' || !doc.text) {
      return { doc, total: 0, picked: [], skipped: 'missing', fokusFound: fokus ? false : null };
    }
    const windows = splitWindows(doc.text, size);
    const picked: Plan['picked'] = [];
    for (const index of pickWindows(windows, auftrag, keywords, fokus)) {
      const text = windows[index]!;
      if (reserved >= budget.maxReadChars) break;
      reserved += text.length;
      picked.push({ text, part: index + 1 });
    }
    return {
      doc,
      total: windows.length,
      picked,
      skipped: picked.length === 0 ? 'budget' : null,
      fokusFound: fokus ? windows.some((w) => focusScore(w, fokus) > 0) : null,
    };
  });

  const readOne = async (plan: Plan): Promise<ReadResult> => {
    const { doc, total, picked } = plan;
    // Steht der Anker nirgends im Dokument, liest es ohne Schwerpunkt statt leer auszugehen.
    const lensFokus = plan.fokusFound ? fokus : undefined;
    const result: ReadResult = {
      doc,
      relevant: false,
      points: [],
      droppedPoints: 0,
      windowsRead: 0,
      windowsTotal: total,
      skipped: plan.skipped,
      fokusFound: plan.fokusFound,
      charsRead: 0,
      usage: null,
    };
    if (plan.skipped) return result;

    await Promise.all(
      picked.map((win) =>
        limit(async () => {
          if (signal?.aborted || Date.now() - startedAt >= budget.deadlineMs) return;
          result.windowsRead++;
          result.charsRead += win.text.length;
          const remaining = Math.max(1, budget.deadlineMs - (Date.now() - startedAt));
          const res = await aiObject<RawWindow>({
            lane: 'bundestag_read',
            ...(target ? { pinned: target } : {}),
            // Kein `json: true`: das erzwungene Tool liefert die Struktur, und Mistral (letzter Rückfall) lehnt json_object neben erzwungenem Tool ab.
            temperature: 0,
            maxOutputTokens: 1500,
            timeoutMs: remaining,
            // Ein zweiter Versuch würde die Deadline überschreiten; ein Fenster, dessen JSON einmal scheitert, entfällt.
            attempts: 1,
            system: readSystem(auftrag, lensFokus),
            prompt: readPrompt(
              question,
              auftrag,
              {
                ref: doc.ref,
                typ: doc.drucksachetyp,
                datum: doc.datum,
                urheber: doc.urheber,
                teil: win.part,
                teile: total,
              },
              win.text,
              lensFokus
            ),
            toolName: 'belege_melden',
            toolDescription: 'Melde belegte Aussagen mit wörtlichem Zitat aus dem Ausschnitt.',
            schema: READ_JSON_SCHEMA,
            validate: validateWindow,
            label: 'bundestag:read',
          });
          if (!res.ok) {
            // Ein gescheitertes Fenster zählt als gelesen ohne Punkte; das Dokument fällt nicht aus.
            log.warn(`Fenster ${win.part}/${total} von ${doc.ref} fehlgeschlagen: ${res.error}`);
            return;
          }
          if (res.data.relevant) result.relevant = true;
          for (const p of res.data.punkte) {
            const hit = locateQuote(win.text, p.zitat);
            const words = hit.found ? hit.matched.trim().split(/\s+/).length : 0;
            if (
              !hit.found ||
              words < MIN_QUOTE_WORDS ||
              hit.matched.trim().length < MIN_QUOTE_CHARS ||
              !p.aussage.trim()
            ) {
              result.droppedPoints++;
              continue;
            }
            result.points.push({ aussage: p.aussage, zitat: hit.matched, method: hit.method });
          }
        })
      )
    );

    if (result.windowsRead === 0) result.skipped = 'deadline';
    return result;
  };

  return Promise.all(plans.map(readOne));
}
