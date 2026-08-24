/**
 * Zähler für die beiden tragenden Gedächtnis-Pfade.
 *
 * Warum es das gibt: `Mem0Service` fängt Lesen und Schreiben bewusst breit ab
 * und liefert `[]` — das ist richtig, ein totes Gedächtnis darf keinen Turn
 * kosten (siehe „Graceful degradation" im Kopf von `Mem0Service.ts`). Der Preis
 * dafür ist, dass ein Totalausfall genauso aussieht wie „nichts Merkbares
 * gefunden".
 *
 * Gemessen wurde dieser Preis: `client.search is not a function` stand vom
 * 19.08. bis zum 24.08.2026 bei JEDEM Chat-Turn zweimal im Log (#2807,
 * repariert in #2810), und es fiel niemandem auf. Lesen UND Schreiben waren in
 * der Zeit tot, während die Gedächtnis-Verwaltung im UI gesund aussah — sie
 * hängt an `scroll`/`retrieve`/`upsert`, die von der Änderung nicht betroffen
 * waren.
 *
 * Ein Zähler ist die zweite Hälfte des Befunds: ein Ausfall, der nur als
 * Logzeile existiert, wird nicht bemerkt. `/health` beantwortet danach die
 * Frage „arbeitet das Gedächtnis?" ohne Log-Archäologie.
 *
 * Bewusst pro Worker und im Speicher — dieselbe Entscheidung wie bei
 * `services/ai/modelHealth.ts` und den Breakern in `services/search/`. Die App
 * fährt im Cluster-Modus, ein Worker sieht also seinen eigenen Ausschnitt; für
 * „läuft es überhaupt" genügt das, und ein geteilter Zähler bräuchte Redis auf
 * einem Pfad, der gerade beweisen soll, dass er ohne Fremdsysteme auskommt.
 */

/**
 * Die Pfade, die still ausfallen können.
 *
 * Nicht dabei ist die Verwaltung (`updateMemory`, `deleteMemory`, `deleteAll`,
 * `getMemoryHistory`): die fängt zwar ebenso ab, liefert dem Aufrufer aber
 * `null`/`false` — ein Wert, der sich von einem Erfolg unterscheidet. `search`
 * und `add` liefern `[]`, und das ist von „nichts gefunden" nicht zu trennen.
 * Genau diese Ununterscheidbarkeit zählt hier mit, nicht das Abfangen an sich.
 */
export type Mem0Operation = 'search' | 'add';

interface Counter {
  ok: number;
  failed: number;
  lastErrorAt: string | null;
}

const counters = new Map<Mem0Operation, Counter>();

function counterFor(operation: Mem0Operation): Counter {
  let entry = counters.get(operation);
  if (!entry) {
    entry = { ok: 0, failed: 0, lastErrorAt: null };
    counters.set(operation, entry);
  }
  return entry;
}

/** Ein gelungener Durchlauf. Ein leeres Ergebnis zählt als gelungen. */
export function recordMem0Success(operation: Mem0Operation): void {
  counterFor(operation).ok++;
}

/**
 * Ein Durchlauf, der in den catch gelaufen ist.
 *
 * Ohne die Fehlermeldung, mit Absicht: `/health` ist unauthentifiziert (siehe
 * `server.ts`, kein `requireAuth`), und eine rohe `error.message` traegt
 * Interna nach draussen — das `redis.error`-Feld direkt daneben laeuft aus
 * genau dem Grund durch `toUserFacingMessage()`.
 *
 * Diesen Weg hier zu gehen waere aber falsch herum: `toUserFacingMessage`
 * kollabiert alles Unbekannte auf eine generische deutsche Satzschablone, und
 * damit waere `this.client.search is not a function` — der ganze Zweck des
 * Zaehlers — zu „Da ist etwas schiefgegangen" geworden.
 *
 * Also die Arbeitsteilung sauber ziehen: das WAS steht im `log.error` neben
 * der Nutzer-ID, das OB und WANN steht hier. `/health` beantwortet „arbeitet
 * das Gedaechtnis?", nicht „woran ist es gestorben?".
 */
export function recordMem0Failure(operation: Mem0Operation): void {
  const entry = counterFor(operation);
  entry.failed++;
  entry.lastErrorAt = new Date().toISOString();
}

export interface Mem0HealthRow {
  operation: Mem0Operation;
  ok: number;
  failed: number;
  lastErrorAt: string | null;
}

/**
 * Momentaufnahme für `/health` und die Tests.
 *
 * Ohne `drain`, weil `/health` von mehreren Seiten abgefragt wird — ein
 * leerender Leser würde den Befund für den nächsten verschlucken.
 */
export function mem0HealthSnapshot(options: { drain?: boolean } = {}): Mem0HealthRow[] {
  const rows: Mem0HealthRow[] = [];
  for (const [operation, entry] of counters) {
    rows.push({ operation, ...entry });
    if (options.drain) {
      entry.ok = 0;
      entry.failed = 0;
    }
  }
  return rows;
}

export function _resetMem0HealthForTests(): void {
  counters.clear();
}
