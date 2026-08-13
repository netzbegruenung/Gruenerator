/**
 * Weekly AI Documentation Freshness Check
 *
 * Audits each feature/tutorial documentation article (documentation/docs/) — plus
 * the in-app tours (touren/) and the repo-root README (readme/README.md) as
 * pseudo-docs — against the *current* web-app source code and files a deduplicated
 * GitHub issue per stale article. Because the web app has no i18n layer (German UI strings are hardcoded in
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
 *                        e.g. --doc chat/ki-chat.md
 *   --docs <a,b>         Audit an explicit comma-separated list of docs.
 *   --changed-files <f>  Reverse-map the newline-separated source paths in file <f>
 *                        (a PR's changed files) to the doc folders they affect, and
 *                        audit only those. Empty match = successful no-op.
 *   --pr-comment         Post ONE sticky PR comment (marker-keyed, edited in place)
 *                        instead of filing issues. Needs GITHUB_REPOSITORY + PR_NUMBER.
 *   --concurrency <n>    Max parallel doc audits (default: 2; each spawns a subprocess)
 *   --model <id>         Override the Claude model (default: claude-sonnet-5 or
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
 *   npx tsx check-docs-freshness.ts --doc chat/ki-chat.md   # one doc, dry-run
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

import {
  AREA_HINTS,
  foldersForChangedFiles,
  README_FOLDER,
  SCOPE_FOLDERS,
  TOURS_FOLDER,
} from './docsFreshnessAreas.js';
import { neutralizeGithubMentions } from './utils/githubMentions.js';
import { parallelLimit } from './utils/parallelLimit.js';

// ── Paths ───────────────────────────────────────────────────────────────────
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const DOCS_ROOT = path.join(REPO_ROOT, 'documentation', 'docs');
// TOURS_FOLDER / README_FOLDER (the virtual folders these two pseudo-doc
// sources are audited under) live in docsFreshnessAreas.ts — they are keys of
// AREA_HINTS.
const TOURS_ROOT = path.join(REPO_ROOT, 'apps', 'web', 'src', 'features', 'tours');
const README_DOC = `${README_FOLDER}/README.md`;
const README_PATH = path.join(REPO_ROOT, 'README.md');

// SCOPE_FOLDERS and AREA_HINTS: see docsFreshnessAreas.ts.

const DEFAULT_MODEL = process.env.DOCS_CHECK_MODEL || 'claude-sonnet-5';

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
  /**
   * `low` is ACCEPTED but never reported — see `extractVerdict`.
   *
   * The prompt asks for high-confidence discrepancies only, and the enum used to
   * encode that by allowing just the two levels. The effect was the opposite of
   * the intent: on 11.08.2026 a model returned two `low` findings, the whole
   * verdict failed to parse, the retry repeated it, and the article
   * (chat/ki-chat.mdx) ended up with NO result at all — neither ✅ nor ⚠️. A
   * severity we reject costs us the high and medium findings sitting next to it.
   */
  severity: z.enum(['high', 'medium', 'low']),
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

function tourDocs(): string[] {
  try {
    return readdirSync(TOURS_ROOT)
      .filter((f) => f.endsWith('Tour.ts') && f !== 'runTour.ts')
      .map((f) => `${TOURS_FOLDER}/${f}`)
      .sort();
  } catch {
    return [];
  }
}

function docsInFolders(folders: readonly string[]): string[] {
  const abs: string[] = [];
  const rel: string[] = [];
  for (const folder of folders) {
    if (folder === TOURS_FOLDER) {
      rel.push(...tourDocs());
      continue;
    }
    if (folder === README_FOLDER) {
      rel.push(README_DOC);
      continue;
    }
    collectMarkdown(path.join(DOCS_ROOT, folder), abs);
  }
  return [...abs.map((f) => path.relative(DOCS_ROOT, f)), ...rel].sort();
}

