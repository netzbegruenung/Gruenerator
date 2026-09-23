/**
 * Der Stand eines „Neu indexieren" — gelesen aus EINER Abfrage des Notebooks,
 * nicht je Dokument aus `/documents/:id/status`. Der Statuspfad antwortet nur
 * der Eigentümer*in (Mitbearbeitende bekamen 404 und sahen nie ein Ergebnis),
 * und bei „Alle neu indexieren" liefe sonst je Quelle ein eigener Poller.
 */
export interface ReindexWatchDoc {
  id: string;
  status?: string | null;
  processing_error?: string | null;
}

export interface ReindexSettlement {
  /** Noch in der Warteschlange oder in Arbeit. */
  running: string[];
  /** Gescheitert, die Quelle ist nicht durchsuchbar. */
  failed: Array<[id: string, reason: string]>;
  /** Gescheitert, die alte Fassung blieb durchsuchbar — Hinweis, kein Fehlerzustand. */
  keptOld: string[];
  /** Fertig ohne Befund. */
  done: string[];
}

const IN_FLIGHT = new Set(['uploaded', 'processing', 'pending']);

export function settleReindex(
  watched: readonly string[],
  docs: readonly ReindexWatchDoc[]
): ReindexSettlement {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const out: ReindexSettlement = { running: [], failed: [], keptOld: [], done: [] };
  for (const id of watched) {
    const doc = byId.get(id);
    // Aus dem Notebook entfernt: nichts mehr zu beobachten.
    if (!doc) continue;
    if (doc.status && IN_FLIGHT.has(doc.status)) out.running.push(id);
    else if (doc.status === 'failed')
      out.failed.push([id, doc.processing_error || 'Das Dokument konnte nicht gelesen werden.']);
    else if (doc.processing_error) out.keptOld.push(doc.processing_error);
    else out.done.push(id);
  }
  return out;
}

/** Wie beim Upload: nach so langer Zeit ist das Ergebnis unbekannt, nicht „läuft noch". */
export const REINDEX_GIVE_UP_MS = 15 * 60 * 1000;

export const REINDEX_TIMEOUT_MESSAGE =
  'Die Verarbeitung dauert ungewöhnlich lange. Das Dokument ist noch nicht durchsuchbar.';

/** Trennt beobachtete Quellen in aufgegebene und weiter laufende. */
export function splitTimedOut(
  ids: readonly string[],
  startedAt: ReadonlyMap<string, number>,
  now: number,
  limitMs: number = REINDEX_GIVE_UP_MS
): { timedOut: string[]; running: string[] } {
  const timedOut: string[] = [];
  const running: string[] = [];
  for (const id of ids) {
    const start = startedAt.get(id);
    if (start !== undefined && now - start >= limitMs) timedOut.push(id);
    else running.push(id);
  }
  return { timedOut, running };
}
