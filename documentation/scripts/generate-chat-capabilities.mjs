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
  // INTENT_HANDLER_PATHS says how each intent is handled and flags the young
  // ones EXPERIMENTAL, which makes it a better source for "is this
  // experimental?" than the enum's free-floating comments.
  //
  // It sat in `intentPipeline.vitest.ts` as `CONTROLLER_HANDLED_INTENTS` until
  // the intent-registry rollout, and its `Record<SearchIntent, string>` was
  // decoration there: `apps/api/tsconfig.json` excludes `**/*.vitest.ts`, so
  // tsc never saw the file (the case that motivated
  // scripts/check-unenforced-exhaustive-maps.mjs). It is a production module
  // now, so the compiler enforces coverage — and the test's runtime loop over
  // `searchIntentSchema.options` stays as the readable second belt.
  intentNotes: 'apps/api/agents/langgraph/ChatGraph/intentHandlerPaths.ts',
  // The Rezepte (`@presse`, `@instagram`, …). index.generated.ts is itself
  // built from the skills' frontmatter, so it is already pure data.
  skills: 'packages/shared/src/agents/skills/index.generated.ts',
  skillTypes: 'packages/shared/src/agents/types.ts',
  // The @-source registry (`@grundsatz`, `@thüringen`, …) shared by web/mobile
  // galleries and the chat mention picker.
  notebooks: 'packages/shared/src/notebooks/index.ts',
  // Which keywords pin a sharepic request to a specific variant.
  sharepicVariants: 'apps/api/routes/chat/services/sharepicVariantHelpers.ts',
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

/**
 * Die F0-Erstell-Token, aus `chat-intents/index.ts` gelesen.
 *
 * Nötig, weil `mentionables.ts` seinen `identifier` für die vier
 * `@…-erstellen`-Einträge nicht mehr als Literal schreibt, sondern als
 * `ARTIFACT_CREATE_TOKENS.<art>` — die Menge ist F0 und darf nur einen Schreiber
 * haben. Ein reiner Literal-Leser sieht dort nichts und liesse die vier
 * Fähigkeiten aus dem Handbuch fallen; genau das ist beim Umbau passiert und
 * wird unten laut statt still.
 */
function readArtifactCreateTokens() {
  const sf = parse(SRC.chatIntents);
  const out = {};
  walk(sf, (node) => {
    if (!ts.isVariableDeclaration(node)) return;
    if (!ts.isIdentifier(node.name) || node.name.text !== 'ARTIFACT_CREATE_TOKENS') return;
    let init = node.initializer;
    // `{...} as const` → das Objektliteral steckt in der Assertion.
    while (init && ts.isAsExpression(init)) init = init.expression;
    if (!init || !ts.isObjectLiteralExpression(init)) return;
    for (const prop of init.properties) {
      if (!ts.isPropertyAssignment(prop) || !prop.name) continue;
      if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) continue;
      if (!ts.isStringLiteral(prop.initializer)) continue;
      out[prop.name.text] = prop.initializer.text;
    }
  });
  if (Object.keys(out).length === 0) {
    throw new Error(
      `${SRC.chatIntents}: ARTIFACT_CREATE_TOKENS not extractable — the shape changed.`
    );
  }
  return out;
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

/**
 * Wie {@link stringProp}, aber für `<constName>.key` — aufgelöst über eine
 * mitgegebene Tabelle. Der NAME der Konstante wird mitgeprüft: sonst löst jedes
 * `Irgendwas.board` auf, und der Leser bestätigt eine Herkunft, die er nicht
 * gelesen hat. Alles andere bleibt unauflösbar und wird beim Aufrufer zum
 * Fehler.
 */
function constProp(obj, name, constName, table) {
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p) || !p.name || !ts.isIdentifier(p.name)) continue;
    if (p.name.text !== name) continue;
    const init = p.initializer;
    if (!ts.isPropertyAccessExpression(init)) return undefined;
    if (!ts.isIdentifier(init.expression) || init.expression.text !== constName) return undefined;
    return table[init.name.text];
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
  // The enum is a WIRE contract and keeps values the product no longer routes:
  // shipped mobile binaries parse it, so a capability that moved elsewhere
  // cannot be deleted from it. The registry says which those are, and
  // documenting them would advertise a chat capability that no longer answers.
  const retired = extractRetiredIntents();
  return intents.filter((i) => !retired.has(i));
}

