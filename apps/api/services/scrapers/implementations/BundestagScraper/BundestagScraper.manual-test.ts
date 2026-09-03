/**
 * Live check of the two gruene-bundestag.de markup selectors the indexer reads
 * a page through. Not a unit test — it fetches the real pages, which is the
 * only way to notice that their template moved.
 *
 * It exists because both selectors failed silently in production: the date came
 * back null for all ~3.3k indexed chunks (the site emits no
 * `article:published_time`), and the JavaScript banner opened the text of every
 * MdB profile (`noscript` was missing from the noise selector). Neither shows
 * up as an error anywhere — one leaves an advertised filter that always returns
 * zero, the other just reads badly. So this asserts the outcome, and it imports
 * the production selectors rather than restating them: a restated copy would
 * keep passing after the site changed, which is exactly how both bugs survived.
 *
 * Run:
 *   cd apps/api && npx tsx services/scrapers/implementations/BundestagScraper/BundestagScraper.manual-test.ts
 */
import * as cheerio from 'cheerio';

import { BASE_URL } from './bundestagConfig.js';
import { NOISE_SELECTOR, extractPublishedAt } from './bundestagMarkup.js';

interface Case {
  kind: 'Fachtext' | 'Presse' | 'MdB';
  url: string;
  /** MdB profiles legitimately carry no publication date. */
  expectsDate: boolean;
}

const CASES: Case[] = [
  {
    kind: 'Fachtext',
    url: `${BASE_URL}/unsere-politik/fachtexte/mehr-transparenz-und-staerkung-des-parlaments/`,
    expectsDate: true,
  },
  {
    kind: 'Fachtext',
    url: `${BASE_URL}/unsere-politik/fachtexte/das-heizungsgesetz-wirkt-pragmatisch-und-sozial-gerecht/`,
    expectsDate: true,
  },
  {
    kind: 'Presse',
    url: `${BASE_URL}/presse/mit-der-dati-schaffen-wir-endlich-mehr-freiraeume-fuer-transfer-und-ideen/`,
    expectsDate: true,
  },
  { kind: 'MdB', url: `${BASE_URL}/abgeordnete/details/katrin-uhlig/`, expectsDate: false },
  { kind: 'MdB', url: `${BASE_URL}/abgeordnete/details/sara-nanni/`, expectsDate: false },
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const JS_BANNER = 'verwendet JavaScript';

/** Mirrors the extraction order in BundestagScraper.#fetchPage. */
function extractText($: cheerio.CheerioAPI, html: string): string {
  const typo3 = html.match(/<!--TYPO3SEARCH_begin-->([\s\S]*?)<!--TYPO3SEARCH_end-->/);
  let text = '';
  if (typo3?.[1]) text = cheerio.load(typo3[1]).text().trim();
  if (text.length < 200) {
    text = $('main, article, .content, #content, body').first().text().trim();
  }
  return text;
}

async function main(): Promise<void> {
  console.log('='.repeat(78));
  console.log(`gruene-bundestag.de Markup-Check — ${CASES.length} Seiten`);
  console.log('='.repeat(78));

  let passed = 0;
  const failures: string[] = [];

  for (const c of CASES) {
    console.log(`\n[${c.kind}] ${c.url.slice(BASE_URL.length)}`);

    let html: string;
    try {
      const res = await fetch(c.url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ Abruf fehlgeschlagen: ${message}`);
      failures.push(`${c.url} → ${message}`);
      continue;
    }

    const $ = cheerio.load(html);
    const published = extractPublishedAt($);
    $(NOISE_SELECTOR).remove();
    const text = extractText($, html);

    console.log(`  published_at: ${published ?? 'null'}`);
    console.log(`  Text (${text.length} Zeichen): ${text.slice(0, 84)}…`);

    const problems: string[] = [];
    if (c.expectsDate) {
      if (!published) {
        problems.push('kein published_at — das release-date-Markup hat sich geändert');
      } else if (!ISO_DATE_RE.test(published)) {
        problems.push(`published_at ist nicht ISO-datiert: "${published}"`);
      }
    } else if (published) {
      problems.push(`unerwartetes published_at "${published}" — falscher <time>-Knoten getroffen`);
    }
    if (text.includes(JS_BANNER)) {
      problems.push('JavaScript-Banner steht im indexierten Text');
    }
    if (text.length < 100) {
      problems.push(`Text zu kurz (${text.length}) — würde beim Indexieren verworfen`);
    }

    if (problems.length > 0) {
      for (const p of problems) console.log(`  ❌ ${p}`);
      failures.push(...problems.map((p) => `[${c.kind}] ${p}`));
    } else {
      console.log('  ✅ ok');
      passed += 1;
    }
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`${passed}/${CASES.length} Seiten ok`);
  for (const f of failures) console.log(`  ❌ ${f}`);
  console.log('='.repeat(78));

  process.exitCode = failures.length > 0 ? 1 : 0;
}

void main();
