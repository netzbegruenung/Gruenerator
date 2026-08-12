/**
 * Continues a research whose process died — the only thing that ever reads a
 * checkpoint back.
 *
 * Usage:
 *   pnpm --filter @gruenerator/api resume-research               # was ist offen?
 *   pnpm --filter @gruenerator/api resume-research <thread-id>   # einen fortsetzen
 *   pnpm --filter @gruenerator/api resume-research --aufraeumen  # Frist anwenden
 *
 * Deliberately a script and not a boot-time sweep: production forks one process
 * per core and each would grab the same threads, a research costs minutes of
 * model time plus a Linkup allowance, and nobody is watching the chat it
 * belonged to any more. Continuing one is a decision, so it takes a person.
 *
 * The report goes to stdout. `--write --user <id>` files it as a real document,
 * exactly like test-deep-agent.ts.
 */

import 'dotenv/config';

import { getPostgresInstance } from './database/services/PostgresService/index.js';
import { runDeepAgentResearch } from './services/research/deepAgent/index.js';
import { buildNotebookScope } from './services/research/deepAgent/notebookScope.js';
import { describeResumableRuns } from './services/research/deepAgent/resumableRuns.js';
import {
  getRun,
  purgeExpiredRuns,
  recordRunDocument,
} from './services/research/deepAgent/runRegistry.js';
import { DEFAULT_BUDGET, type ResearchLocale } from './services/research/deepAgent/types.js';

function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}
function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  // The registry lives in the app's database, so the pool has to exist before
  // anything here can read it.
  await getPostgresInstance().init();

  if (flag('aufraeumen')) {
    const purged = await purgeExpiredRuns();
    console.log(`${purged} abgelaufene Läufe entfernt.`);
    process.exit(0);
  }

  const threadId = process.argv.slice(2).find((a) => !a.startsWith('--'));

  if (!threadId) {
    const open = await describeResumableRuns();
    if (open.length === 0) {
      console.log('Keine fortsetzbaren Läufe.');
    } else {
      console.log('Fortsetzbare Läufe:\n');
      for (const line of open) console.log(`  ${line}`);
      console.log('\nFortsetzen: pnpm --filter @gruenerator/api resume-research <thread-id>');
    }
    process.exit(0);
  }

  const record = await getRun(threadId);
  if (!record) {
    console.error(`✗ Kein Lauf mit der ID ${threadId}.`);
    process.exit(1);
  }
  if (record.status !== 'running') {
    console.error(
      `✗ Lauf ${threadId} ist bereits ${record.status} — fortsetzen würde eine fertige Recherche neu aufrollen.`
    );
    process.exit(1);
  }

  const locale = record.locale as ResearchLocale;
  const scope = buildNotebookScope({}, locale, record.user_id ?? 'resume');

  console.log(`Setze fort: ${threadId}`);
  console.log(`Frage:      ${record.question}\n`);

  const seen = new Map<string, string>();
  const result = await runDeepAgentResearch({
    question: record.question,
    locale,
    // THE point of this script: the same thread id, so the checkpointer hands
    // the agent back what it already found instead of starting over.
    threadId,
    ...(record.user_id ? { userId: record.user_id } : {}),
    ...(scope ? { notebookScope: scope } : {}),
    signal: AbortSignal.timeout(DEFAULT_BUDGET.hardMs + DEFAULT_BUDGET.wrapUpMs),
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

  if (!result) {
    console.error('\n✗ Auch die Fortsetzung lieferte keinen verwertbaren Bericht.');
    process.exit(1);
  }

  console.log(`\nTitel:   ${result.title}`);
  console.log(`Umfang:  ${result.markdown.length} Zeichen, ${result.sources.length} Quellen`);
  console.log(`Vollständig: ${result.partial ? 'NEIN (Teilbericht)' : 'ja'}\n`);

  if (flag('write')) {
    const userId = arg('user') ?? record.user_id;
    if (!userId) {
      console.error('✗ --write braucht --user <userId> (der Lauf hat keinen gespeichert)');
      process.exit(1);
    }
    const { createDocumentWithContent } = await import('./services/docs/DocGenerationService.js');
    const doc = await createDocumentWithContent(result.title, result.markdown, 'docs', userId);
    await recordRunDocument(threadId, doc.id);
    console.log(`Dokument angelegt: /office/${doc.id}`);
  } else {
    console.log(result.markdown);
  }

  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('✗ Fortsetzung fehlgeschlagen:', error);
  process.exit(1);
});