/**
 * Intents marked `availability: 'retired'` in the registry (see CHAT_INTENTS),
 * MINUS those whose mention pins a tool or activates a recipe.
 *
 * The exception is what keeps the rule honest. Retiring an intent normally means
 * the capability moved somewhere that has no @-trigger at all (the five managed
 * connectors), so documenting it would advertise something that no longer
 * answers. A mention carrying `pinsTool`/`activatesSkill` is the other case: the
 * verdict died, the capability did not — the same token now reaches a loop tool
 * or a recipe. `@umfragen` and `@pressemitteilungen` are those, and dropping
 * them from the article would hide capabilities the picker still offers.
 */
function extractRetiredIntents() {
  const sf = parse(SRC.chatIntents);
  const decl = unwrap(findDeclaration(sf, 'CHAT_INTENTS'));
  if (!decl || !ts.isObjectLiteralExpression(decl)) {
    throw new Error(
      `${SRC.chatIntents}: could not read CHAT_INTENTS — expected an object literal keyed by ` +
        `intent id. The registry moved or changed shape; update generate-chat-capabilities.mjs.`
    );
  }
  const retired = new Set();
  for (const prop of decl.properties) {
    if (!ts.isPropertyAssignment(prop) || !prop.name) continue;
    const id = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
    const value = unwrap(prop.initializer);
    if (!id || !value || !ts.isObjectLiteralExpression(value)) continue;
    if (stringProp(value, 'availability') !== 'retired') continue;
    const mention = objectProp(value, 'mention');
    if (mention && (stringProp(mention, 'pinsTool') || stringProp(mention, 'activatesSkill')))
      continue;
    retired.add(id);
  }
  return retired;
}

