/**
 * Generate documentation/src/generated/chat-capabilities.json — the machine-read
 * inventory of what the Grünerator chat can actually do, derived from the code's
 * own registries:
 *
 *   - the intent enum   (packages/contracts … chatStreamEvents.ts) — the ONE list
 *     of things the classifier can route a message to,
 *   - the @-/-mentionables (packages/chat … mentionables.ts) — user-facing title,
 *     description and mention string per capability,
 *   - the agent tool picker (packages/shared … userTools.ts) — which capabilities
 *     a custom Grünerator can be given,
 *   - the first-party system MCP sources (apps/api … systemMcpServers.ts) — the
 *     env-gated everyday sources (Bahn, Wetter, Nachrichten, Hotel).
 *
 * The docs article embeds this via <ChatCapabilities>, which pairs every intent
 * with hand-written example questions in ChatCapabilities/examples.ts.
 *
 * Drift between the two is REPORTED, not thrown: `--audit` compares the code's
 * capabilities against what the article documents and, with `--apply`, files or
 * updates one deduplicated GitHub issue (and closes it once the gap is filled).
 * A new chat capability therefore never breaks anyone's build — it shows up as a
 * task, the same shape as the weekly docs-freshness audit.
 *
 * Extraction is AST-based (TypeScript compiler API), never an import: these
 * modules pull in react-icons and workspace aliases that don't resolve under
 * plain Node. We only read string literals, so the app is never executed.
 *
 * Usage:
 *   node scripts/generate-chat-capabilities.mjs                  # write the JSON
 *   node scripts/generate-chat-capabilities.mjs --check          # exit 1 if the committed JSON is stale
 *   node scripts/generate-chat-capabilities.mjs --audit          # report drift (always exit 0)
 *   node scripts/generate-chat-capabilities.mjs --audit --apply  # …and sync the GitHub issue
 *   node scripts/generate-chat-capabilities.mjs --audit --pr-comment  # …and post a sticky PR comment
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..'); // documentation/scripts → repo root
const OUT_FILE = path.join(REPO_ROOT, 'documentation/src/generated/chat-capabilities.json');

const SRC = {
  intents: 'packages/contracts/src/schemas/chatStreamEvents.ts',
  mentionables: 'packages/chat/src/lib/mentionables.ts',
  // The per-intent registry. The @-tool mentions were literals in
  // `mentionables.ts` until they became derived from this file; the picker
  // triggers and artefact creators are still literals over there, so both are
  // read (see extractMentionables).
  chatIntents: 'packages/shared/src/chat-intents/index.ts',
  userTools: 'packages/shared/src/agents/userTools.ts',
  systemMcp: 'apps/api/services/mcp/systemMcpServers.ts',
  // CONTROLLER_HANDLED_INTENTS says how each intent is handled and flags the
  // young ones EXPERIMENTAL, which makes it a better source for "is this
  // experimental?" than the enum's free-floating comments.
  //
  // It is ALSO annotated `Record<SearchIntent, string>`, and this comment used
  // to claim TypeScript forces it to cover every intent. It does not:
  // `apps/api/tsconfig.json` excludes `**/*.vitest.ts`, so tsc never sees this
  // file. Coverage is enforced by the test's runtime loop over
  // `searchIntentSchema.options`, and by
  // scripts/check-unenforced-exhaustive-maps.mjs, which fails CI if that loop
  // is ever dropped.
  intentNotes: 'apps/api/agents/langgraph/ChatGraph/intentPipeline.vitest.ts',
};

function parse(relFile) {
  const abs = path.join(REPO_ROOT, relFile);
  return ts.createSourceFile(
    abs,
    readFileSync(abs, 'utf-8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
}

function stringProp(obj, name) {
  for (const p of obj.properties) {
    if (
      ts.isPropertyAssignment(p) &&
      p.name &&
      ts.isIdentifier(p.name) &&
      p.name.text === name &&
      (ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer))
    ) {
      return p.initializer.text;
    }
  }
  return undefined;
}

/** Concatenated string of a property whose initializer is `[...].join(' ')`-free text. */
function walk(sf, fn) {
  const visit = (node) => {
    fn(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** The variable declaration `name = <initializer>` anywhere in the file. */
function findDeclaration(sf, name) {
  let found;
  walk(sf, (node) => {
    if (
      !found &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      found = node.initializer;
    }
  });
  return found;
}

/** Unwrap `x as const` / `x satisfies T` / parenthesised expressions. */
function unwrap(node) {
  let cur = node;
  while (
    cur &&
    (ts.isAsExpression(cur) || ts.isSatisfiesExpression?.(cur) || ts.isParenthesizedExpression(cur))
  ) {
    cur = cur.expression;
  }
  return cur;
}

/** `export const searchIntentSchema = z.enum([...])` → the string members. */
function extractIntents() {
  const sf = parse(SRC.intents);
  const decl = unwrap(findDeclaration(sf, 'searchIntentSchema'));
  if (!decl || !ts.isCallExpression(decl) || !ts.isArrayLiteralExpression(decl.arguments[0])) {
    throw new Error(
      `${SRC.intents}: could not read searchIntentSchema — expected \`z.enum([...])\`. ` +
        `The intent registry moved or changed shape; update generate-chat-capabilities.mjs.`
    );
  }
  const intents = decl.arguments[0].elements
    .filter((e) => ts.isStringLiteral(e))
    .map((e) => e.text);
  if (intents.length === 0) throw new Error(`${SRC.intents}: searchIntentSchema is empty.`);
  return intents;
}

