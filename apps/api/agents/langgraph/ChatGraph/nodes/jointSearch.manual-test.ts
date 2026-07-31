/**
 * Live proof that a joint collections+DIP turn actually mixes both sources and
 * that neither crowds the other out of the rerank input window.
 *
 * Not a unit test — it hits Qdrant and the Bundestag MCP. It exists because the
 * failure mode here is invisible to unit tests: both sources return results, the
 * merge succeeds, and the answer looks fine — while one source silently occupies
 * every slot the cross-encoder gets to see.
 *
 * Run:
 *   cd apps/api && npx tsx agents/langgraph/ChatGraph/nodes/jointSearch.manual-test.ts
 */
import { vectorConfig } from '../../../../config/vectorConfig.js';
import { getBundestagEnrichedService } from '../../../../services/bundestag/BundestagEnrichedService.js';

import { detectSearchSources } from './classifierSignals.js';
import { mergeSearchResults, normalizeScore } from './searchNode.js';

import type { SearchResult } from '../types.js';

const QUESTIONS = [
  'Was ist unsere grüne Position zur Wärmewende und was wurde dazu im Bundestag debattiert?',
  'Grüne Haltung zur Kindergrundsicherung und der Stand des Gesetzentwurfs',
];

/** Mirrors buildBundestagResults' non-standalone shape closely enough to rank. */
async function dipResults(query: string): Promise<SearchResult[]> {
  const enriched = await getBundestagEnrichedService().search(query);
  const out: SearchResult[] = [];
  if (enriched.topic) {
    enriched.topic.hits.forEach((h, i) =>
      out.push({
        source: 'bundestag',
        title: `${h.entityType ?? h.docType}: ${h.title}`,
        content: h.abstract ?? '',
        relevance: 0.9 - i * 0.03,
      })
    );
    enriched.topic.speeches.forEach((s, i) =>
      out.push({
        source: 'bundestag',
        title: `Rede von ${s.speaker}`,
        content: s.excerpt,
        relevance: 0.85 - i * 0.02,
      })
    );
  }
  return out;
}

async function main(): Promise<void> {
  const { mergeOverfetch, inputLimit, dipScoreCeiling } = vectorConfig.get('rerank');
  console.log('='.repeat(78));
  console.log('Gemeinsame Suche (Sammlungen + DIP) — Live-Check');
  console.log(
    `mergeOverfetch=${mergeOverfetch} rerankInputLimit=${inputLimit} dipCeiling=${dipScoreCeiling}`
  );
  console.log('='.repeat(78));

  let failures = 0;

  for (const q of QUESTIONS) {
    console.log(`\n${q}`);
    console.log('-'.repeat(78));

    const sources = detectSearchSources(q, 'search');
    console.log(`  detectSearchSources → [${sources.join(', ')}]`);
    if (!sources.includes('bundestag') || !sources.includes('documents')) {
      console.log('  ❌ nicht als gemeinsame Suche erkannt');
      failures += 1;
      continue;
    }

    // Stand-in for the collection side, sized the way production sizes it:
    // `limit: 3` per collection × 4 default DE collections × 2 subQueries = 24,
    // which alone exceeds mergeOverfetch. This is the case that used to drop DIP
    // entirely, so the probe has to reproduce it rather than a comfortable 8.
    const docs: SearchResult[] = Array.from({ length: 24 }, (_, i) => ({
      source: 'gruenerator:bundestagsfraktion',
      title: `Fachtext ${i + 1}`,
      content: 'Grüne Position …',
      relevance: 0.7,
      similarityScore: 0.86 - i * 0.005,
      url: `https://www.gruene-bundestag.de/fachtext-${i + 1}`,
    }));

    const dip = await dipResults(q);
    if (dip.length === 0) {
      console.log('  ❌ DIP lieferte nichts — Themenpfad prüfen');
      failures += 1;
      continue;
    }

    // Mirrors the per-source cap the multi-source branch applies before merging.
    const cap = Math.max(4, Math.floor(mergeOverfetch / 2));
    const merged = mergeSearchResults(docs.slice(0, cap), dip.slice(0, cap));
    const window = merged.slice(0, inputLimit);
    const nDip = window.filter((r) => r.source === 'bundestag').length;
    const nDocs = window.filter((r) => r.source.startsWith('gruenerator:')).length;

    // Counterfactual: the same merge without the per-source cap. Printed so the
    // reason for the cap stays visible in the output instead of living only in a
    // comment — if this ever stops showing 0 DIP, the cap has become redundant.
    const unbalanced = mergeSearchResults(docs, dip).slice(0, inputLimit);
    const nDipUnbalanced = unbalanced.filter((r) => r.source === 'bundestag').length;

    console.log(`  DIP-Treffer: ${dip.length}, Sammlungstreffer: ${docs.length}`);
    console.log(`  Im Rerank-Fenster (${window.length}): ${nDocs} Sammlung, ${nDip} DIP`);
    console.log(`  ohne Quellen-Deckel wären es: ${nDipUnbalanced} DIP`);
    console.log(`  Top 5 nach Merge:`);
    for (const r of window.slice(0, 5)) {
      console.log(`    ${normalizeScore(r).toFixed(3)}  [${r.source}] ${r.title.slice(0, 62)}`);
    }

    // Both sources must survive into the window — that is the whole point.
    const problems: string[] = [];
    if (nDip === 0) problems.push('DIP komplett verdrängt');
    if (nDocs === 0) problems.push('Sammlung komplett verdrängt');
    // And the top slot must not be a positional DIP constant beating real similarity.
    const top = window[0];
    if (top && top.source === 'bundestag' && normalizeScore(top) > dipScoreCeiling) {
      problems.push(`DIP-Spitzenwert ${normalizeScore(top)} über dem Deckel ${dipScoreCeiling}`);
    }

    if (problems.length > 0) {
      for (const p of problems) console.log(`  ❌ ${p}`);
      failures += problems.length;
    } else {
      console.log('  ✅ beide Quellen im Fenster, DIP unter dem Deckel');
    }
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(failures === 0 ? 'alles ok' : `${failures} Problem(e)`);
  console.log('='.repeat(78));
  process.exitCode = failures > 0 ? 1 : 0;
}

void main().then(() => process.exit(process.exitCode ?? 0));
