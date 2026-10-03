#!/usr/bin/env npx tsx
/**
 * Einmaliger Import des Bestands aus Bundestag Wrapped in `bundestag_dip_documents`.
 *
 * Gelesen werden die zwei Chunk-Sammlungen des Bundestag-MCP
 * (`bundestag-protocol-chunks`, `bundestag-document-chunks`) — nur die
 * Payloads, keine Vektoren: dort wurde bis 4000 Zeichen je Chunk eingebettet,
 * der Antwort-Prompt hier kürzt jede Quelle auf 1800. Deshalb werden die Teile
 * wieder zu ganzen Reden bzw. Abschnitten zusammengesetzt und laufen danach
 * durch denselben Builder und Chunker wie der `BundestagDipScraper`. Der
 * Bestand ist klein (Stand 03.10.2026: 16 259 + 40 761 Chunks), Neu-Einbetten
 * kostet wenige Euro.
 *
 * Importierte Dokumente tragen keinen Volltext-Hash: der Scraper liest jedes
 * davon genau einmal neu, sobald DIP es als aktualisiert führt.
 *
 * Wiederaufnehmbar: Dokumente, die das Ziel schon kennt, werden übersprungen
 * (`--overwrite` schreibt sie trotzdem neu). Punkt-IDs sind deterministisch.
 *
 * Usage (aus apps/api):
 *   npx tsx scripts/import-bundestag-wrapped.ts --source-url https://… --source-key … --dry-run
 *   npx tsx scripts/import-bundestag-wrapped.ts --source-url https://… --source-key … [--limit 20]
 *
 * NOTE: dotenv muss vor jedem App-Import laufen, der die Umgebung beim Import
 * parst (`config/env.js`) — deshalb stehen diese Importe dynamisch in `main()`.
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';

import {
  buildDrucksacheParent,
  buildProtokollParent,
  type DipParent,
} from '../services/scrapers/implementations/BundestagDipScraper/builders.js';
import { type ParsedSection } from '../services/scrapers/implementations/BundestagDipScraper/drucksacheParser.js';
import { normalizeParty } from '../services/scrapers/implementations/BundestagDipScraper/factions.js';
import { type ParsedSpeech } from '../services/scrapers/implementations/BundestagDipScraper/protokollParser.js';

dotenv.config();

const PROTOCOL_COLLECTION = 'bundestag-protocol-chunks';
const DOCUMENT_COLLECTION = 'bundestag-document-chunks';
// mistral-embed: 0,10 $ je 1 Mio. Tokens; ~3,5 Zeichen je Token für deutschen Text.
const USD_PER_MTOK = 0.1;
const CHARS_PER_TOKEN = 3.5;

interface CliArgs {
  sourceUrl: string;
  sourceKey: string | null;
  dryRun: boolean;
  overwrite: boolean;
  limit: number;
}

const USAGE =
  'Usage: import-bundestag-wrapped.ts --source-url <url> [--source-key <key>] [--dry-run] [--overwrite] [--limit N]';

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    sourceUrl: '',
    sourceKey: null,
    dryRun: false,
    overwrite: false,
    limit: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--'))
        throw new Error(`${flag} braucht einen Wert.\n${USAGE}`);
      return v;
    };
    if (flag === '--source-url') args.sourceUrl = value();
    else if (flag === '--source-key') args.sourceKey = value();
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--overwrite') args.overwrite = true;
    else if (flag === '--limit') args.limit = Number.parseInt(value(), 10);
    else throw new Error(`Unbekanntes Argument: ${flag}\n${USAGE}`);
  }
  if (!args.sourceUrl) throw new Error(USAGE);
  if (!Number.isFinite(args.limit) || args.limit < 0) throw new Error(`--limit: ${USAGE}`);
  return args;
}

type Payload = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null =>
  typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null;

async function scrollAll(
  client: QdrantClient,
  collection: string,
  filter?: Record<string, unknown>
): Promise<Payload[]> {
  const out: Payload[] = [];
  let offset: string | number | undefined;
  for (;;) {
    const page = await client.scroll(collection, {
      limit: 1000,
      with_payload: true,
      with_vector: false,
      ...(filter ? { filter } : {}),
      ...(offset !== undefined ? { offset } : {}),
    });
    for (const p of page.points) out.push((p.payload ?? {}) as Payload);
    const next = page.next_page_offset;
    if (typeof next !== 'string' && typeof next !== 'number') return out;
    offset = next;
  }
}

function groupBy(rows: Payload[], key: string): Map<string, Payload[]> {
  const groups = new Map<string, Payload[]>();
  for (const row of rows) {
    const id = row[key];
    if (id == null) continue;
    const k = String(id);
    const list = groups.get(k) ?? [];
    list.push(row);
    groups.set(k, list);
  }
  return groups;
}

/**
 * Chunks in Lesereihenfolge; ein Chunk mit `chunk_part > 0` setzt den vorigen
 * fort. So greift die Regel unabhängig davon, ob der Indexer Teile unter
 * derselben oder einer neuen `chunk_index` abgelegt hat.
 */
function mergeParts(rows: Payload[]): Payload[][] {
  const sorted = [...rows].sort(
    (a, b) =>
      (num(a.chunk_index) ?? 0) - (num(b.chunk_index) ?? 0) ||
      (num(a.chunk_part) ?? 0) - (num(b.chunk_part) ?? 0)
  );
  const units: Payload[][] = [];
  for (const row of sorted) {
    if ((num(row.chunk_part) ?? 0) > 0 && units.length > 0) units[units.length - 1].push(row);
    else units.push([row]);
  }
  return units;
}

