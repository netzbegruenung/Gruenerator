/**
 * Live coverage of the whole BundestagMCPClient surface against the real MCP
 * server (mcp.bundestag-wrapped.de). Companion to
 * `BundestagEnrichedService.manual-test.ts`, which covers the chat path; this
 * one hits EVERY client method, including the four legacy loose wrappers that
 * NotebookQAService / PersonDetectionService / EnrichedPersonSearchService use
 * and that no chat scenario reaches.
 *
 * Run:
 *   cd apps/api && npx tsx services/bundestag/BundestagMCPClient.manual-test.ts
 *   ... --raw   dump each raw payload
 *
 * The point is drift detection: the raw schemas are deliberately lenient and
 * `fetchTrimmed` drops non-conforming items one by one, so a shape change shows
 * up as an empty list rather than an error. Only a live run catches that.
 */
import { getBundestagMCPClient } from './BundestagMCPClient.js';

interface Check {
  name: string;
  /** Which consumer breaks if this fails — makes a red line actionable. */
  usedBy: string;
  /**
   * Known-broken on the MCP SERVER, not here. Reported as ⚠️ and excluded from
   * the exit code so a red run always means OUR code regressed — but still run
   * every time, and shouted about if it starts passing (then drop the flag).
   */
  knownUpstream?: string;
  run: () => Promise<{ ok: boolean; detail: string }>;
}

const client = getBundestagMCPClient();

/** Legacy wrappers return raw DIP envelopes; consumers read `.documents`. */
function documentsOf(result: unknown): unknown[] {
  const r = result as { documents?: unknown[]; results?: unknown[]; data?: unknown };
  if (Array.isArray(r?.documents)) return r.documents;
  if (Array.isArray(r?.results)) return r.results;
  return [];
}

