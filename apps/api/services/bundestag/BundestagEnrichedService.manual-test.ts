/**
 * Live smoke test for BundestagEnrichedService against the real Bundestag MCP
 * server (mcp.bundestag-wrapped.de). Not a unit test — it makes real network
 * calls and prints what an LLM would actually receive, so drift between our
 * mappers and the MCP's response shapes is visible instead of silent.
 *
 * Run:
 *   cd apps/api && npx tsx services/bundestag/BundestagEnrichedService.manual-test.ts
 *   ... --filter=person      only the scenarios tagged `person`
 *   ... --fresh              drop cached bt:v2:* keys before running
 *   ... --raw                also dump the full BtEnrichedResult as JSON
 *
 * Redis is optional: cache misses degrade to live calls. Pass --fresh to drop
 * the `bt:v2:*` keys first, which is what you want right after changing a
 * mapper — `safeList` caches empty results too, so a stale entry makes a real
 * fix look like a no-op.
 */
import { redisClient, ensureConnected } from '../../utils/redis/client.js';

import { getBundestagEnrichedService } from './BundestagEnrichedService.js';

import type { BtEnrichedResult } from './types.js';

interface Scenario {
  tag: 'person' | 'topic' | 'document';
  question: string;
  /** What a correct answer must contain — checked against the result, not the LLM. */
  expect: (r: BtEnrichedResult) => string | null;
}

const PER_QUESTION_TIMEOUT_MS = 45_000;

/** A person result is only useful if the name is clean and something came back. */
function expectPerson(surname: string): (r: BtEnrichedResult) => string | null {
  return (r) => {
    // `BtEnrichedResult` carries `kind` alongside OPTIONAL payloads rather than
    // being a discriminated union, so `kind` alone does not narrow — check the
    // payload itself.
    if (r.kind !== 'person' || !r.person) return `kind=${r.kind}, expected "person"`;
    const name = r.person.person.name;
    if (!name.toLowerCase().includes(surname.toLowerCase())) {
      return `person name "${name}" does not contain "${surname}"`;
    }
    // Regression guard: DIP's `titel` is the full display line, so a mapper that
    // concatenates it produces "Katrin Uhlig, MdB, BÜNDNIS 90/DIE GRÜNEN Katrin
    // Uhlig" — which then never matches the speeches `speaker` filter.
    if (name.includes(',') || /\bMdB\b/.test(name)) {
      return `person name is mangled (contains DIP display line): "${name}"`;
    }
    if (r.person.speeches.length === 0 && r.person.aktivitaeten.length === 0) {
      return 'person found but neither speeches nor activities returned';
    }
    return null;
  };
}

const SCENARIOS: Scenario[] = [
  {
    tag: 'person',
    question: 'Worüber hat Katrin Uhlig zuletzt gesprochen?',
    expect: expectPerson('Uhlig'),
  },
  {
    tag: 'person',
    question: 'Was hat Katharina Dröge zur Wirtschaft gesagt?',
    expect: expectPerson('Dröge'),
  },
  {
    tag: 'person',
    question: 'Welche Reden hat Friedrich Merz zur Migration gehalten?',
    expect: expectPerson('Merz'),
  },
  {
    tag: 'topic',
    question: 'Was wurde im Bundestag zum Klimaschutz debattiert?',
    expect: (r) =>
      r.topic && (r.topic.hits.length > 0 || r.topic.speeches.length > 0)
        ? null
        : `kind=${r.kind}, no topic hits or speeches`,
  },
  {
    tag: 'topic',
    question: 'Welche Anträge gab es zuletzt zur Kindergrundsicherung?',
    expect: (r) => (r.kind === 'none' ? 'no results at all' : null),
  },
  {
    tag: 'document',
    question: 'Was steht in Drucksache 21/6838?',
    expect: (r) =>
      r.document?.drucksache.dokumentnummer.includes('21/6838')
        ? null
        : `kind=${r.kind}, expected document 21/6838`,
  },
];