/** Intents whose entry in CONTROLLER_HANDLED_INTENTS is marked EXPERIMENTAL. */
function extractExperimentalIntents() {
  const sf = parse(SRC.intentNotes);
  const decl = unwrap(findDeclaration(sf, 'CONTROLLER_HANDLED_INTENTS'));
  if (!decl || !ts.isObjectLiteralExpression(decl)) {
    throw new Error(
      `${SRC.intentNotes}: CONTROLLER_HANDLED_INTENTS not found as an object literal. ` +
        `It is the source for the "experimentell" badge; update generate-chat-capabilities.mjs.`
    );
  }
  const experimental = [];
  for (const p of decl.properties) {
    if (!ts.isPropertyAssignment(p) || !p.name) continue;
    const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
    const init = p.initializer;
    const note =
      init && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init))
        ? init.text
        : '';
    if (key && note.toUpperCase().includes('EXPERIMENTAL')) experimental.push(key);
  }
  return experimental;
}

/**
 * The `@tool` mentions that belong to an intent, read from the intent registry.
 *
 * These used to be object literals in `mentionables.ts` and were picked up by
 * `extractMentionables` below. They are derived from the registry now, so the
 * literals live here instead — same AST technique, different file. The registry
 * is deliberately framework-free, which is what keeps it readable this way.
 *
 * Shape read: `CHAT_INTENTS = { <intentId>: { audience, mention: {...},
 * variantMentions: [{...}] } }`. `forcedTool` on a mention overrides the intent
 * id as the identifier, because that is the string the router actually
 * dispatches on (`@pdf-erstellen` → `create_pdf`).
 */