/** Intents whose entry in INTENT_HANDLER_PATHS is marked EXPERIMENTAL. */
function extractExperimentalIntents() {
  const sf = parse(SRC.intentNotes);
  const decl = unwrap(findDeclaration(sf, 'INTENT_HANDLER_PATHS'));
  if (!decl || !ts.isObjectLiteralExpression(decl)) {
    throw new Error(
      `${SRC.intentNotes}: INTENT_HANDLER_PATHS not found as an object literal. ` +
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
  const tokens = readArtifactCreateTokens();
  const out = {};
  walk(sf, (node) => {
    if (!ts.isObjectLiteralExpression(node)) return;
    const title = stringProp(node, 'title');
    const identifier =
      stringProp(node, 'identifier') ??
      constProp(node, 'identifier', 'ARTIFACT_CREATE_TOKENS', tokens);
    // Ein Eintrag MIT Titel und Erwähnung, dessen Kennung nicht auflösbar ist,
    // ist der eine Fehler, den dieser Leser bisher still beging: er liess ihn
    // weg, und die Fähigkeit verschwand aus dem Handbuch, ohne dass etwas rot
    // wurde. Lieber der Build als ein zu kurzes Verzeichnis.
    if (title && stringProp(node, 'mention') && !identifier) {
      throw new Error(
        `${SRC.mentionables}: mentionable "${title}" has an unresolvable \`identifier\` — ` +
          `only string literals and ARTIFACT_CREATE_TOKENS.<kind> are understood.`
      );
    }
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

/** Numeric property (`order: 4`) of an object literal. */
function numberProp(obj, name) {
  for (const p of obj.properties) {
    if (
      ts.isPropertyAssignment(p) &&
      p.name &&
      ts.isIdentifier(p.name) &&
      p.name.text === name &&
      ts.isNumericLiteral(p.initializer)
    ) {
      return Number(p.initializer.text);
    }
  }
  return undefined;
}

/** Object-literal property (`mention: {...}`) of an object literal. */
function objectProp(obj, name) {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && p.name && ts.isIdentifier(p.name) && p.name.text === name) {
      const value = unwrap(p.initializer);
      if (ts.isObjectLiteralExpression(value)) return value;
    }
  }
  return undefined;
}

/** `false` literal property (`enabled: false`) — undefined when absent or true. */
function isFalseProp(obj, name) {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && p.name && ts.isIdentifier(p.name) && p.name.text === name) {
      return p.initializer.kind === ts.SyntaxKind.FalseKeyword;
    }
  }
  return false;
}

/**
 * The Rezepte (`SKILLS` in the generated skills index), in
 * registry order, plus the category labels the UI groups them under.
 *
 * A Landesverband that turned its notebook off (`enabled: false`) also has its
 * Rezepte hidden from every picker (see `DISABLED_LV_AGENT_IDS` in
 * packages/shared/src/agents/system.ts, which derives that from the same
 * switch). The static equivalent: the disabled notebook's `defaultAgent` is
 * the identifier its Rezepte carry, so those are skipped here.
 */
function extractSkills(disabledAgentIds) {
  const sf = parse(SRC.skills);
  const decl = unwrap(findDeclaration(sf, 'SKILLS'));
  if (!decl || !ts.isArrayLiteralExpression(decl)) {
    throw new Error(
      `${SRC.skills}: SKILLS not found as an array literal. ` +
        `It is the source for the Rezepte table; update generate-chat-capabilities.mjs.`
    );
  }
  const skills = [];
  for (const el of decl.elements) {
    const obj = unwrap(el);
    if (!obj || !ts.isObjectLiteralExpression(obj)) continue;
    const title = stringProp(obj, 'title');
    const mention = stringProp(obj, 'mention');
    if (!title || !mention) continue;
    const identifier = stringProp(obj, 'identifier');
    if (identifier && disabledAgentIds.has(identifier)) continue;
    const entry = {
      // `@`, nicht `/`: Rezepte hatten früher einen eigenen Auslöser, der ist
      // beim Zusammenlegen der beiden Listen weggefallen (Kopfkommentar in
      // packages/chat/src/lib/mentionDetection.ts — `@` ist der einzige
      // Trigger). Die Tabelle zeigte trotzdem weiter `/presse`, also einen
      // Befehl, der im Eingabefeld nichts auslöst.
      command: `@${mention}`,
      title,
      description: stringProp(obj, 'description') ?? '',
      avatar: stringProp(obj, 'avatar') ?? '',
      category: stringProp(obj, 'skillCategory') ?? 'sonstiges',
    };
    const audience = stringProp(obj, 'audience');
    if (audience && audience !== 'all') entry.audience = audience;
    skills.push(entry);
  }
  if (skills.length === 0) throw new Error(`${SRC.skills}: no Rezepte extracted.`);

  const typesSf = parse(SRC.skillTypes);
  const labelsDecl = unwrap(findDeclaration(typesSf, 'SKILL_CATEGORY_LABELS'));
  const categoryLabels = {};
  if (labelsDecl && ts.isObjectLiteralExpression(labelsDecl)) {
    for (const p of labelsDecl.properties) {
      if (!ts.isPropertyAssignment(p) || !p.name || !ts.isIdentifier(p.name)) continue;
      if (ts.isStringLiteral(p.initializer)) categoryLabels[p.name.text] = p.initializer.text;
    }
  }
  return { skills, categoryLabels };
}

/**
 * The `@`-source registry (`NOTEBOOK_REGISTRY`) — every system notebook with
 * its mention alias, sorted the way the galleries sort (the `order` field).
 * Skips `enabled: false` (unroutable) and non-stable channels (not served on
 * the public instance the docs describe).
 */
function extractNotebookSources() {
  const disabledAgentIds = new Set();
  const sf = parse(SRC.notebooks);
  const decl = unwrap(findDeclaration(sf, 'NOTEBOOK_REGISTRY'));
  if (!decl || !ts.isArrayLiteralExpression(decl)) {
    throw new Error(
      `${SRC.notebooks}: NOTEBOOK_REGISTRY not found as an array literal. ` +
        `It is the source for the Quellen table; update generate-chat-capabilities.mjs.`
    );
  }
  const sources = [];
  for (const el of decl.elements) {
    const obj = unwrap(el);
    if (!obj || !ts.isObjectLiteralExpression(obj)) continue;
    const id = stringProp(obj, 'id');
    const mention = objectProp(obj, 'mention');
    if (!id || !mention) continue;
    if (isFalseProp(obj, 'enabled')) {
      const defaultAgent = stringProp(obj, 'defaultAgent');
      if (defaultAgent) disabledAgentIds.add(defaultAgent);
      continue;
    }
    const channel = stringProp(obj, 'channel');
    if (channel && channel !== 'stable') continue;
    const alias = stringProp(mention, 'alias');
    const title = stringProp(mention, 'title');
    if (!alias || !title) continue;
    const entry = {
      id,
      mention: `@${alias}`,
      title,
      description: stringProp(mention, 'description') ?? '',
      avatar: stringProp(mention, 'avatar') ?? '',
      category: stringProp(obj, 'category') ?? 'weitere',
      order: numberProp(obj, 'order') ?? 0,
    };
    const audience = stringProp(obj, 'audience');
    if (audience && audience !== 'all') entry.audience = audience;
    sources.push(entry);
  }
  if (sources.length === 0) throw new Error(`${SRC.notebooks}: no sources extracted.`);
  sources.sort((a, b) => a.order - b.order);
  for (const s of sources) delete s.order;
  return { sources, disabledAgentIds };
}

/** `/\b(sliders?|karussells?|…)\b/i` → human-readable keyword list. */
function keywordsFromPattern(source) {
  const inner = source.replace(/^\\b\(/, '').replace(/\)\\b$/, '');
  return inner.split('|').map((token) =>
    token
      .replace(/\[\\s-\]\?/g, ' ')
      .replace(/\[\s-\]\?/g, ' ')
      .replace(/\\w\*/g, '…')
      .replace(/s\?$/, '(s)')
      .trim()
  );
}

/**
 * The sharepic variant keywords (`VARIANT_KEYWORDS`) plus which variants are
 * part of the standard fanout (`SHAREPIC_VARIANT_TYPES`) — a variant outside
 * that list (slider) only renders on explicit request.
 */
function extractSharepicVariants() {
  const sf = parse(SRC.sharepicVariants);
  const standardDecl = unwrap(findDeclaration(sf, 'SHAREPIC_VARIANT_TYPES'));
  const standardOrder = [];
  if (standardDecl && ts.isArrayLiteralExpression(standardDecl)) {
    for (const el of standardDecl.elements) {
      if (ts.isStringLiteral(el)) standardOrder.push(el.text);
    }
  }
  const standard = new Set(standardOrder);

  const decl = unwrap(findDeclaration(sf, 'VARIANT_KEYWORDS'));
  if (!decl || !ts.isArrayLiteralExpression(decl)) {
    throw new Error(
      `${SRC.sharepicVariants}: VARIANT_KEYWORDS not found as an array literal. ` +
        `It is the source for the Sharepic-Varianten table; update generate-chat-capabilities.mjs.`
    );
  }
  const variants = [];
  for (const el of decl.elements) {
    const obj = unwrap(el);
    if (!obj || !ts.isObjectLiteralExpression(obj)) continue;
    const type = stringProp(obj, 'type');
    if (!type) continue;
    let pattern;
    for (const p of obj.properties) {
      if (
        ts.isPropertyAssignment(p) &&
        p.name &&
        ts.isIdentifier(p.name) &&
        p.name.text === 'pattern' &&
        ts.isRegularExpressionLiteral(p.initializer)
      ) {
        pattern = p.initializer.text.replace(/^\/|\/[a-z]*$/g, '');
      }
    }
    if (!pattern) continue;
    variants.push({ type, keywords: keywordsFromPattern(pattern), standard: standard.has(type) });
  }
  if (variants.length === 0) {
    throw new Error(`${SRC.sharepicVariants}: no variants extracted — the shape changed.`);
  }
  // Fanout order (SHAREPIC_VARIANT_TYPES), keyword-only variants after —
  // VARIANT_KEYWORDS itself is ordered by match priority, not presentation.
  const rank = (v) => (v.standard ? standardOrder.indexOf(v.type) : standardOrder.length);
  variants.sort((a, b) => rank(a) - rank(b));
  return variants;
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
  const notebooks = extractNotebookSources();
  const { skills, categoryLabels } = extractSkills(notebooks.disabledAgentIds);
  const manifest = {
    intents: intents.slice().sort(),
    experimentalIntents,
    mentionables: sortKeys(extractMentionables()),
    userTools: sortKeys(extractUserTools()),
    systemSources: sortKeys(system.sources),
    systemIntentSources: sortKeys(system.intentSources),
    skills,
    skillCategoryLabels: categoryLabels,
    notebookSources: notebooks.sources,
    sharepicVariants: extractSharepicVariants(),
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
