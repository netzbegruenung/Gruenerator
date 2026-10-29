/**
 * Form und Lesehilfen der Richter-Ergebnisse (`judge-verdicts.json`). Eigene
 * Datei, weil `runJudge.ts` beim Import sofort läuft und Prüfseite und Tests
 * diese Funktionen ohne Modellaufruf brauchen.
 */
import { type RubricName } from '../types.js';

export interface JudgeVerdict {
  caseId: string;
  turnIndex: number;
  rubric: RubricName;
  /** null = judge unavailable/malformed twice — reported, never failing. */
  pass: boolean | null;
  reason: string;
  /** Nur `antwortqualitaet`: Note 1–5. `pass` ist dort `note >= 4` und nur Anzeige. */
  note?: number;
}

/** Eine Zahl 1–5; ganzzahlig gerundet, alles andere ist ungültig. */
export function parseNote(content: string): { note: number; reason: string } | null {
  const stripped = content.replace(/```(?:json)?/g, '').trim();
  const candidate = stripped.startsWith('{')
    ? stripped
    : (stripped.match(/\{[\s\S]*\}/)?.[0] ?? '');
  try {
    const parsed = JSON.parse(candidate) as { note?: unknown; reason?: unknown };
    const n = typeof parsed.note === 'string' ? Number(parsed.note) : parsed.note;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 5) {
      return { note: Math.round(n), reason: String(parsed.reason ?? '') };
    }
  } catch {
    // fall through
  }
  return null;
}

/** Je Fall die schlechteste Note über alle Turns (der schwächste Turn bestimmt den Fall). */
export function noteJeFall(verdicts: readonly JudgeVerdict[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of verdicts) {
    if (v.rubric !== 'antwortqualitaet' || v.note === undefined) continue;
    const prev = out.get(v.caseId);
    out.set(v.caseId, prev === undefined ? v.note : Math.min(prev, v.note));
  }
  return out;
}

/** Rubriken, die der Richter für einen Fall verneint hat (ohne die Note). */
export function richterBefundeJeFall(verdicts: readonly JudgeVerdict[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const v of verdicts) {
    if (v.rubric === 'antwortqualitaet' || v.pass !== false) continue;
    const list = out.get(v.caseId) ?? [];
    if (!list.includes(v.rubric)) list.push(v.rubric);
    out.set(v.caseId, list);
  }
  return out;
}

/** Inhalt von `judge-verdicts.json`: die Urteile samt Kennung des Laufs, auf den sie sich beziehen. */
export interface VerdictFile {
  runId: string;
  verdicts: JudgeVerdict[];
}

/** Kennung eines Laufs: Änderungszeit von last-run.json (ISO 8601). */
export function runIdOfMtime(mtime: Date): string {
  return mtime.toISOString();
}

/**
 * Liest `judge-verdicts.json` tolerant: die alte Form (nacktes Array, ohne
 * runId) liefert `runId: null` und passt damit zu keinem Lauf.
 */
export function parseVerdictFile(raw: unknown): { runId: string | null; verdicts: JudgeVerdict[] } {
  if (Array.isArray(raw)) return { runId: null, verdicts: raw as JudgeVerdict[] };
  const o = (raw ?? {}) as Partial<VerdictFile>;
  return {
    runId: typeof o.runId === 'string' ? o.runId : null,
    verdicts: Array.isArray(o.verdicts) ? o.verdicts : [],
  };
}