function extractIntentMentions() {
  const sf = parse(SRC.chatIntents);
  const decl = unwrap(findDeclaration(sf, 'CHAT_INTENTS'));
  if (!decl || !ts.isObjectLiteralExpression(decl)) {
    throw new Error(
      `${SRC.chatIntents}: CHAT_INTENTS not found as an object literal. ` +
        `It is the source for the @-tool mentions; update generate-chat-capabilities.mjs.`
    );
  }

  const out = {};
  const readMention = (node, intentId, audience) => {
    const slug = stringProp(node, 'slug');
    const title = stringProp(node, 'title');
    if (!slug || !title) return;
    const entry = { title };
    const description = stringProp(node, 'description');
    if (description) entry.description = description;
    entry.mention = `@${slug}`;
    if (audience && audience !== 'all') entry.audience = audience;
    out[stringProp(node, 'forcedTool') ?? intentId] = entry;
  };

  for (const prop of decl.properties) {
    if (!ts.isPropertyAssignment(prop) || !prop.name) continue;
    const intentId =
      ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
    const body = unwrap(prop.initializer);
    if (!intentId || !body || !ts.isObjectLiteralExpression(body)) continue;
    const audience = stringProp(body, 'audience');

    for (const field of body.properties) {
      if (!ts.isPropertyAssignment(field) || !ts.isIdentifier(field.name)) continue;
      const value = unwrap(field.initializer);
      if (field.name.text === 'mention' && value && ts.isObjectLiteralExpression(value)) {
        readMention(value, intentId, audience);
      }
      if (field.name.text === 'variantMentions' && value && ts.isArrayLiteralExpression(value)) {
        for (const el of value.elements) {
          const variant = unwrap(el);
          if (variant && ts.isObjectLiteralExpression(variant)) {
            readMention(variant, intentId, audience);
          }
        }
      }
    }
  }

  if (Object.keys(out).length === 0) {
    throw new Error(`${SRC.chatIntents}: no @-tool mentions extracted — the shape changed.`);
  }
  return out;
}

/**
 * Every mentionable literal (identifier + title + description). Covers the
 * non-intent mentionables that still live as literals — the artefact creators
 * (`board-erstellen`, `sheet-erstellen`, …) and the picker triggers (`@wolke`,
 * `@connect`, `@canva`, `@web`) — merged with the intent-backed `@tool` mentions
 * from the registry. Agents merged in at runtime are not literals and are out of
 * scope (they have their own generated manifest via AgentTiles).
 */
function extractMentionables() {
  const sf = parse(SRC.mentionables);
  const out = {};
  walk(sf, (node) => {
    if (!ts.isObjectLiteralExpression(node)) return;
    const identifier = stringProp(node, 'identifier');
    const title = stringProp(node, 'title');
    if (!identifier || !title) return;
    const entry = { title };
    const description = stringProp(node, 'description');
    if (description) entry.description = description;
    const mention = stringProp(node, 'mention');
    const trigger = stringProp(node, 'trigger');
    if (mention && trigger) entry.mention = `${trigger}${mention}`;
    const audience = stringProp(node, 'audience');
    if (audience && audience !== 'all') entry.audience = audience;
    out[identifier] = entry;
  });
  return { ...out, ...extractIntentMentions() };
}

/** `USER_SELECTABLE_TOOLS` → key → {label, description}. */
function extractUserTools() {
  const sf = parse(SRC.userTools);
  const decl = unwrap(findDeclaration(sf, 'USER_SELECTABLE_TOOLS'));
  if (!decl || !ts.isArrayLiteralExpression(decl)) {
    throw new Error(`${SRC.userTools}: USER_SELECTABLE_TOOLS is not an array literal.`);
  }
  const out = {};
  for (const el of decl.elements) {
    if (!ts.isObjectLiteralExpression(el)) continue;
    const key = stringProp(el, 'key');
    const label = stringProp(el, 'label');
    if (!key || !label) continue;
    out[key] = { label, description: stringProp(el, 'description') ?? '' };
  }
  return out;
}

/**
 * The first-party system MCP sources plus the env var that switches each on, so
 * the article can mark them as "nur wenn freigeschaltet" from the real gate
 * rather than from memory.
 */
