/**
 * Generate documentation/src/generated/agentura.json — the market's own shelf
 * structure, derived from the code:
 *
 *   - AGENTURA_CATEGORIES (packages/shared … agents/agenturaCategories.ts) — the
 *     single source of truth for the market's categories; it drives web's
 *     sidebar and page header as well as the mobile shelves,
 *   - SORT_LABELS (same file) — the sort options offered in the header,
 *   - SKILL_CATEGORY_LABELS (packages/shared … agents/types.ts) — the recipe
 *     sections inside the official shelf.
 *
 * ── Why this one has no audit ───────────────────────────────────────────────
 *
 * The other generated articles pair a machine-read list with hand-written German
 * prose, and their audits chase the gap between the two. Here the code already
 * carries the user-facing German: every category has a `label` AND a
 * `description` written for the screen. There is no second half that could go
 * missing, so there is nothing to audit — a stale manifest is caught by
 * `--check` in docs-build, and that is the whole contract.
 *
 * Rewriting those descriptions in the article would just be a copy that rots.
 *
 * Usage:
 *   node scripts/generate-agentura.mjs           # write the JSON
 *   node scripts/generate-agentura.mjs --check    # exit 1 if the committed JSON is stale
 */
import {
  fail,
  findDeclaration,
  objectEntries,
  literalText,
  parse,
  stringProp,
  ts,
  unwrap,
} from './lib/ast.mjs';
import { runGenerator } from './lib/audit.mjs';

const SRC = {
  categories: 'packages/shared/src/agents/agenturaCategories.ts',
  skillTypes: 'packages/shared/src/agents/types.ts',
};

const OUT_FILE = 'documentation/src/generated/agentura.json';

/**
 * Die Plattformen eines Regals. Fehlt `platforms`, gilt die Vorgabe der
 * Registry: web-only. Deshalb ein Array-Literal in der Quelle und keine
 * Konstante — was hier nicht als String-Literal steht, kann der AST nicht lesen.
 */
function platformsOf(node) {
  const prop = node.properties.find(
    (p) => ts.isPropertyAssignment(p) && p.name.getText() === 'platforms'
  );
  if (!prop) return ['web'];
  const value = unwrap(prop.initializer);
  if (!value || !ts.isArrayLiteralExpression(value)) {
    fail(SRC.categories, 'platforms', 'an array literal of string literals (no shared constant)');
  }
  return value.elements.map((el) => literalText(el)).filter(Boolean);
}

/** `AGENTURA_CATEGORIES` → the shelves in sidebar order, with their blurbs. */
function extractCategories() {
  const sf = parse(SRC.categories);
  const decl = findDeclaration(sf, 'AGENTURA_CATEGORIES');
  if (!decl || !ts.isArrayLiteralExpression(decl)) {
    fail(SRC.categories, 'AGENTURA_CATEGORIES', 'an array literal of { key, label, description }');
  }

  const categories = [];
  for (const el of decl.elements) {
    const node = unwrap(el);
    if (!node || !ts.isObjectLiteralExpression(node)) continue;
    const key = stringProp(node, 'key');
    const label = stringProp(node, 'label');
    if (!key || !label) continue;
    // Der Artikel beschreibt den Markt im Web. Ein Regal, das nur die App hat
    // („Empfohlen"), gehört nicht in eine Aufzählung von Pillen-Buttons.
    if (!platformsOf(node).includes('web')) continue;
    const entry = { key, label };
    const description = stringProp(node, 'description');
    if (description) entry.description = description;
    categories.push(entry);
  }

  if (categories.length === 0) fail(SRC.categories, 'AGENTURA_CATEGORIES', 'at least one category');
  return categories;
}

/** A `Record<K, string>` object literal → plain object, insertion order kept. */
function extractLabelRecord(sf, name, relFile) {
  const decl = findDeclaration(sf, name);
  if (!decl || !ts.isObjectLiteralExpression(decl)) {
    fail(relFile, name, 'an object literal of key → label');
  }
  const out = {};
  for (const [key, value] of objectEntries(decl)) {
    const text = literalText(value);
    if (text) out[key] = text;
  }
  if (Object.keys(out).length === 0) fail(relFile, name, 'at least one label');
  return out;
}

function generate() {
  const categoriesSf = parse(SRC.categories);
  const skillSf = parse(SRC.skillTypes);
  const categories = extractCategories();

  const manifest = {
    categories,
    defaultCategory: literalText(findDeclaration(categoriesSf, 'DEFAULT_CATEGORY')),
    sortLabels: extractLabelRecord(categoriesSf, 'SORT_LABELS', SRC.categories),
    recipeCategories: extractLabelRecord(skillSf, 'SKILL_CATEGORY_LABELS', SRC.skillTypes),
  };

  return {
    json: JSON.stringify(manifest, null, 2) + '\n',
    summary: `${categories.length} Regale, ${Object.keys(manifest.recipeCategories).length} Rezept-Rubriken`,
  };
}

runGenerator({
  outFile: OUT_FILE,
  generate,
  regenerateCmd: 'pnpm --filter @gruenerator/documentation agentura:generate',
});