const CHECKS: Check[] = [
  // ── Trimmed chat wrappers ────────────────────────────────────────────────
  {
    name: 'semanticSearch("Klimaschutz")',
    usedBy: 'BundestagEnrichedService topic path',
    run: async () => {
      const r = await client.semanticSearch({ query: 'Klimaschutz', limit: 4 });
      const first = r.items[0];
      return {
        ok: r.items.length > 0 && !!first?.title,
        detail: `${r.items.length} items, wpFallback=${r.wpFallback}, first="${first?.title?.slice(0, 60) ?? '—'}" wp=${first?.wahlperiode ?? '—'}`,
      };
    },
  },
  {
    name: 'semanticSearch(sort:"newest")',
    usedBy: '"zuletzt"-Fragen',
    run: async () => {
      const r = await client.semanticSearch({ query: 'Klimaschutz', limit: 4, sort: 'newest' });
      const dates = r.items.map((i) => i.date).filter((d): d is string => !!d);
      const sorted = [...dates].sort((a, b) => b.localeCompare(a));
      return {
        ok: r.items.length > 0 && JSON.stringify(dates) === JSON.stringify(sorted),
        detail: `${r.items.length} items, dates=${dates.join(', ') || '—'}`,
      };
    },
  },
  {
    name: 'searchSpeeches("Heizungsgesetz")',
    usedBy: 'BundestagEnrichedService topic + person path',
    run: async () => {
      const r = await client.searchSpeeches({ query: 'Heizungsgesetz', limit: 3 });
      const first = r.items[0];
      return {
        ok: r.items.length > 0 && !!first?.speaker && !!first?.excerpt,
        detail: `${r.items.length} items, first="${first?.speaker ?? '—'}" (${first?.party ?? '—'}) excerpt=${first?.excerpt?.length ?? 0}ch`,
      };
    },
  },
  {
    name: 'searchSpeeches(speaker filter)',
    usedBy: 'Personen-Pfad — der Filter, den der mangled Name gekillt hat',
    run: async () => {
      const r = await client.searchSpeeches({
        query: 'Wirtschaft',
        speaker: 'Katharina Dröge',
        limit: 3,
      });
      const allMatch = r.items.every((s) => s.speaker.includes('Dröge'));
      return {
        ok: r.items.length > 0 && allMatch,
        detail: `${r.items.length} items, speakers=${[...new Set(r.items.map((s) => s.speaker))].join(', ') || '—'}`,
      };
    },
  },
  {
    name: 'searchSpeeches(speakerParty SHORT name)',
    usedBy: 'ungenutzter Filter — kurze vs. lange Parteinamen',
    run: async () => {
      const r = await client.searchSpeeches({
        query: 'Klimaschutz',
        speakerParty: 'GRÜNE',
        limit: 3,
      });
      return {
        ok: r.items.length > 0,
        detail: `${r.items.length} items, parties=${[...new Set(r.items.map((s) => s.party))].join(', ') || '—'}`,
      };
    },
  },
  {
    name: 'findDrucksache(dokumentnummer "21/6838")',
    usedBy: 'BundestagEnrichedService document path',
    run: async () => {
      const r = await client.findDrucksache({ dokumentnummer: '21/6838', limit: 3 });
      const first = r.items[0];
      return {
        ok: !!first && first.dokumentnummer.includes('21/6838'),
        detail: `${r.items.length} items, first=${first?.dokumentnummer ?? '—'} typ=${first?.drucksachetyp ?? '—'} pdf=${first?.pdfUrl ? 'yes' : 'no'} urheber=${first?.urheber?.join('/') || '—'}`,
      };
    },
  },
  {
    name: 'findDrucksache(query + drucksachetyp enum)',
    usedBy: 'Themen-Fallback wenn die semantische Suche leer ist',
    run: async () => {
      const r = await client.findDrucksache({
        query: 'Klimaschutz',
        drucksachetyp: 'Kleine Anfrage',
        limit: 3,
      });
      const allMatch = r.items.every((d) => d.drucksachetyp === 'Kleine Anfrage');
      return {
        ok: r.items.length > 0 && allMatch,
        detail: `${r.items.length} items, typen=${[...new Set(r.items.map((d) => d.drucksachetyp))].join(', ') || '—'}`,
      };
    },
  },
  {
    name: 'searchVorgaenge("Kindergrundsicherung")',
    usedBy: 'document path (Gesetzgebungs-Kontext) + Themen-Fallback',
    run: async () => {
      const r = await client.searchVorgaenge({ query: 'Kindergrundsicherung', limit: 3 });
      const first = r.items[0];
      return {
        ok: r.items.length > 0 && !!first?.titel,
        detail: `${r.items.length} items, first="${first?.titel?.slice(0, 55) ?? '—'}" stand=${first?.beratungsstand ?? '—'}`,
      };
    },
  },
  {
    name: 'searchPersonenTrimmed("Uhlig")',
    usedBy: 'Personen-Pfad — hier stand der Array-wahlperiode-Bug',
    run: async () => {
      const r = await client.searchPersonenTrimmed('Uhlig', 3);
      const first = r.items[0];
      const clean = !!first && !first.name.includes(',') && !/\bMdB\b/.test(first.name);
      return {
        ok: r.items.length > 0 && clean,
        detail: `${r.items.length} items, first="${first?.name ?? '—'}" fraktion=${first?.fraktion ?? '—'} wp=${first?.wahlperiode ?? '—'}`,
      };
    },
  },
  {
    name: 'searchAktivitaetenTrimmed(person 7439)',
    usedBy: 'Personen-Pfad (aktivitaeten-Liste)',
    run: async () => {
      const r = await client.searchAktivitaetenTrimmed('7439', 5);
      return { ok: r.items.length > 0, detail: `${r.items.length} items` };
    },
  },

  // ── Legacy loose wrappers (raw DIP envelopes) ────────────────────────────
  {
    name: 'searchPersonen(fraktion filter is IGNORED upstream)',
    usedBy: 'PersonDetectionService.refreshMPCache',
    run: async () => {
      // Short and long name must return the SAME unfiltered set — that is the
      // observed server behaviour. If this ever differs, the server started
      // honouring `fraktion` and the client-side filter can be relied on less.
      const short = documentsOf(await client.searchPersonen({ fraktion: 'GRÜNE', limit: 10 }));
      const long = documentsOf(
        await client.searchPersonen({ fraktion: 'BÜNDNIS 90/DIE GRÜNEN', limit: 10 })
      );
      const parties = new Set(
        long.flatMap((p) => {
          const f = (p as { fraktion?: unknown }).fraktion;
          return Array.isArray(f) ? (f as string[]) : f ? [String(f)] : [];
        })
      );
      return {
        ok: short.length > 0 && long.length > 0,
        detail: `short=${short.length} long=${long.length} docs; Parteien im Ergebnis: ${[...parties].join(', ') || '—'} → Filter wirkt ${parties.size > 1 ? 'NICHT' : 'evtl. doch'}`,
      };
    },
  },
  {
    name: 'searchPersonen(query "Dröge")',
    usedBy: 'PersonDetectionService.detectPerson API-Fallback',
    run: async () => {
      const r = await client.searchPersonen({ query: 'Dröge', limit: 3 });
      const docs = documentsOf(r);
      return { ok: docs.length > 0, detail: `${docs.length} docs` };
    },
  },
  {
    name: 'getPerson(7439)',
    usedBy: 'EnrichedPersonSearchService._fetchPersonDetails',
    run: async () => {
      // The server returns the record under `data`; `getPerson` unwraps it so
      // consumers can read BOTH flat fields and `.documents`. Both are asserted
      // because `_buildPersonProfile` reads flat, other callers read documents.
      const r = (await client.getPerson('7439')) as Record<string, unknown>;
      const docs = documentsOf(r);
      const flat = typeof r.nachname === 'string' && r.nachname.length > 0;
      return {
        ok: docs.length === 1 && flat,
        detail: `documents=${docs.length}, flat nachname=${String(r.nachname ?? '—')}, wahlperiode=${JSON.stringify(r.wahlperiode ?? null)}`,
      };
    },
  },
  {
    name: 'searchDrucksachen(query "Klimaschutz")',
    usedBy: 'EnrichedPersonSearchService._searchDrucksachen',
    run: async () => {
      const r = await client.searchDrucksachen({ query: 'Klimaschutz', limit: 5 });
      const docs = documentsOf(r);
      return { ok: docs.length > 0, detail: `${docs.length} docs` };
    },
  },
  {
    name: 'searchAktivitaeten(person_id 7439)',
    usedBy: 'EnrichedPersonSearchService._searchAktivitaeten',
    run: async () => {
      const r = await client.searchAktivitaeten({ person_id: '7439', limit: 5 });
      return { ok: documentsOf(r).length > 0, detail: `${documentsOf(r).length} docs` };
    },
  },
];