function extractSystemSources() {
  const sf = parse(SRC.systemMcp);
  const envDecl = unwrap(findDeclaration(sf, 'ENV_BY_KEY'));
  const envByKey = {};
  if (envDecl && ts.isObjectLiteralExpression(envDecl)) {
    for (const p of envDecl.properties) {
      if (!ts.isPropertyAssignment(p) || !p.name) continue;
      const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
      const init = unwrap(p.initializer);
      if (!key || !init || !ts.isObjectLiteralExpression(init)) continue;
      const url = stringProp(init, 'url');
      if (url) envByKey[key] = url;
    }
  }

  const defsDecl = unwrap(findDeclaration(sf, 'DEFINITIONS'));
  const out = {};
  if (defsDecl && ts.isArrayLiteralExpression(defsDecl)) {
    for (const el of defsDecl.elements) {
      if (!ts.isObjectLiteralExpression(el)) continue;
      const key = stringProp(el, 'key');
      const name = stringProp(el, 'name');
      if (!key || !name) continue;
      const entry = { name, capability: stringProp(el, 'capability') ?? '' };
      if (envByKey[key]) entry.env = envByKey[key];
      out[key] = entry;
    }
  }

  // Which intents mount which sources — `reise` is the umbrella that mounts three.
  const intentDecl = unwrap(findDeclaration(sf, 'INTENT_SOURCES'));
  const intentSources = {};
  if (intentDecl && ts.isObjectLiteralExpression(intentDecl)) {
    for (const p of intentDecl.properties) {
      if (!ts.isPropertyAssignment(p) || !p.name) continue;
      const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
      const init = unwrap(p.initializer);
      if (!key || !init || !ts.isArrayLiteralExpression(init)) continue;
      intentSources[key] = init.elements.filter((e) => ts.isStringLiteral(e)).map((e) => e.text);
    }
  }

  return { sources: out, intentSources };
}

function sortKeys(obj) {
  const sorted = {};
  for (const key of Object.keys(obj).sort()) sorted[key] = obj[key];
  return sorted;
}

function generate() {
  const system = extractSystemSources();
  const intents = extractIntents();
  // Plus everything served by an env-gated first-party source: those ship per
  // environment and can be absent entirely, which is the same caveat for readers.
  const experimentalIntents = [
    ...new Set([...extractExperimentalIntents(), ...Object.keys(system.intentSources)]),
  ]
    .filter((i) => intents.includes(i))
    .sort();
  const manifest = {
    intents: intents.slice().sort(),
    experimentalIntents,
    mentionables: sortKeys(extractMentionables()),
    userTools: sortKeys(extractUserTools()),
    systemSources: sortKeys(system.sources),
    systemIntentSources: sortKeys(system.intentSources),
  };
  return {
    json: JSON.stringify(manifest, null, 2) + '\n',
    count: manifest.intents.length,
  };
}

// ── Audit: what the code can do vs. what the article documents ──────────────

const EXAMPLES_FILE = 'documentation/src/components/ChatCapabilities/examples.ts';
const ARTICLE = 'documentation/docs/gruenerieren/was-kann-ich-fragen.mdx';
const ISSUE_LABEL = 'docs-freshness';
const ISSUE_TITLE = 'Docs freshness: Chat-Fähigkeiten ohne Musterfragen';
const ISSUE_MARKER = '<!-- docs-capabilities -->';

/** The intents the article documents, read from examples.ts by AST. */
function extractDocumented() {
  const sf = parse(EXAMPLES_FILE);
  const examples = [];
  const decl = unwrap(findDeclaration(sf, 'EXAMPLES'));
  if (decl && ts.isArrayLiteralExpression(decl)) {
    for (const el of decl.elements) {
      if (!ts.isObjectLiteralExpression(el)) continue;
      const intent = stringProp(el, 'intent');
      if (!intent) continue;
      examples.push({
        intent,
        mentionable: stringProp(el, 'mentionable'),
        userTool: stringProp(el, 'userTool'),
      });
    }
  }

  const internal = [];
  const internalDecl = unwrap(findDeclaration(sf, 'INTERNAL_INTENTS'));
  if (internalDecl && ts.isObjectLiteralExpression(internalDecl)) {
    for (const p of internalDecl.properties) {
      if (!ts.isPropertyAssignment(p) || !p.name) continue;
      if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) internal.push(p.name.text);
    }
  }

  return { examples, internal };
}

