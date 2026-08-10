/**
 * Deep Research Agent — manual harness.
 *
 * The primary way to iterate on the prompts and to see what a run actually costs,
 * without going through the chat. Prints the plan and every tool step as it
 * happens, then the report.
 *
 * Usage:
 *   npx tsx apps/api/test-deep-agent.ts --query "Wie ambitioniert ist Wiens Klimaziel 2040?"
 *   npx tsx apps/api/test-deep-agent.ts --query "..." --locale de-AT
 *   npx tsx apps/api/test-deep-agent.ts --query "..." --write   # writes a real document
 *
 * Without `--write` nothing touches the database — the markdown goes to stdout.
 * Requires SCALEWAY_API_KEY and LINKUP_API_KEY (GREENPT_API_KEY optional but
 * cheaper). Exits 0 on success, 1 on failure.
 */

import 'dotenv/config';

import { runDeepAgentResearch } from './services/research/deepAgent/index.js';
import { DEFAULT_BUDGET, type ResearchLocale } from './services/research/deepAgent/types.js';

function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 ? argv[idx + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

async function main(): Promise<void> {
  const question = arg('query') ?? 'Wie ambitioniert ist das Klimaziel der Stadt Wien für 2040?';
  const locale = (arg('locale') ?? 'de-DE') as ResearchLocale;
  const write = flag('write');

  console.log(`Frage:  ${question}`);
  console.log(`Locale: ${locale}`);
  console.log(
    `Modus:  ${write ? 'Dokument wird angelegt' : 'Trockenlauf (kein DB-Schreibvorgang)'}\n`
  );

  const started = Date.now();
  const seen = new Map<string, string>();

  const result = await runDeepAgentResearch({
    question,
    locale,
    signal: AbortSignal.timeout(DEFAULT_BUDGET.hardMs),
    progress: {
      onPlan: (steps) => {
        console.log('\n── Plan ──');
        for (const s of steps) console.log(`  [${s.status === 'done' ? 'x' : ' '}] ${s.label}`);
        console.log('');
      },
      onStep: (step) => {
        if (seen.get(step.id) === step.status) return;
        seen.set(step.id, step.status);
        const mark = step.status === 'done' ? '✓' : step.status === 'failed' ? '✗' : '…';
        console.log(`  ${mark} ${step.label}`);
      },
    },
  });

  const seconds = Math.round((Date.now() - started) / 1000);

  if (!result) {
    console.error(`\n✗ Kein verwertbarer Bericht nach ${seconds}s.`);
    process.exit(1);
  }

  console.log(`\n── Ergebnis nach ${seconds}s ──`);
  console.log(`Titel:    ${result.title}`);
  console.log(
    `Umfang:   ${result.markdown.length} Zeichen, ${result.markdown.split(/\s+/).length} Wörter`
  );
  console.log(`Quellen:  ${result.sources.length}`);
  console.log(`Vollständig: ${result.partial ? 'NEIN (Teilbericht)' : 'ja'}`);
  console.log(`\nZusammenfassung:\n${result.summary}\n`);

  if (write) {
    const { createDocumentWithContent } = await import('./services/docs/DocGenerationService.js');
    const userId = arg('user');
    if (!userId) {
      console.error('✗ --write braucht --user <userId>');
      process.exit(1);
    }
    const doc = await createDocumentWithContent(result.title, result.markdown, 'docs', userId);
    console.log(`Dokument angelegt: /office/${doc.id}`);
  } else {
    console.log('── Bericht ──\n');
    console.log(result.markdown);
  }

  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('✗ Lauf fehlgeschlagen:', error);
  process.exit(1);
});