async function main(): Promise<void> {
  const dumpRaw = process.argv.includes('--raw');

  console.log('='.repeat(80));
  console.log(`BundestagMCPClient — live coverage, ${CHECKS.length} calls`);
  console.log(`server: ${process.env.BUNDESTAG_MCP_URL ?? 'https://mcp.bundestag-wrapped.de'}`);
  console.log('='.repeat(80));

  const failed: string[] = [];
  const upstream: string[] = [];
  const unexpectedlyFixed: string[] = [];

  for (const check of CHECKS) {
    const started = Date.now();
    try {
      const { ok, detail } = await check.run();
      const ms = Date.now() - started;
      const icon = ok ? '✅' : check.knownUpstream ? '⚠️ ' : '❌';
      console.log(`${icon} ${check.name}  (${ms}ms)`);
      console.log(`     ${detail}`);
      if (!ok && check.knownUpstream) {
        console.log(`     upstream: ${check.knownUpstream}`);
        upstream.push(`${check.name} — ${check.knownUpstream}`);
      } else if (!ok) {
        console.log(`     used by: ${check.usedBy}`);
        failed.push(`${check.name} — ${check.usedBy}`);
      } else if (check.knownUpstream) {
        unexpectedlyFixed.push(check.name);
      }
    } catch (error) {
      console.log(`❌ ${check.name}`);
      console.log(`     threw: ${error instanceof Error ? error.message : String(error)}`);
      failed.push(`${check.name} — threw`);
    }
    if (dumpRaw) console.log('');
  }

  const green = CHECKS.length - failed.length - upstream.length;
  console.log(`\n${'='.repeat(80)}`);
  console.log(
    `${green}/${CHECKS.length} ok, ${upstream.length} upstream-defekt, ${failed.length} kaputt`
  );
  for (const f of failed) console.log(`  ❌ ${f}`);
  for (const u of upstream) console.log(`  ⚠️  ${u}`);
  for (const u of unexpectedlyFixed) {
    console.log(`  🎉 ${u} funktioniert jetzt — knownUpstream entfernen!`);
  }
  console.log('='.repeat(80));

  process.exitCode = failed.length > 0 ? 1 : 0;
}

void main().then(() => process.exit(process.exitCode ?? 0));