function auditDrift(manifest) {
  const { examples, internal } = extractDocumented();
  const documented = new Set([...examples.map((e) => e.intent), ...internal]);
  const known = new Set(manifest.intents);

  return {
    undocumented: manifest.intents.filter((i) => !documented.has(i)),
    obsolete: [...documented].filter((i) => !known.has(i)).sort(),
    danglingMentionables: examples
      .filter((e) => e.mentionable && !manifest.mentionables[e.mentionable])
      .map((e) => `${e.intent} → ${e.mentionable}`),
    danglingTools: examples
      .filter((e) => e.userTool && !manifest.userTools[e.userTool])
      .map((e) => `${e.intent} → ${e.userTool}`),
  };
}

function buildReport(drift, manifestStale) {
  const lines = [ISSUE_MARKER, ''];
  lines.push(
    `Die Chat-Fähigkeiten im Code und der Artikel [\`was-kann-ich-fragen.mdx\`](${ARTICLE}) laufen auseinander.`,
    ''
  );

  if (drift.undocumented.length > 0) {
    lines.push('### Neue Fähigkeiten ohne Musterfragen', '');
    for (const intent of drift.undocumented) lines.push(`- \`${intent}\``);
    lines.push(
      '',
      `Trag sie in \`${EXAMPLES_FILE}\` mit 2–3 Musterfragen ein — in der Sprache, die Nutzer\\*innen tatsächlich tippen. Ist der Intent nichts, das man fragen kann (reine Routing-Weiche), gehört er stattdessen nach \`INTERNAL_INTENTS\`.`,
      ''
    );
  }
  if (drift.obsolete.length > 0) {
    lines.push('### Dokumentiert, aber im Code nicht mehr vorhanden', '');
    for (const intent of drift.obsolete) lines.push(`- \`${intent}\``);
    lines.push('', `Eintrag aus \`${EXAMPLES_FILE}\` entfernen.`, '');
  }
  if (drift.danglingMentionables.length > 0) {
    lines.push('### Verweise auf @-Kürzel, die es nicht mehr gibt', '');
    for (const ref of drift.danglingMentionables) lines.push(`- \`${ref}\``);
    lines.push('');
  }
  if (drift.danglingTools.length > 0) {
    lines.push('### Verweise auf Werkzeuge, die es nicht mehr gibt', '');
    for (const ref of drift.danglingTools) lines.push(`- \`${ref}\``);
    lines.push('');
  }
  if (manifestStale) {
    lines.push(
      '### Manifest veraltet',
      '',
      'Namen oder Beschreibungen haben sich im Code geändert, `src/generated/chat-capabilities.json` wurde aber nicht neu erzeugt.',
      ''
    );
  }

  lines.push(
    '---',
    '',
    'Danach einmal `pnpm --filter @gruenerator/documentation capabilities:generate` laufen lassen und das Ergebnis mitcommitten. Dieses Issue schließt sich von selbst, sobald die Lücke geschlossen ist.'
  );
  return lines.join('\n');
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf-8' });
}

/** One issue for the whole article — create, update or close it. */
function syncIssue(hasDrift, body) {
  const open = JSON.parse(
    gh([
      'issue',
      'list',
      '--label',
      ISSUE_LABEL,
      '--state',
      'open',
      '--json',
      'number,title',
      '--limit',
      '100',
    ])
  ).find((i) => i.title === ISSUE_TITLE);

  if (!hasDrift) {
    if (!open) return 'nichts zu tun (keine Drift, kein offenes Issue)';
    gh([
      'issue',
      'close',
      String(open.number),
      '--comment',
      'Alle Chat-Fähigkeiten sind wieder dokumentiert — automatisch geschlossen.',
    ]);
    return `Issue #${open.number} geschlossen`;
  }
  if (open) {
    gh(['issue', 'edit', String(open.number), '--body', body]);
    return `Issue #${open.number} aktualisiert`;
  }
  const url = gh([
    'issue',
    'create',
    '--title',
    ISSUE_TITLE,
    '--label',
    ISSUE_LABEL,
    '--body',
    body,
  ]).trim();
  return `Issue angelegt: ${url}`;
}