function preview(r: BtEnrichedResult): string[] {
  const lines: string[] = [];
  if (r.person) {
    const { person, aktivitaeten, speeches } = r.person;
    lines.push(
      `person: ${person.name} (${person.fraktion ?? '?'}, WP ${person.wahlperiode ?? '?'})`
    );
    lines.push(`aktivitaeten: ${aktivitaeten.length}`);
    for (const a of aktivitaeten.slice(0, 3)) {
      lines.push(`   • [${a.datum ?? '?'}] ${a.typ ?? '?'} — ${a.titel.slice(0, 90)}`);
    }
    lines.push(`speeches: ${speeches.length}`);
    for (const s of speeches) {
      lines.push(
        `   • [${s.date ?? '?'}] ${s.speaker} (${s.party ?? '?'}) — ${s.excerpt.slice(0, 110)}…`
      );
    }
  } else if (r.topic) {
    const { hits, speeches, documents, vorgaenge } = r.topic;
    lines.push(
      `hits: ${hits.length}, speeches: ${speeches.length}, docs: ${documents.length}, vorgaenge: ${vorgaenge.length}`
    );
    for (const h of hits.slice(0, 3)) {
      lines.push(
        `   • [${h.date ?? '?'}] ${h.docType}/${h.entityType ?? '?'} — ${h.title.slice(0, 90)}`
      );
    }
    for (const s of speeches.slice(0, 2)) {
      lines.push(
        `   • [${s.date ?? '?'}] ${s.speaker} (${s.party ?? '?'}) — ${s.excerpt.slice(0, 90)}…`
      );
    }
    for (const d of documents.slice(0, 2)) {
      lines.push(`   • [${d.datum ?? '?'}] DS ${d.dokumentnummer} — ${d.titel.slice(0, 90)}`);
    }
  } else if (r.document) {
    const { drucksache, siblings, vorgang } = r.document;
    lines.push(
      `drucksache: ${drucksache.dokumentnummer} (${drucksache.drucksachetyp ?? '?'}, ${drucksache.datum ?? '?'})`
    );
    lines.push(`   ${drucksache.titel.slice(0, 140)}`);
    lines.push(`   urheber: ${drucksache.urheber.join(', ') || '—'}`);
    lines.push(`   pdf: ${drucksache.pdfUrl ?? '—'}`);
    lines.push(
      `siblings: ${siblings.length}, vorgang: ${vorgang ? vorgang.titel.slice(0, 80) : '—'}`
    );
  } else {
    lines.push('no results');
  }
  return lines;
}

/** Dates in the result, newest first — used to sanity-check "zuletzt" queries. */
function datesOf(r: BtEnrichedResult): string[] {
  const raw = r.person
    ? [...r.person.speeches.map((s) => s.date), ...r.person.aktivitaeten.map((a) => a.datum)]
    : r.topic
      ? [...r.topic.speeches.map((s) => s.date), ...r.topic.hits.map((h) => h.date)]
      : [];
  return raw.filter((d): d is string => !!d).sort((a, b) => b.localeCompare(a));
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const filter = args.find((a) => a.startsWith('--filter='))?.split('=')[1];
  const dumpRaw = args.includes('--raw');
  const fresh = args.includes('--fresh');

  const scenarios = filter ? SCENARIOS.filter((s) => s.tag === filter) : SCENARIOS;
  if (scenarios.length === 0) {
    console.error(`No scenarios match --filter=${filter ?? ''}`);
    process.exitCode = 1;
    return;
  }

  console.log('='.repeat(78));
  console.log(`Bundestag MCP live test — ${scenarios.length} scenario(s)`);
  console.log(`server: ${process.env.BUNDESTAG_MCP_URL ?? 'https://mcp.bundestag-wrapped.de'}`);
  console.log(`cache:  ${fresh ? 'flushing bt:v2:*' : 'enabled (pass --fresh to flush)'}`);
  console.log('='.repeat(78));

  if (fresh) {
    try {
      await ensureConnected();
      let cursor = '0';
      let dropped = 0;
      do {
        const scan = await redisClient.scan(cursor, { MATCH: 'bt:v2:*', COUNT: 500 });
        cursor = String(scan.cursor);
        if (scan.keys.length > 0) {
          await redisClient.del(scan.keys);
          dropped += scan.keys.length;
        }
      } while (cursor !== '0');
      console.log(`flushed ${dropped} cached key(s)\n`);
    } catch (error) {
      console.log(
        `cache flush skipped (${error instanceof Error ? error.message : String(error)})\n`
      );
    }
  }

  const service = getBundestagEnrichedService();
  let passed = 0;
  const failures: string[] = [];

  for (const s of scenarios) {
    console.log(`\n[${s.tag}] ${s.question}`);
    console.log('-'.repeat(78));

    const started = Date.now();
    let result: BtEnrichedResult;
    try {
      result = await withTimeout(service.search(s.question), PER_QUESTION_TIMEOUT_MS, s.question);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ threw: ${message}`);
      failures.push(`${s.question} → threw: ${message}`);
      continue;
    }

    const elapsed = Date.now() - started;
    for (const line of preview(result)) console.log(`  ${line}`);
    if (result.notes.length > 0) {
      for (const n of result.notes) console.log(`  note: ${n}`);
    }
    const dates = datesOf(result);
    if (dates.length > 0) console.log(`  dates (newest first): ${dates.slice(0, 5).join(', ')}`);
    console.log(
      `  meta: kind=${result.kind} name=${result.metadata.extractedName ?? '—'} drs=${result.metadata.matchedDokumentnummer ?? '—'} ${elapsed}ms`
    );

    const problem = s.expect(result);
    if (problem) {
      console.log(`  ❌ ${problem}`);
      failures.push(`${s.question} → ${problem}`);
    } else {
      console.log('  ✅ ok');
      passed += 1;
    }

    if (dumpRaw) console.log(JSON.stringify(result, null, 2));
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`${passed}/${scenarios.length} passed`);
  for (const f of failures) console.log(`  ❌ ${f}`);
  console.log('='.repeat(78));

  process.exitCode = failures.length > 0 ? 1 : 0;
}

void main().then(() => {
  // The shared redis client keeps the event loop alive; nothing else to drain.
  process.exit(process.exitCode ?? 0);
});
