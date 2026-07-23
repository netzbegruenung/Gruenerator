/**
 * Weekly AI Documentation Freshness Check
 *
 * Audits each feature/tutorial documentation article (documentation/docs/) against
 * the *current* web-app source code and files a deduplicated GitHub issue per stale
 * article. Because the web app has no i18n layer (German UI strings are hardcoded in
 * JSX), a Claude agent can grep the source to confirm whether a documented button /
 * slash-command / modal / menu label still exists with the same name.
 *
 * One read-only Claude agent runs per doc via the Claude Agent SDK (Read/Grep/Glob
 * only). It authenticates against a Claude Max subscription via CLAUDE_CODE_OAUTH_TOKEN
 * (from `claude setup-token`), not a pay-per-token API key.
 *
 * Flags:
 *   --apply              Create / update / close GitHub issues. Default = dry-run
 *                        (prints verdicts, touches nothing).
 *   --doc <relpath>      Audit a single doc (relative to documentation/docs/),
 *                        e.g. --doc gruenerieren/ki-chat.md
 *   --docs <a,b>         Audit an explicit comma-separated list of docs.
 *   --changed-files <f>  Reverse-map the newline-separated source paths in file <f>
 *                        (a PR's changed files) to the doc folders they affect, and
 *                        audit only those. Empty match = successful no-op.
 *   --pr-comment         Post ONE sticky PR comment (marker-keyed, edited in place)
 *                        instead of filing issues. Needs GITHUB_REPOSITORY + PR_NUMBER.
 *   --concurrency <n>    Max parallel doc audits (default: 2; each spawns a subprocess)
 *   --model <id>         Override the Claude model (default: claude-sonnet-4-6 or
 *                        DOCS_CHECK_MODEL)
 *
 * Env:
 *   CLAUDE_CODE_OAUTH_TOKEN  Claude Max subscription token (preferred) — or
 *   ANTHROPIC_API_KEY        API key fallback
 *   GH_TOKEN                 GitHub token (only needed with --apply)
 *   DOCS_CHECK_MODEL         Optional model override
 *   GITHUB_STEP_SUMMARY      If set (CI), a markdown summary table is appended
 *
 * Examples:
 *   npx tsx check-docs-freshness.ts --doc gruenerieren/ki-chat.md   # one doc, dry-run
 *   npx tsx check-docs-freshness.ts                                 # full scope, dry-run
 *   npx tsx check-docs-freshness.ts --apply                         # full scope + issues
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { query } from '@anthropic-ai/claude-agent-sdk';
import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';

import { parallelLimit } from './utils/parallelLimit.js';

// ── Paths ───────────────────────────────────────────────────────────────────
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const DOCS_ROOT = path.join(REPO_ROOT, 'documentation', 'docs');

// ── Scope ───────────────────────────────────────────────────────────────────
// Feature/tutorial docs only — folders that describe the app UI. Content archives
// (newsletter, intern, landesverbaende) and concept docs (llm-basics,
// Grundlagen) are intentionally excluded: they have nothing to verify against code.
const SCOPE_FOLDERS = [
  'ueber-den-gruenerator',
  'gruenerieren',
  'integrationen',
  'Profil',
  'notebooks',
  'agents',
  'monitor',
  'signal-nachrichten',
] as const;

// Optional hints (doc folder → likely source dirs) to focus the agent's search and
// cut token use. Non-essential; the agent can grep without them.
const AREA_HINTS: Record<string, string> = {
  gruenerieren: 'packages/chat, apps/web/src/features/chat, apps/web/src/features/models',
  agents: 'apps/web/src/features/agents, packages/chat',
  notebooks: 'apps/web/src/features/notebook',
  monitor: 'apps/web/src/features/monitor',
  Profil: 'apps/web/src/features/wolke, apps/web/src/features/user-defaults',
  integrationen: 'apps/web/src/features/connections, services/mcp',
};

const DEFAULT_MODEL = process.env.DOCS_CHECK_MODEL || 'claude-sonnet-4-6';

const ISSUE_LABEL = 'docs-freshness';
const ISSUE_TITLE_PREFIX = 'Docs freshness: ';

// ── CLI ─────────────────────────────────────────────────────────────────────
interface CliArgs {
  apply: boolean;
  doc?: string;
  docs?: string[]; // explicit multi-doc list (relative to documentation/docs/)
  changedFilesPath?: string; // newline-separated changed source paths → reverse-mapped to docs
  prComment: boolean; // post one sticky PR comment instead of filing issues
  concurrency: number;
  model: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { apply: false, prComment: false, concurrency: 2, model: DEFAULT_MODEL };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--apply':
        result.apply = true;
        break;
      case '--doc':
        result.doc = args[++i];
        break;
      case '--docs':
        result.docs = (args[++i] || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case '--changed-files':
        result.changedFilesPath = args[++i];
        break;
      case '--pr-comment':
        result.prComment = true;
        break;
      case '--concurrency':
        result.concurrency = Math.max(1, parseInt(args[++i], 10) || 2);
        break;
      case '--model':
        result.model = args[++i] || DEFAULT_MODEL;
        break;
      default:
        break;
    }
  }

  return result;
}

// ── Verdict schema ──────────────────────────────────────────────────────────
const FindingSchema = z.object({
  claim: z.string(),
  docQuote: z.string(),
  codeEvidence: z.string(),
  severity: z.enum(['high', 'medium']),
  suggestedFix: z.string(),
});
type Finding = z.infer<typeof FindingSchema>;

const VerdictSchema = z.object({
  upToDate: z.boolean(),
  findings: z.array(FindingSchema),
});
type Verdict = z.infer<typeof VerdictSchema>;

interface DocResult {
  docPath: string; // relative to documentation/docs/
  status: 'ok' | 'error';
  upToDate: boolean;
  findings: Finding[];
  error?: string;
  durationS: number;
}

// ── Doc discovery ───────────────────────────────────────────────────────────
function collectMarkdown(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // folder may not exist
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      collectMarkdown(full, out);
    } else if (name.endsWith('.md') || name.endsWith('.mdx')) {
      out.push(full);
    }
  }
}

function docsInFolders(folders: readonly string[]): string[] {
  const abs: string[] = [];
  for (const folder of folders) {
    collectMarkdown(path.join(DOCS_ROOT, folder), abs);
  }
  return abs.map((f) => path.relative(DOCS_ROOT, f)).sort();
}

function discoverDocs(single?: string): string[] {
  if (single) {
    const rel = single.replace(/^documentation\/docs\//, '');
    return [rel];
  }
  return docsInFolders(SCOPE_FOLDERS);
}

// Reverse of AREA_HINTS: given the source files a PR changed, which doc folders
// could be affected. Coarse (folder-level) on purpose — each folder holds only a
// few docs, and the AI audit filters false positives downstream. Folders without
// an AREA_HINTS entry (intro/signal docs) are never triggered by a source change.
function foldersForChangedFiles(changedFiles: string[]): string[] {
  const affected = new Set<string>();
  for (const [folder, dirsCsv] of Object.entries(AREA_HINTS)) {
    const prefixes = dirsCsv
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    if (changedFiles.some((f) => prefixes.some((p) => f.startsWith(p)))) {
      affected.add(folder);
    }
  }
  return [...affected];
}

function docsForChangedFiles(changedFilesPath: string): string[] {
  const changed = readFileSync(changedFilesPath, 'utf-8')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return docsInFolders(foldersForChangedFiles(changed));
}

// ── Agent ───────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a documentation freshness auditor for the Grünerator web app — a React app for the German (de-DE) and Austrian (de-AT) Green party. Your job: verify whether a documentation article still accurately describes the app's CURRENT UI, by reading the actual source code.

Key facts about the codebase:
- The web app has NO i18n layer. Every user-facing German string is hardcoded directly in JSX: button text, \`title="..."\` attributes, \`<DialogTitle>...</DialogTitle>\`, menu/tab labels.
- UI source lives mainly in \`apps/web/src/features/<feature>/\`. Shared chat UI and the slash-command / model / tool configs live in \`packages/chat/\`. Shared components live in \`packages/shared/src/\`.
- Slash-commands (e.g. \`/antrag\`, \`/presse\`) and \`@\`-mentions (e.g. \`@grundsatz\`, \`@websearch\`) are defined in config files — search \`packages/chat\` for them.

Method:
1. Read the article and extract every CONCRETE, VERIFIABLE UI claim: exact button/menu/tab labels, slash-command names, @-mention shortcuts, modal/dialog titles, icon names, and described positions ("oben links", "in der Seitenleiste").
2. For each claim, use Grep / Glob / Read to locate the corresponding code and confirm the exact string / command still exists.
3. Classify each claim: confirmed (still accurate) or DISCREPANCY (the doc says X but the code clearly shows Y, or X no longer exists anywhere).

Rules:
- Report ONLY high-confidence discrepancies. If you cannot find clear code evidence either way, treat the claim as confirmed — do NOT report uncertain cases. False positives create noise.
- Ignore marketing / explanatory prose, conceptual descriptions, screenshots and images (you cannot see them), and minor stylistic wording.
- Every discrepancy MUST cite concrete code evidence as \`path/to/file.tsx:line\`.
- Be efficient: target your searches; you do not need to read whole feature directories.

When finished, output your verdict as a SINGLE fenced \`\`\`json code block and nothing after it, matching exactly this shape:
{
  "upToDate": true,
  "findings": [
    {
      "claim": "short description of the documented UI element",
      "docQuote": "the exact phrase or sentence from the doc",
      "codeEvidence": "apps/web/src/.../File.tsx:123 — what the code actually shows",
      "severity": "high",
      "suggestedFix": "concise correction for the doc"
    }
  ]
}
If everything checks out, return {"upToDate": true, "findings": []}.`;

function buildUserPrompt(docPath: string, content: string): string {
  const folder = docPath.split('/')[0];
  const hint = AREA_HINTS[folder];
  return [
    'Audit this documentation article for freshness against the current source code.',
    '',
    `Article path: documentation/docs/${docPath}`,
    hint ? `Likely relevant source dirs: ${hint}` : '',
    '',
    '--- ARTICLE CONTENT ---',
    content,
    '--- END ARTICLE ---',
    '',
    'Search the codebase to verify the UI claims, then output the JSON verdict.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

function extractVerdict(text: string): Verdict {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  let raw: string;
  if (blocks.length > 0) {
    raw = blocks[blocks.length - 1][1].trim();
  } else {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last <= first) {
      throw new Error('no JSON verdict found in agent output');
    }
    raw = text.slice(first, last + 1);
  }
  const parsed = JSON.parse(jsonrepair(raw)) as unknown;
  return VerdictSchema.parse(parsed);
}

async function auditDoc(docPath: string, model: string): Promise<DocResult> {
  const start = Date.now();
  const base: Pick<DocResult, 'docPath'> = { docPath };

  let content: string;
  try {
    content = readFileSync(path.join(DOCS_ROOT, docPath), 'utf-8');
  } catch (err) {
    return {
      ...base,
      status: 'error',
      upToDate: true,
      findings: [],
      error: `cannot read doc: ${err instanceof Error ? err.message : String(err)}`,
      durationS: 0,
    };
  }

  try {
    let finalText = '';
    let endedBadly: string | null = null;

    for await (const message of query({
      prompt: buildUserPrompt(docPath, content),
      options: {
        model,
        cwd: REPO_ROOT,
        systemPrompt: SYSTEM_PROMPT,
        maxTurns: 40,
        allowedTools: ['Read', 'Grep', 'Glob'],
        disallowedTools: [
          'Edit',
          'MultiEdit',
          'Write',
          'NotebookEdit',
          'Bash',
          'WebFetch',
          'WebSearch',
          'Task',
        ],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        settingSources: [],
      },
    })) {
      if (message.type === 'result') {
        if (message.subtype === 'success') {
          finalText = message.result;
        } else {
          endedBadly = message.subtype;
        }
      }
    }

    if (endedBadly) {
      return {
        ...base,
        status: 'error',
        upToDate: true,
        findings: [],
        error: `agent ended: ${endedBadly}`,
        durationS: Math.round((Date.now() - start) / 1000),
      };
    }

    const verdict = extractVerdict(finalText);
    return {
      ...base,
      status: 'ok',
      upToDate: verdict.upToDate && verdict.findings.length === 0,
      findings: verdict.findings,
      durationS: Math.round((Date.now() - start) / 1000),
    };
  } catch (err) {
    return {
      ...base,
      status: 'error',
      upToDate: true,
      findings: [],
      error: err instanceof Error ? err.message : String(err),
      durationS: Math.round((Date.now() - start) / 1000),
    };
  }
}

// ── GitHub issues (gh CLI, no shell) ────────────────────────────────────────
function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf-8' });
}

function ensureLabel(): void {
  try {
    gh([
      'label',
      'create',
      ISSUE_LABEL,
      '--color',
      'FBCA04',
      '--description',
      'AI-detected documentation drift vs. the app UI',
      '--force',
    ]);
  } catch {
    // Label likely already exists; ignore.
  }
}

interface OpenIssue {
  number: number;
  title: string;
}

// Fetch every open freshness issue once and index by exact title — more robust than
// per-doc `gh issue list --search` (search syntax is fuzzy and can miss exact titles).
function loadOpenIssues(): Map<string, number> {
  const out = gh([
    'issue',
    'list',
    '--label',
    ISSUE_LABEL,
    '--state',
    'open',
    '--json',
    'number,title',
    '--limit',
    '200',
  ]);
  const issues = JSON.parse(out) as OpenIssue[];
  return new Map(issues.map((i) => [i.title, i.number]));
}

function buildIssueBody(result: DocResult, today: string): string {
  const lines: string[] = [];
  lines.push(`<!-- ${ISSUE_LABEL}:${result.docPath} -->`);
  lines.push('');
  lines.push(
    `The weekly AI freshness check found **${result.findings.length}** likely mismatch(es) between ` +
      `\`documentation/docs/${result.docPath}\` and the current app UI.`
  );
  lines.push('');
  for (const [i, f] of result.findings.entries()) {
    lines.push(`### ${i + 1}. ${f.claim} _(${f.severity})_`);
    lines.push('');
    lines.push(`- **Doc says:** ${f.docQuote}`);
    lines.push(`- **Code shows:** ${f.codeEvidence}`);
    lines.push(`- **Suggested fix:** ${f.suggestedFix}`);
    lines.push('');
  }
  lines.push('---');
  lines.push(
    `_Automated by \`check-docs-freshness.ts\` on ${today}. ` +
      `Findings are AI-generated — verify before editing. Close this issue once the doc is corrected; ` +
      `the next run will reopen a fresh one only if drift remains._`
  );
  return lines.join('\n');
}

interface IssueActions {
  created: string[];
  updated: string[];
  closed: string[];
}

function syncIssues(results: DocResult[], today: string): IssueActions {
  ensureLabel();
  const openByTitle = loadOpenIssues();
  const actions: IssueActions = { created: [], updated: [], closed: [] };

  for (const r of results) {
    if (r.status !== 'ok') continue; // never churn issues on agent errors

    const title = ISSUE_TITLE_PREFIX + r.docPath;
    const existing = openByTitle.get(title);

    if (!r.upToDate) {
      const body = buildIssueBody(r, today);
      if (existing !== undefined) {
        gh(['issue', 'edit', String(existing), '--body', body]);
        gh([
          'issue',
          'comment',
          String(existing),
          '--body',
          `Still stale as of ${today} — ${r.findings.length} finding(s). Body updated.`,
        ]);
        actions.updated.push(r.docPath);
      } else {
        gh([
          'issue',
          'create',
          '--title',
          title,
          '--label',
          ISSUE_LABEL,
          '--label',
          'documentation',
          '--body',
          body,
        ]);
        actions.created.push(r.docPath);
      }
    } else if (existing !== undefined) {
      gh([
        'issue',
        'close',
        String(existing),
        '--comment',
        `Verified up to date on ${today} by the AI freshness check. Closing.`,
      ]);
      actions.closed.push(r.docPath);
    }
  }

  return actions;
}

// ── Sticky PR comment (shift-left mode) ─────────────────────────────────────
const PR_COMMENT_MARKER = '<!-- docs-freshness-pr -->';

function buildPrCommentBody(results: DocResult[], today: string): string {
  const stale = results.filter((r) => r.status === 'ok' && !r.upToDate);
  const lines: string[] = [PR_COMMENT_MARKER, '', '## 📝 Docs-Freshness-Check', ''];

  if (stale.length === 0) {
    lines.push(
      `✅ Keine Abweichungen zwischen den betroffenen Doku-Artikeln und dieser Änderung gefunden ` +
        `(${results.length} Artikel geprüft).`
    );
    return lines.join('\n');
  }

  lines.push(
    `⚠️ Diese Änderung betrifft **${stale.length}** Doku-Artikel, die evtl. veraltet sind. ` +
      `Bitte prüfen und ggf. anpassen — dieser Kommentar **blockiert den Merge nicht**.`
  );
  lines.push('');
  for (const r of stale) {
    lines.push(
      `<details><summary><code>documentation/docs/${r.docPath}</code> — ` +
        `${r.findings.length} mögliche Abweichung(en)</summary>`
    );
    lines.push('');
    for (const [i, f] of r.findings.entries()) {
      lines.push(`**${i + 1}. ${f.claim}** _(${f.severity})_`);
      lines.push(`- **Doku sagt:** ${f.docQuote}`);
      lines.push(`- **Code zeigt:** ${f.codeEvidence}`);
      lines.push(`- **Vorschlag:** ${f.suggestedFix}`);
      lines.push('');
    }
    lines.push('</details>');
    lines.push('');
  }
  lines.push('---');
  lines.push(
    `_KI-generiert von \`check-docs-freshness.ts\` am ${today}. Findings sind automatisch erzeugt — ` +
      `vor dem Übernehmen verifizieren._`
  );
  return lines.join('\n');
}

// Upsert one marker-keyed comment on the PR so re-runs edit in place instead of
// stacking. Needs GITHUB_REPOSITORY + PR_NUMBER (both set by the workflow).
function postPrComment(body: string): void {
  const repo = process.env.GITHUB_REPOSITORY;
  const pr = process.env.PR_NUMBER;
  if (!repo || !pr) {
    console.error('--pr-comment needs GITHUB_REPOSITORY and PR_NUMBER in env.');
    return;
  }

  let existingId: string | undefined;
  try {
    const ids = gh([
      'api',
      `repos/${repo}/issues/${pr}/comments`,
      '--paginate',
      '--jq',
      `.[] | select(.body | contains("${PR_COMMENT_MARKER}")) | .id`,
    ])
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    existingId = ids[0];
  } catch (err) {
    console.warn(`Could not list PR comments: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (existingId) {
    gh([
      'api',
      '--method',
      'PATCH',
      `repos/${repo}/issues/comments/${existingId}`,
      '-f',
      `body=${body}`,
    ]);
    console.log(`Updated sticky PR comment ${existingId}.`);
  } else {
    gh(['api', '--method', 'POST', `repos/${repo}/issues/${pr}/comments`, '-f', `body=${body}`]);
    console.log('Created sticky PR comment.');
  }
}

// ── Summary output ──────────────────────────────────────────────────────────
function writeStepSummary(results: DocResult[], actions: IssueActions | null): void {
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (!stepSummary) return;

  const stale = results.filter((r) => r.status === 'ok' && !r.upToDate);
  const errored = results.filter((r) => r.status === 'error');

  const lines: string[] = [];
  lines.push('## Documentation Freshness Check');
  lines.push('');
  lines.push(
    `Checked **${results.length}** docs · **${stale.length}** stale · **${errored.length}** errored`
  );
  if (actions) {
    lines.push('');
    lines.push(
      `Issues: ${actions.created.length} created · ${actions.updated.length} updated · ${actions.closed.length} closed`
    );
  }
  lines.push('');
  lines.push('| Doc | Status | Findings |');
  lines.push('| --- | --- | --- |');
  for (const r of results) {
    const status = r.status === 'error' ? `⚠️ error` : r.upToDate ? '✅ ok' : '❌ stale';
    const detail = r.status === 'error' ? (r.error ?? '') : String(r.findings.length);
    lines.push(`| \`${r.docPath}\` | ${status} | ${detail} |`);
  }
  lines.push('');

  appendFileSync(stepSummary, lines.join('\n'));
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs();

  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
    // Local dev: fall back to the Claude CLI's stored login. CI MUST set
    // CLAUDE_CODE_OAUTH_TOKEN (the agent has no stored login there).
    console.warn(
      'No CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY in env — relying on the Claude CLI stored ' +
        'login (local dev). In CI, set CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`).'
    );
  }

  if ((args.apply || args.prComment) && !process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    console.error('--apply / --pr-comment require GH_TOKEN (or GITHUB_TOKEN) for the gh CLI.');
    process.exit(1);
  }

  // Doc resolution: explicit list / changed-files reverse map / single / full scope.
  let docs: string[];
  if (args.docs?.length) {
    docs = args.docs.map((d) => d.replace(/^documentation\/docs\//, ''));
  } else if (args.changedFilesPath) {
    docs = docsForChangedFiles(args.changedFilesPath);
  } else {
    docs = discoverDocs(args.doc);
  }

  if (docs.length === 0) {
    // In change-triggered mode, "no affected docs" is a normal, successful no-op.
    if (args.changedFilesPath) {
      console.log('No documentation folders map to the changed source files — nothing to audit.');
      return;
    }
    console.error('No docs in scope.');
    process.exit(1);
  }

  const mode = args.prComment
    ? 'PR COMMENT (sticky comment, non-blocking)'
    : args.apply
      ? 'APPLY (issues will be written)'
      : 'DRY RUN';

  console.log('========================================');
  console.log('  Documentation Freshness Check');
  console.log('========================================');
  console.log(`Docs:        ${docs.length}`);
  console.log(`Model:       ${args.model}`);
  console.log(`Concurrency: ${args.concurrency}`);
  console.log(`Mode:        ${mode}`);
  console.log('');

  const tasks = docs.map((docPath) => async (): Promise<DocResult> => {
    console.log(`--- [START] ${docPath}`);
    const result = await auditDoc(docPath, args.model);
    if (result.status === 'error') {
      console.log(`  [ERROR] ${docPath}: ${result.error} (${result.durationS}s)`);
    } else if (result.upToDate) {
      console.log(`  [OK] ${docPath} — up to date (${result.durationS}s)`);
    } else {
      console.log(
        `  [STALE] ${docPath} — ${result.findings.length} finding(s) (${result.durationS}s)`
      );
      for (const f of result.findings) {
        console.log(`      • [${f.severity}] ${f.claim} → ${f.codeEvidence}`);
      }
    }
    return result;
  });

  const results = await parallelLimit(tasks, args.concurrency);

  const stale = results.filter((r) => r.status === 'ok' && !r.upToDate);
  const ok = results.filter((r) => r.status === 'ok' && r.upToDate);
  const errored = results.filter((r) => r.status === 'error');

  const today = new Date().toISOString().slice(0, 10);

  let actions: IssueActions | null = null;
  if (args.prComment) {
    console.log('\nPosting sticky PR comment...');
    postPrComment(buildPrCommentBody(results, today));
  } else if (args.apply) {
    console.log('\nSyncing GitHub issues...');
    actions = syncIssues(results, today);
    console.log(
      `  created ${actions.created.length} · updated ${actions.updated.length} · closed ${actions.closed.length}`
    );
  }

  console.log('\n========================================');
  console.log('  SUMMARY');
  console.log('========================================');
  console.log(`  Checked:  ${results.length}`);
  console.log(`  Up to date: ${ok.length}`);
  console.log(`  Stale:    ${stale.length}`);
  console.log(`  Errored:  ${errored.length}`);
  if (!args.apply && !args.prComment && stale.length > 0) {
    console.log('  (dry run — no issues written; re-run with --apply)');
  }
  console.log('========================================\n');

  // Structured summary for CI consumption.
  const summaryPath =
    process.env.DOCS_CHECK_SUMMARY_PATH ?? path.join(process.cwd(), 'docs-freshness-summary.json');
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        apply: args.apply,
        model: args.model,
        totals: {
          checked: results.length,
          upToDate: ok.length,
          stale: stale.length,
          errored: errored.length,
        },
        actions,
        results,
      },
      null,
      2
    )
  );
  console.log(`Summary written to ${summaryPath}`);

  writeStepSummary(results, actions);
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
