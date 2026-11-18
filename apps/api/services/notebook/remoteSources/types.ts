import { type RemoteSourceId } from './ids.js';

/** Filter in UNSERER Payload-Sprache: Feld → erlaubte Werte, plus Datumsbereich. */
export interface FieldFilters {
  match: Record<string, readonly string[]>;
  published_at?: { gte?: string; lte?: string };
}

/** Ein Chunk in unserer Payload-Sprache — dieselbe Form wie ein Qdrant-Punkt. */
export interface RemoteChunk {
  id: string;
  payload: Record<string, unknown>;
}

export interface RemoteHit extends RemoteChunk {
  /** Kosinus der dichten Einbettung (`mistral-embed`), wie unser `similarity`. */
  score: number;
}

export interface RemoteSearchRequest {
  vector: number[];
  query: string;
  filters: FieldFilters;
  limit: number;
  threshold: number | null;
}

export interface FacetCount {
  value: string;
  count: number;
}

/**
 * Eine Notebook-Quelle hinter der HTTP-API eines anderen Dienstes.
 *
 * Alles, was hineingeht und herauskommt, spricht unsere Payload-Feldnamen
 * (`chunk_text`, `published_at`, `content_type`, …); die Abbildung auf die
 * fremde API passiert ausschliesslich im Adapter. Eine weitere API-Quelle ist
 * damit ein neuer Adapter plus ein Registry-Eintrag — kein Aufrufer ändert sich.
 *
 * Was eine Quelle nicht kann, steht hier nicht: Aufrufer, die mehr brauchen
 * (Dokumentlisten, Volltext, Datumsgrenzen), schalten für Remote-Sammlungen ab.
 */
export interface RemoteNotebookSource {
  id: RemoteSourceId;
  /** Steht in Fehlermeldungen: „<label> gerade nicht erreichbar". */
  label: string;
  search(request: RemoteSearchRequest): Promise<RemoteHit[]>;
  /** Je Dokument gezählt, nicht je Chunk. */
  facetCounts(field: string, filters: FieldFilters, limit: number): Promise<FacetCount[]>;
  /** Chunks eines Dokuments, sortiert nach `chunk_index`. */
  chunks(documentId: string, chunkIndexes: readonly number[]): Promise<RemoteChunk[]>;
}