/** Sticky, marker-keyed comment on the PR named by PR_NUMBER. */
function syncPrComment(hasDrift, body) {
  const prNumber = process.env.PR_NUMBER;
  if (!prNumber) return 'PR_NUMBER fehlt — kein Kommentar';
  const existing = JSON.parse(gh(['pr', 'view', prNumber, '--json', 'comments'])).comments.find(
    (c) => c.body.includes(ISSUE_MARKER)
  );

  if (!hasDrift) {
    if (!existing) return 'nichts zu tun (keine Drift)';
    // gh cannot delete comments; overwrite with the all-clear instead.
    gh([
      'pr',
      'comment',
      prNumber,
      '--edit-last',
      '--body',
      `${ISSUE_MARKER}\n\n✓ Alle Chat-Fähigkeiten sind dokumentiert.`,
    ]);
    return 'Kommentar auf „alles dokumentiert" gesetzt';
  }
  if (existing) {
    gh(['pr', 'comment', prNumber, '--edit-last', '--body', body]);
    return 'PR-Kommentar aktualisiert';
  }
  gh(['pr', 'comment', prNumber, '--body', body]);
  return 'PR-Kommentar gepostet';
}

const check = process.argv.includes('--check');
const audit = process.argv.includes('--audit');
const { json, count } = generate();

if (audit) {
  const manifest = JSON.parse(json);
  let committed = '';
  try {
    committed = readFileSync(OUT_FILE, 'utf-8');
  } catch {
    // missing file → treat as stale
  }
  const manifestStale = committed !== json;
  const drift = auditDrift(manifest);
  const hasDrift =
    manifestStale ||
    drift.undocumented.length > 0 ||
    drift.obsolete.length > 0 ||
    drift.danglingMentionables.length > 0 ||
    drift.danglingTools.length > 0;

  const body = buildReport(drift, manifestStale);
  console.log(
    hasDrift
      ? body
      : `✓ Alle ${count} Chat-Fähigkeiten sind im Artikel dokumentiert und das Manifest ist aktuell.`
  );

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      hasDrift ? body : `✓ Alle ${count} Chat-Fähigkeiten sind dokumentiert.\n`
    );
  }
  if (process.argv.includes('--apply')) console.log(`→ ${syncIssue(hasDrift, body)}`);
  if (process.argv.includes('--pr-comment')) console.log(`→ ${syncPrComment(hasDrift, body)}`);

  // Reporting only — drift is a task, never a failed build.
  process.exit(0);
}

if (check) {
  let current = '';
  try {
    current = readFileSync(OUT_FILE, 'utf-8');
  } catch {
    // missing file → treat as stale
  }
  if (current !== json) {
    console.error(
      `✗ chat-capabilities.json is out of date (${count} intents expected).\n` +
        `  A chat capability changed in code but the manifest wasn't regenerated.\n` +
        `  Run: pnpm --filter @gruenerator/documentation capabilities:generate\n` +
        `  If a NEW intent appeared, also add example questions for it in\n` +
        `  documentation/src/components/ChatCapabilities/examples.ts — the docs\n` +
        `  build fails until it has them.`
    );
    process.exit(1);
  }
  console.log(`✓ chat-capabilities.json is up to date (${count} intents).`);
} else {
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, json);
  console.log(`✓ Wrote ${count} intents → ${path.relative(REPO_ROOT, OUT_FILE)}`);
}
