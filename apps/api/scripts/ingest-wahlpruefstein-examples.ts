/**
 * Liest die Wahlprüfstein-Antworten der Bundespartei in die Qdrant-Sammlung
 * `wahlpruefstein_examples` — ein Punkt je Frage/Antwort-Paar.
 *
 *   npx tsx apps/api/scripts/ingest-wahlpruefstein-examples.ts           # Probelauf: zählt nur
 *   npx tsx apps/api/scripts/ingest-wahlpruefstein-examples.ts --apply   # schreibt
 *
 * Quelle: `<INTERN_CONTENT_DIR>/_korpus/wahlpruefsteine/antworten.jsonl` (parteiintern).
 * Die Kataloge des Wahlprüfstein-Evals (`_korpus/wahlpruefsteine/eval/*`)
 * bleiben draußen — sonst fände das Beispielwerkzeug im Eval die Musterlösung.
 * Die Punkt-IDs sind aus der Paar-ID abgeleitet, ein zweiter Lauf überschreibt
 * also statt zu verdoppeln.
 *
 * Die Sammlung ist zugleich das System-Notebook `wahlpruefsteine-system`: jedes
 * Paar ein eigenes Dokument (`document_id`, `chunk_index` 0, `chunk_text`,
 * `title`). Ein Lauf ersetzt die ganze Payload und damit auch die Themen der
 * NLP-Anreicherung; der nächtliche Lauf vergibt sie neu.
 *
 * Voraussetzung: das Backend ist einmal hochgefahren, damit `QdrantService.init()`
 * die Sammlung aus qdrantCollectionsSchema.ts angelegt hat.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import * as dotenv from 'dotenv';
import { v5 as uuidv5 } from 'uuid';

dotenv.config();

const { getQdrantInstance } = await import('../database/services/QdrantService/index.js');
const { mistralEmbeddingService } = await import('../services/mistral/index.js');
const { WAHLPRUEFSTEIN_WAHL_LABELS } = await import('../config/systemCollectionsConfig.js');

const COLLECTION = 'wahlpruefstein_examples';
const BATCH = 16;

interface Pair {
  id: string;
  wahl: 'btw21' | 'ew24' | 'btw25';
  ebene: 'bund' | 'europa';
  jahr: number;
  verband: string;
  n: number;
  frage: string;
  position: string | null;
  antwort: string;
  titel: string | null;
  quelle: string;
}

function internDir(): string {
  const dir =
    process.env.INTERN_CONTENT_DIR ??
    path.resolve(import.meta.dirname, '../../../.external/gruenerator-intern');
  if (!existsSync(dir)) throw new Error(`INTERN_CONTENT_DIR fehlt: ${dir}`);
  return dir;
}

const baseName = (file: string) => file.replace(/\.[a-z]+$/i, '');

/** `<Antwortdokument>|<Wahl>` der Kataloge, die das Eval als Referenz nutzt. */
function evalHoldouts(korpus: string): Set<string> {
  const evalDir = path.join(korpus, 'eval');
  const out = new Set<string>();
  if (!existsSync(evalDir)) return out;
  for (const id of readdirSync(evalDir)) {
    const metaPath = path.join(evalDir, id, 'meta.json');
    if (!existsSync(metaPath)) continue;
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as {
      wahl: string;
      quelle_antwort?: string;
    };
    // „…/Beantwortete WPS/Deutscher Mieterbund (DMB).docx (wps-md/…)" → „Deutscher Mieterbund (DMB)"
    const file = meta.quelle_antwort
      ?.replace(/ \(wps-md\/.*\)$/, '')
      .split('/')
      .pop();
    if (file) out.add(`${baseName(file)}|${meta.wahl}`);
  }
  return out;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const korpus = path.join(internDir(), '_korpus/wahlpruefsteine');
  const holdouts = evalHoldouts(korpus);
  const all = readFileSync(path.join(korpus, 'antworten.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Pair);
  const pairs = all.filter((p) => !holdouts.has(`${baseName(p.quelle)}|${p.wahl}`));
  console.log(
    `[wps-ingest] ${all.length} Paare, ${all.length - pairs.length} aus ${holdouts.size} Eval-Katalogen ausgelassen → ${pairs.length}`
  );
  if (!apply) {
    console.log('[wps-ingest] Probelauf — mit --apply schreiben');
    return;
  }

  await mistralEmbeddingService.init();
  if (!mistralEmbeddingService.isReady()) throw new Error('Mistral-Embedding nicht bereit');
  const qdrant = getQdrantInstance();
  await qdrant.ensureConnected();
  const client = qdrant.writeClient(COLLECTION);

  for (let i = 0; i < pairs.length; i += BATCH) {
    const batch = pairs.slice(i, i + BATCH);
    const vectors = await mistralEmbeddingService.generateBatchEmbeddings(
      batch.map((p) => `Frage: ${p.frage}\n\nAntwort: ${p.antwort}`)
    );
    await client.upsert(COLLECTION, {
      wait: true,
      points: batch.map((p, k) => ({
        id: uuidv5(`wahlpruefstein:${p.id}`, uuidv5.URL),
        vector: vectors[k] ?? [],
        payload: {
          pair_id: p.id,
          wahl: p.wahl,
          ebene: p.ebene,
          jahr: p.jahr,
          verband: p.verband,
          n: p.n,
          frage: p.frage,
          position: p.position,
          antwort: p.antwort,
          titel: p.titel,
          document_id: p.id,
          chunk_index: 0,
          title: `${p.verband} (${WAHLPRUEFSTEIN_WAHL_LABELS[p.wahl] ?? p.wahl}), Frage ${p.n}`,
          chunk_text: `Frage: ${p.frage}\n\nAntwort: ${p.position ? `${p.position}. ` : ''}${p.antwort}`,
        },
      })),
    });
    console.log(`[wps-ingest] ${Math.min(i + BATCH, pairs.length)}/${pairs.length}`);
  }
  console.log(`[wps-ingest] fertig: ${pairs.length} Punkte in ${COLLECTION}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
