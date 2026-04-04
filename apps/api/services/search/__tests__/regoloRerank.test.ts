/**
 * Integration test for RegoloRerankService.
 *
 * Requires REGOLO_API_KEY to be set.
 * Run with: npx tsx apps/api/services/search/__tests__/regoloRerank.test.ts
 */

import { regoloRerankService } from '../RegoloRerankService.js';

const HAS_KEY = !!process.env.REGOLO_API_KEY;

async function testBasicRerank() {
  console.log('--- Test: Basic rerank ---');

  const results = await regoloRerankService.rerank({
    query: 'Klimapolitik der Grünen',
    documents: [
      'Die Grünen setzen sich für ambitionierte Klimaziele ein und fordern den Ausstieg aus fossilen Energien bis 2035.',
      'Der FC Bayern München hat gestern ein Freundschaftsspiel gegen Real Madrid gewonnen.',
      'Das Grundsatzprogramm der Grünen beschreibt die Parteiposition zum Klimaschutz und zur Energiewende.',
      'Die Schwerkraft ist eine fundamentale Naturkraft, die alle Massen zueinander zieht.',
    ],
    topN: 4,
  });

  console.log('Results:');
  for (const r of results) {
    console.log(
      `  [${r.originalIndex}] score=${r.relevanceScore.toFixed(4)} — ${r.text.slice(0, 80)}...`
    );
  }

  // Sanity checks
  const topResult = results[0];
  if (topResult.originalIndex !== 0 && topResult.originalIndex !== 2) {
    console.error('FAIL: Expected index 0 or 2 (climate-related) to be top result');
    process.exit(1);
  }
  if (topResult.relevanceScore < 0.5) {
    console.error('FAIL: Expected top result to have relevance > 0.5');
    process.exit(1);
  }

  // The football and gravity docs should be at the bottom
  const bottomTwo = results.slice(-2).map((r) => r.originalIndex);
  if (!bottomTwo.includes(1) || !bottomTwo.includes(3)) {
    console.error('FAIL: Expected football (1) and gravity (3) to be lowest scored');
    process.exit(1);
  }

  console.log('PASS\n');
}

async function testTopN() {
  console.log('--- Test: top_n limits results ---');

  const results = await regoloRerankService.rerank({
    query: 'Energiewende',
    documents: [
      'Erneuerbare Energien sind die Zukunft der deutschen Energieversorgung.',
      'Kochen mit Gas wird in vielen Haushalten bevorzugt.',
      'Windkraftanlagen liefern einen großen Teil des grünen Stroms.',
      'Die Ölpreise schwanken stark auf dem Weltmarkt.',
    ],
    topN: 2,
  });

  if (results.length !== 2) {
    console.error(`FAIL: Expected 2 results, got ${results.length}`);
    process.exit(1);
  }

  console.log(`Got ${results.length} results (expected 2)`);
  console.log('PASS\n');
}

async function testCustomInstruct() {
  console.log('--- Test: Custom instruct for temporal queries ---');

  const results = await regoloRerankService.rerank({
    query: 'Aktuelle Klimapolitik 2026',
    documents: [
      'Die Klimapolitik der Grünen wurde 2020 grundlegend überarbeitet.',
      'Im März 2026 verabschiedeten die Grünen neue Klimaziele auf ihrem Parteitag.',
    ],
    instruct:
      'Given a search query, retrieve relevant and current passages that answer the query. Prefer recent sources.',
  });

  console.log('Results:');
  for (const r of results) {
    console.log(`  [${r.originalIndex}] score=${r.relevanceScore.toFixed(4)}`);
  }
  console.log('PASS\n');
}

async function main() {
  if (!HAS_KEY) {
    console.log('SKIPPED: REGOLO_API_KEY not set');
    return;
  }

  await testBasicRerank();
  await testTopN();
  await testCustomInstruct();

  console.log('All tests passed!');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
