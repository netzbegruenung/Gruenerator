/**
 * Shared reporting plumbing for the docs manifest generators: the `--check`
 * gate, and the `--audit` path that turns drift into one deduplicated GitHub
 * issue or one sticky PR comment.
 *
 * The split in philosophy is deliberate and matches the existing generators:
 *
 *   --check   A committed manifest that no longer matches the code is a real
 *             error and BLOCKS. It means someone changed a config and didn't
 *             regenerate; the fix is one command.
 *   --audit   A capability that exists in code but has no hand-written German
 *             prose yet is a TASK, never a failed build. Adding a tool must not
 *             break someone else's PR — it files an issue that closes itself
 *             once the gap is filled.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { REPO_ROOT } from './ast.mjs';

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf-8' });
}

function readCommitted(outFile) {
  try {
    return readFileSync(outFile, 'utf-8');
  } catch {
    return ''; // missing file → stale
  }
}

/** One issue per article — create, update, or close it when the gap is gone. */
function syncIssue({ label, title, hasDrift, body, allClear }) {
  const open = JSON.parse(
    gh([
      'issue',
      'list',
      '--label',
      label,
      '--state',
      'open',
      '--json',
      'number,title',
      '--limit',
      '100',
    ])
  ).find((i) => i.title === title);

  if (!hasDrift) {
    if (!open) return 'nichts zu tun (keine Drift, kein offenes Issue)';
    gh(['issue', 'close', String(open.number), '--comment', allClear]);
    return `Issue #${open.number} geschlossen`;
  }
  if (open) {
    gh(['issue', 'edit', String(open.number), '--body', body]);
    return `Issue #${open.number} aktualisiert`;
  }
  return `Issue angelegt: ${gh(['issue', 'create', '--title', title, '--label', label, '--body', body]).trim()}`;
}

/**
 * Sticky, marker-keyed comment on the PR named by PR_NUMBER.
 *
 * Addresses the comment by its own id rather than `gh pr comment --edit-last`.
 * That matters as soon as more than one audit comments on the same PR:
 * `--edit-last` edits whatever comment came last, so two audits would keep
 * overwriting each other's report. The marker identifies ours; the id edits
 * exactly that one.
 */
function syncPrComment({ marker, hasDrift, body, allClear }) {
  const prNumber = process.env.PR_NUMBER;
  if (!prNumber) return 'PR_NUMBER fehlt — kein Kommentar';

  const existing = JSON.parse(
    gh(['api', `repos/{owner}/{repo}/issues/${prNumber}/comments`, '--paginate'])
  ).find((c) => typeof c.body === 'string' && c.body.includes(marker));

  const patch = (text) =>
    gh([
      'api',
      '-X',
      'PATCH',
      `repos/{owner}/{repo}/issues/comments/${existing.id}`,
      '-f',
      `body=${text}`,
    ]);

  if (!hasDrift) {
    if (!existing) return 'nichts zu tun (keine Drift)';
    // gh cannot delete comments; overwrite with the all-clear instead.
    patch(`${marker}\n\n✓ ${allClear}`);
    return 'Kommentar auf „alles dokumentiert" gesetzt';
  }
  if (existing) {
    patch(body);
    return 'PR-Kommentar aktualisiert';
  }
  gh(['pr', 'comment', prNumber, '--body', body]);
  return 'PR-Kommentar gepostet';
}

/**
 * The whole CLI for a manifest generator. `generate()` returns the JSON text and
 * a short count label; `audit(manifest)` returns `{ hasDrift, body }` and is only
 * called for `--audit`.
 *
 * `audit` is optional. A manifest whose source already carries the user-facing
 * German (labels *and* descriptions written for the screen) has no hand-written
 * half that could go missing, so there is nothing to audit — `--check` is the
 * whole contract for those.
 */
export function runGenerator({
  outFile,
  generate,
  audit,
  label,
  issueTitle,
  marker,
  allClear,
  regenerateCmd,
}) {
  const argv = process.argv;
  const absOut = path.join(REPO_ROOT, outFile);
  const { json, summary } = generate();

  if (argv.includes('--audit') && !audit) {
    console.error(`✗ ${outFile} has no audit — this generator only supports --check.`);
    process.exit(1);
  }

  if (argv.includes('--audit')) {
    const committed = readCommitted(absOut);
    const manifestStale = committed !== json;
    const { hasDrift, body } = audit(JSON.parse(json), manifestStale);
    const okMessage = `✓ ${summary} — alles dokumentiert und das Manifest ist aktuell.`;

    console.log(hasDrift ? body : okMessage);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, hasDrift ? body : `${okMessage}\n`);
    }
    if (argv.includes('--apply')) {
      console.log(`→ ${syncIssue({ label, title: issueTitle, hasDrift, body, allClear })}`);
    }
    if (argv.includes('--pr-comment')) {
      console.log(`→ ${syncPrComment({ marker, hasDrift, body, allClear })}`);
    }
    // Reporting only — drift is a task, never a failed build.
    process.exit(0);
  }

  if (argv.includes('--check')) {
    if (readCommitted(absOut) !== json) {
      console.error(
        `✗ ${outFile} is out of date (${summary}).\n` +
          `  Something changed in code but the manifest wasn't regenerated.\n` +
          `  Run: ${regenerateCmd}`
      );
      process.exit(1);
    }
    console.log(`✓ ${outFile} is up to date (${summary}).`);
    return;
  }

  mkdirSync(path.dirname(absOut), { recursive: true });
  writeFileSync(absOut, json);
  console.log(`✓ Wrote ${summary} → ${outFile}`);
}
