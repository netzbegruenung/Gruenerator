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
 * with hand-written example questions and THROWS at build time when an intent
 * has none — so adding an intent in code fails `docusaurus build` until someone
 * documents what you can ask for it. That is the auto-update loop: names and
 * descriptions flow in on regeneration, new capabilities are forced into the
 * article by a red build.
 *
 * Extraction is AST-based (TypeScript compiler API), never an import: these
 * modules pull in react-icons and workspace aliases that don't resolve under
 * plain Node. We only read string literals, so the app is never executed.
 *
 * Usage:
 *   node scripts/generate-chat-capabilities.mjs           # write the JSON
 *   node scripts/generate-chat-capabilities.mjs --check   # fail if committed JSON is stale
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..'); // documentation/scripts → repo root
const OUT_FILE = path.join(REPO_ROOT, 'documentation/src/generated/chat-capabilities.json');

const SRC = {
  intents: 'packages/contracts/src/schemas/chatStreamEvents.ts',
  mentionables: 'packages/chat/src/lib/mentionables.ts',
  userTools: 'packages/shared/src/agents/userTools.ts',
  systemMcp: 'apps/api/services/mcp/systemMcpServers.ts',
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

/**
 * Every mentionable literal (identifier + title + description). Covers the @-tools
 * and /-skills; agents merged in at runtime are not literals and are out of scope
 * (they have their own generated manifest via AgentTiles).
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
  return out;
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
  const manifest = {
    intents: extractIntents().slice().sort(),
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

const check = process.argv.includes('--check');
const { json, count } = generate();

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
