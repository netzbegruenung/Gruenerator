/**
 * Compat-Schicht für die von Qdrant entfernte `search()`-Methode.
 *
 * `@qdrant/js-client-rest` hat `QdrantClient.search()` mit 1.19.0 gestrichen;
 * alles läuft jetzt über `query()`. `mem0ai@3.1.6` deklariert den Client als
 * optionale Peer-Dependency mit `^1.18.0` — der Caret lässt 1.19 durch, und
 * mem0s Qdrant-Store ruft in seinem `search()` weiterhin `client.search(...)`.
 * Ergebnis: `TypeError: this.client.search is not a function`.
 *
 * Getroffen ist NICHT nur das Lesen. `addToVectorStore()` holt sich vor jeder
 * Extraktion die 10 nächsten Nachbarn als Dedupe-Kontext (`vectorStore.search`,
 * ungeschützt) — der Schreibpfad stirbt also an derselben Zeile, bevor das
 * Extraktions-LLM überhaupt läuft. Beide Pfade fangen in `Mem0Service` breit ab
 * und liefern `[]`, deshalb war der Ausfall lautlos: das Gedächtnis war tot,
 * ohne dass ein Turn fehlschlug.
 *
 * Wir reparieren die Naht, an der wir sie besitzen: `buildMem0Config()` reicht
 * mem0 ohnehin einen fertigen Client herein (wegen Basic Auth). Diese Datei
 * hängt dort ein `search()` an, das auf `query()` übersetzt — statt `mem0ai` zu
 * patchen oder unsere eigene Qdrant-Abhängigkeit auf 1.18 festzuhalten. Unser
 * eigener Code (`QdrantService`) nutzt bereits ausschliesslich `query()` und
 * bleibt so auf der aktuellen Version.
 *
 * Der Shim ist ein Polyfill: bringt der Client eines Tages wieder ein eigenes
 * `search()` mit, gewinnt das native — dann kann diese Datei weg.
 */

import { type QdrantClient } from '@qdrant/js-client-rest';

import { createLogger } from '../../utils/logger.js';

const log = createLogger('Mem0QdrantCompat');

/**
 * Argumente, die mem0s Qdrant-Store an das entfernte `search()` übergibt.
 * Bewusst nur die Felder, die 1.18 kannte — mehr braucht der Aufrufer nicht.
 */
type RemovedSearchArgs = {
  vector: number[];
  filter?: Record<string, unknown> | null;
  limit?: number;
  offset?: number;
  with_payload?: boolean;
  with_vector?: boolean;
  score_threshold?: number;
};

type ScoredPoint = Awaited<ReturnType<QdrantClient['query']>>['points'][number];

/**
 * Defaults aus `@qdrant/js-client-rest@1.18.0`, `QdrantClient.search()`.
 *
 * `with_payload` ist hier das Load-Bearing-Stück: die alte Signatur setzte es
 * auf `true`, `query()` reicht `undefined` unverändert an den Server durch.
 * mem0 übergibt das Feld nicht und liest danach `hit.payload.data` — ohne
 * diesen Default kämen leere Payloads zurück und jede Erinnerung wäre ein
 * leerer String statt eines Fehlers.
 */
const SEARCH_DEFAULTS = {
  limit: 10,
  offset: 0,
  with_payload: true,
  with_vector: false,
} as const;

/**
 * Hängt dem Client ein `search()` an, das auf `query()` übersetzt.
 *
 * Mutiert die übergebene Instanz (in `buildMem0Config()` frisch erzeugt und
 * exklusiv für mem0) und gibt sie zurück.
 */
export function withRemovedSearchCompat(client: QdrantClient): QdrantClient {
  const candidate = client as QdrantClient & {
    search?: (collectionName: string, args: RemovedSearchArgs) => Promise<ScoredPoint[]>;
  };

  if (typeof candidate.search === 'function') {
    // Der Client kann es wieder selbst — Finger weg.
    return client;
  }

  log.debug('[Mem0] Qdrant-Client ohne search(): Compat-Shim auf query() aktiv');

  candidate.search = async (collectionName, args) => {
    const response = await client.query(collectionName, {
      query: args.vector,
      ...(args.filter ? { filter: args.filter } : {}),
      limit: args.limit ?? SEARCH_DEFAULTS.limit,
      offset: args.offset ?? SEARCH_DEFAULTS.offset,
      with_payload: args.with_payload ?? SEARCH_DEFAULTS.with_payload,
      with_vector: args.with_vector ?? SEARCH_DEFAULTS.with_vector,
      ...(args.score_threshold === undefined ? {} : { score_threshold: args.score_threshold }),
    });

    // `search()` lieferte die Trefferliste direkt, `query()` verpackt sie.
    return response.points;
  };

  return candidate;
}
