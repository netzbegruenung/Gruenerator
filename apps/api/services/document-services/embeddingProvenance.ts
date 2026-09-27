/**
 * Das Einbettungsmodell eines Chunks als Qdrant-Payload.
 *
 * Ein Helfer und kein wiederholtes Objektliteral, aus demselben Grund wie
 * `structurePayload`: dieselben fünfzehn Upsert-Stellen spreizen ihn, und sie
 * auseinanderdriften zu lassen ist genau die Ausfallart, gegen die
 * `buildChunkPayloadFields` auf der Leseseite gebaut wurde.
 *
 * Der Wert ist eine Konstante und kein Chunk-Feld: es gibt genau ein
 * Einbettungs-Backend (#3224). Ein Punkt OHNE das Feld ist deshalb nicht
 * kaputt, sondern alt — „unbekannt, also vor dieser Änderung geschrieben",
 * dieselbe Lesart wie ein PDF-Punkt ohne gespeicherten `file_hash`. Genau
 * diese Lesart ist der Zweck: ohne sie kann ein Modellwechsel nur
 * alles-oder-nichts neu eingebettet werden, und ein halb gelaufener Umzug ist
 * weder fortsetzbar noch prüfbar.
 */

import { EMBEDDING_MODEL_NAME } from '../mistral/MistralEmbeddingService/modelConstants.js';

export interface EmbeddingProvenancePayload {
  embedding_model: string;
}

export function embeddingPayload(): EmbeddingProvenancePayload {
  return { embedding_model: EMBEDDING_MODEL_NAME };
}