const joinText = (parts: Payload[]) =>
  parts
    .map((p) => str(p.text) ?? '')
    .join(' ')
    .trim();

export function protocolParent(protokollId: string, rows: Payload[]): DipParent {
  const head = rows[0];
  const speeches: ParsedSpeech[] = mergeParts(rows)
    .map((parts) => {
      const first = parts[0];
      return {
        speaker: str(first.speaker) ?? 'Unbekannt',
        party: normalizeParty(str(first.speaker_party)),
        text: joinText(parts),
        speechType: str(first.speech_type) ?? (first.category === 'rede' ? 'rede' : 'sonstiges'),
        isGovernment: first.is_government === true,
      };
    })
    .filter((s) => s.text.length > 0);
  return buildProtokollParent(
    {
      id: protokollId,
      dokumentnummer: str(head.dokumentnummer) ?? '',
      wahlperiode: num(head.wahlperiode),
      datum: str(head.datum),
    },
    speeches,
    null
  );
}

export function documentParent(drucksacheId: string, rows: Payload[]): DipParent {
  const head = rows[0];
  const sections: ParsedSection[] = mergeParts(rows)
    .map((parts) => ({
      sectionType: str(parts[0].chunk_type) ?? 'section',
      title: (str(parts[0].section_title) ?? 'Abschnitt').replace(/\s*\(Teil \d+\)$/, ''),
      text: joinText(parts),
    }))
    .filter((s) => s.text.length > 0);
  const urheber = Array.isArray(head.urheber)
    ? head.urheber.filter((u): u is string => typeof u === 'string')
    : [];
  return buildDrucksacheParent(
    {
      id: drucksacheId,
      dokumentnummer: str(head.dokumentnummer) ?? '',
      drucksachetyp: str(head.drucksachetyp) ?? 'Drucksache',
      wahlperiode: num(head.wahlperiode),
      datum: str(head.datum),
      titel: str(head.titel) ?? str(head.dokumentnummer) ?? 'Drucksache',
      urheber,
    },
    sections,
    null
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const { getQdrantInstance } = await import('../database/services/QdrantService/index.js');
  const { mistralEmbeddingService } = await import('../services/mistral/index.js');
  const { DIP_COLLECTION, prepareParentPoints, writeParent } =
    await import('../services/scrapers/implementations/BundestagDipScraper/store.js');

  const source = new QdrantClient({
    url: args.sourceUrl,
    ...(args.sourceKey ? { apiKey: args.sourceKey } : {}),
    checkCompatibility: false,
  });

  console.log('Lese Quelle …');
  const protocolRows = await scrollAll(source, PROTOCOL_COLLECTION, {
    must: [{ key: 'herausgeber', match: { value: 'BT' } }],
  });
  const documentRows = await scrollAll(source, DOCUMENT_COLLECTION);
  console.log(`  ${protocolRows.length} Rede-Chunks, ${documentRows.length} Drucksachen-Chunks`);

  let parents: DipParent[] = [
    ...[...groupBy(protocolRows, 'protokoll_id')].map(([id, rows]) => protocolParent(id, rows)),
    ...[...groupBy(documentRows, 'drucksache_id')].map(([id, rows]) => documentParent(id, rows)),
  ].filter((p) => p.units.length > 0);
  if (args.limit > 0) parents = parents.slice(0, args.limit);

  const qdrant = getQdrantInstance();
  await qdrant.init(); // legt bundestag_dip_documents an, falls sie fehlt
  const target = qdrant.client!;

  const known = new Set<string>();
  if (!args.overwrite) {
    let offset: string | number | undefined;
    for (;;) {
      const page = await target.scroll(DIP_COLLECTION, {
        filter: { must: [{ key: 'chunk_index', match: { value: 0 } }] },
        limit: 1000,
        with_payload: ['parent_id'],
        with_vector: false,
        ...(offset !== undefined ? { offset } : {}),
      });
      for (const p of page.points) {
        const parentId = p.payload?.parent_id;
        if (typeof parentId === 'string') known.add(parentId);
      }
      const next = page.next_page_offset;
      if (typeof next !== 'string' && typeof next !== 'number') break;
      offset = next;
    }
  }
  const todo = parents.filter((p) => !known.has(p.parentId));
  console.log(
    `${parents.length} Dokumente, davon ${parents.length - todo.length} schon im Ziel, ${todo.length} zu schreiben`
  );

  if (args.dryRun) {
    let units = 0;
    let points = 0;
    let chars = 0;
    for (const parent of todo) {
      units += parent.units.length;
      const prepared = await prepareParentPoints(parent);
      points += prepared.length;
      chars += prepared.reduce((sum, p) => sum + p.embedText.length, 0);
    }
    const mtok = chars / CHARS_PER_TOKEN / 1_000_000;
    console.log(
      `Probelauf: ${units} Einheiten → ${points} Punkte, ${chars.toLocaleString('de-DE')} Zeichen ` +
        `≈ ${mtok.toFixed(1)} Mio. Tokens ≈ ${(mtok * USD_PER_MTOK).toFixed(2)} $ (mistral-embed). Nichts geschrieben.`
    );
    return;
  }

  await mistralEmbeddingService.init();
  let written = 0;
  let failed = 0;
  for (const [i, parent] of todo.entries()) {
    try {
      written += await writeParent(target, parent);
    } catch (error: unknown) {
      failed += 1;
      console.error(
        `  ${parent.parentId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${todo.length} Dokumente, ${written} Punkte`);
  }
  console.log(`Fertig: ${written} Punkte geschrieben, ${failed} Dokumente fehlgeschlagen.`);
  if (failed > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