function discoverDocs(single?: string): string[] {
  if (single) {
    const rel = single.replace(/^documentation\/docs\//, '');
    return [rel];
  }
  return docsInFolders([...SCOPE_FOLDERS, TOURS_FOLDER, README_FOLDER]);
}

// Where a (pseudo-)doc actually lives in the repo — for issue/comment display.
function docSourcePath(docPath: string): string {
  if (docPath.startsWith(`${TOURS_FOLDER}/`)) {
    return `apps/web/src/features/tours/${docPath.slice(TOURS_FOLDER.length + 1)}`;
  }
  if (docPath === README_DOC) return 'README.md';
  return `documentation/docs/${docPath}`;
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

JSON output rules — the verdict is parsed by a strict JSON parser, not read by a human:
- Do NOT use markdown code spans (backticks) or nested triple-backtick fences inside any JSON string value (\`claim\`, \`docQuote\`, \`codeEvidence\`, \`suggestedFix\`). Write identifiers, commands and code snippets as plain text instead, e.g. codeEvidence: apps/foo.tsx:12 shows label 'Speichern', not codeEvidence: \`apps/foo.tsx:12\` shows \`Speichern\`.
- Every double quote inside a string value MUST be escaped (\\").
- Do not include literal newlines inside a string value — write the sentence on one line.
- \`severity\` must be exactly "high" or "medium". A discrepancy you would rate lower than that is one you should not report at all (see the rule above): leave it out.

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
  if (folder === TOURS_FOLDER) {
    return [
      'Audit this in-app product tour (driver.js module) for freshness against the current source code.',
      '',
      `Tour module: apps/web/src/features/tours/${docPath.slice(TOURS_FOLDER.length + 1)}`,
      hint ? `Likely relevant source dirs: ${hint}` : '',
      '',
      'Each step highlights the element matched by its `[data-tour="..."]` selector and shows a popover with title + description. The step titles and descriptions are the UI claims to verify: grep for the matching `data-tour="..."` attribute (or a `dataTour="..."` prop / dynamic template), read the anchored component, and confirm the text still accurately describes what that element shows or does (labels, listed features, keyboard shortcuts, described positions).',
      'Anchor EXISTENCE is checked deterministically elsewhere — focus on whether the wording still matches the UI.',
      '',
      '--- TOUR MODULE ---',
      content,
      '--- END TOUR MODULE ---',
      '',
      'Search the codebase to verify the step texts, then output the JSON verdict.',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }
  if (folder === README_FOLDER) {
    return [
      'Audit the repository README for freshness against the current codebase. Unlike the app docs, its verifiable claims are STRUCTURAL, not UI labels:',
      '',
      '- Workspace tables (apps / packages / services) and their counts — compare against the actual `apps/`, `packages/` and `services/` directories.',
      '- Development commands — compare against the `scripts` in the root `package.json`.',
      '- Framework/version claims and badges (React, Vite, Expo, Node, Express, Tailwind) — compare against the relevant `package.json` dependencies.',
      '- AI provider claims — compare against `apps/api/workers/providers/` and `apps/api/services/ai/`. Providers documented as removed elsewhere must not be advertised.',
      '- Environment variable names in the Configuration section — compare against `.env.example`.',
      '- Feature claims that name concrete surfaces or packages — confirm the named feature dir/package exists.',
      '',
      'Ignore marketing prose, the problem/solution narrative, external URLs, and the roadmap. Report only high-confidence factual drift.',
      '',
      '--- README ---',
      content,
      '--- END README ---',
      '',
      'Search the codebase to verify the claims, then output the JSON verdict.',
    ].join('\n');
  }
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

function extractVerdict(text: string, docPath: string): Verdict {
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
  const verdict = VerdictSchema.parse(parsed);

  // Drop `low` rather than reject it: the noise policy stays ("report only
  // high-confidence discrepancies"), but a stray severity no longer discards the
  // findings around it. A verdict left with nothing reportable counts as ok —
  // that is what "not worth reporting" means, and without the reset a low-only
  // verdict would render as "stale" with an empty finding list.
  const reportable = verdict.findings.filter((f) => f.severity !== 'low');
  const dropped = verdict.findings.length - reportable.length;
  if (dropped > 0) {
    // docPath in the line: two docs are audited concurrently by default.
    console.log(`      ℹ️  ${docPath}: ${dropped} low-severity finding(s) dropped (report policy)`);
  }
  return { upToDate: reportable.length === 0 ? true : verdict.upToDate, findings: reportable };
}

const STRICT_JSON_RETRY_NOTE =
  '\n\nIMPORTANT: your previous attempt at this audit produced invalid JSON and had to be discarded. ' +
  'Re-do the audit and pay close attention to the JSON output rules: no backticks or code fences inside ' +
  'string values, no unescaped quotes, no literal newlines inside a string.';

// Thrown only when the agent DID finish but its verdict didn't parse as JSON — the one
// failure mode a same-doc retry can plausibly fix. Agent-level failures (max turns,
// timeouts, ...) get their own plain Error so auditDoc can tell the two apart and skip
// the pointless (and misleadingly-worded) retry for those.
class JsonVerdictError extends Error {}

// One query + verdict-extraction attempt. Throws on agent failure or unparseable JSON —
// auditDoc decides whether to retry.
async function runOneAudit(
  docPath: string,
  content: string,
  model: string,
  retry: boolean
): Promise<Verdict> {
  const prompt = buildUserPrompt(docPath, content) + (retry ? STRICT_JSON_RETRY_NOTE : '');
  let finalText = '';
  let endedBadly: string | null = null;

  for await (const message of query({
    prompt,
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
    throw new Error(`agent ended: ${endedBadly}`);
  }
  try {
    return extractVerdict(finalText, docPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new JsonVerdictError(message);
  }
}

async function auditDoc(docPath: string, model: string): Promise<DocResult> {
  const start = Date.now();
  const base: Pick<DocResult, 'docPath'> = { docPath };

  const contentPath = docPath.startsWith(`${TOURS_FOLDER}/`)
    ? path.join(TOURS_ROOT, docPath.slice(TOURS_FOLDER.length + 1))
    : docPath === README_DOC
      ? README_PATH
      : path.join(DOCS_ROOT, docPath);

  let content: string;
  try {
    content = readFileSync(contentPath, 'utf-8');
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

  // A malformed-JSON verdict is a formatting slip, not a substantive failure — one retry
  // with a stricter reminder recovers most of them instead of silently dropping the doc
  // from the audit (see gruener-ci-schritt-beweist-nichts: a swallowed error reads as success).
  // Only JsonVerdictError qualifies: agent-level failures (max turns, timeouts, ...) get
  // no retry — the STRICT_JSON_RETRY_NOTE premise would be wrong for those, and a doc that
  // can't finish in 40 turns won't finish in another 40 either.
  let lastErr: unknown;
  let attempt = 0;
  for (; attempt < 2; attempt++) {
    try {
      const verdict = await runOneAudit(docPath, content, model, attempt > 0);
      return {
        ...base,
        status: 'ok',
        upToDate: verdict.upToDate && verdict.findings.length === 0,
        findings: verdict.findings,
        durationS: Math.round((Date.now() - start) / 1000),
      };
    } catch (err) {
      lastErr = err;
      if (!(err instanceof JsonVerdictError)) break;
    }
  }

  // Kept raw on purpose: this DocResult feeds the run summary, the PR comment and a
  // maintainer-facing GitHub issue, never a user response. A smoothed-over message would
  // make a failed audit undebuggable.
  const rawMessage = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return {
    ...base,
    status: 'error',
    upToDate: true,
    findings: [],
    error: attempt > 0 ? `${rawMessage} (after retry)` : rawMessage,
    durationS: Math.round((Date.now() - start) / 1000),
  };
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
      `\`${docSourcePath(result.docPath)}\` and the current app UI.`
  );
  lines.push('');
  for (const [i, f] of result.findings.entries()) {
    lines.push(`### ${i + 1}. ${neutralizeGithubMentions(f.claim)} _(${f.severity})_`);
    lines.push('');
    lines.push(`- **Doc says:** ${neutralizeGithubMentions(f.docQuote)}`);
    lines.push(`- **Code shows:** ${neutralizeGithubMentions(f.codeEvidence)}`);
    lines.push(`- **Suggested fix:** ${neutralizeGithubMentions(f.suggestedFix)}`);
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
  const ok = results.filter((r) => r.status === 'ok' && r.upToDate);
  const errored = results.filter((r) => r.status === 'error');
  const lines: string[] = [PR_COMMENT_MARKER, '', '## 📝 Docs-Freshness-Check', ''];

  if (stale.length === 0 && errored.length === 0) {
    lines.push(
      `✅ Keine Abweichungen zwischen den betroffenen Doku-Artikeln und dieser Änderung gefunden ` +
        `(${results.length} Artikel geprüft).`
    );
    return lines.join('\n');
  }

  if (stale.length > 0) {
    lines.push(
      `⚠️ Diese Änderung betrifft **${stale.length}** Doku-Artikel, die evtl. veraltet sind. ` +
        `Bitte prüfen und ggf. anpassen — dieser Kommentar **blockiert den Merge nicht**.`
    );
  } else {
    lines.push(
      `✅ Keine Abweichungen in den erfolgreich geprüften Artikeln (${ok.length} von ${results.length}).`
    );
  }
  lines.push('');
  for (const r of stale) {
    lines.push(
      `<details><summary><code>${docSourcePath(r.docPath)}</code> — ` +
        `${r.findings.length} mögliche Abweichung(en)</summary>`
    );
    lines.push('');
    for (const [i, f] of r.findings.entries()) {
      lines.push(`**${i + 1}. ${neutralizeGithubMentions(f.claim)}** _(${f.severity})_`);
      lines.push(`- **Doku sagt:** ${neutralizeGithubMentions(f.docQuote)}`);
      lines.push(`- **Code zeigt:** ${neutralizeGithubMentions(f.codeEvidence)}`);
      lines.push(`- **Vorschlag:** ${neutralizeGithubMentions(f.suggestedFix)}`);
      lines.push('');
    }
    lines.push('</details>');
    lines.push('');
  }

  if (errored.length > 0) {
    lines.push(
      `⚠️ **${errored.length}** Artikel konnte${errored.length === 1 ? '' : 'n'} nicht geprüft werden ` +
        `(Agent-Fehler nach Retry, s. Workflow-Log) — für diese Artikel liegt **kein** Ergebnis vor, ` +
        `weder ✅ noch ⚠️:`
    );
    lines.push('');
    for (const r of errored) {
      lines.push(
        `- \`${docSourcePath(r.docPath)}\`: ${neutralizeGithubMentions(r.error ?? 'unbekannter Fehler')}`
      );
    }
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
    // Local dev: fall back to the Claude CLI's stored login. On a runner there
    // is no stored login to fall back on, so every audit fails with "Not
    // logged in" — and because a failed audit is only a per-doc `status:
    // 'error'`, the run still ended green having checked nothing. Refuse to
    // start instead of producing that.
    if (process.env.CI || process.env.GITHUB_ACTIONS) {
      console.error(
        'No CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY in env. In CI there is no stored CLI ' +
          'login to fall back on — set CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`).'
      );
      process.exit(1);
    }
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

  // A per-doc failure is a `status: 'error'` result, not a throw — that keeps
  // one flaky audit from sinking the other nineteen. But if EVERY audit
  // errored, the run learned nothing about any doc, and reporting that as
  // success is indistinguishable from "all docs are fresh". Exit after the
  // summary and step-summary are written, so the artefact still explains why.
  if (results.length > 0 && errored.length === results.length) {
    console.error(
      `All ${errored.length} audit(s) errored — this run checked nothing. ` +
        `First error: ${errored[0]?.error ?? 'unknown'}`
    );
    process.exit(1);
  }
  if (errored.length > 0) {
    console.warn(
      `::warning::${errored.length} of ${results.length} audits errored — their docs went unchecked.`
    );
  }
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
