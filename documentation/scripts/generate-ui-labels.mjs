/**
 * Generate documentation/src/generated/ui-labels.json — a flat, namespaced map
 * of the web app's stable UI catalog labels (tool/menu/Landesverband names),
 * derived directly from the source configs. The docs embed these via <UiLabel>,
 * so a rename in code flows into the docs on regeneration instead of drifting.
 *
 * Extraction is AST-based (TypeScript compiler API) rather than importing the
 * configs: those pull in react-icons / Vite `import.meta.env`, which don't
 * resolve under plain Node. We only read string literals, so we never execute
 * the app. Every object literal that carries a string `id` AND a string
 * `title`/`label` becomes one entry — this uniformly covers array catalogs,
 * nested dropdown `items`, and objects assigned inside builder functions.
 *
 * Usage:
 *   node scripts/generate-ui-labels.mjs           # write the JSON
 *   node scripts/generate-ui-labels.mjs --check    # fail if committed JSON is stale
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..'); // documentation/scripts → repo root
const OUT_FILE = path.join(REPO_ROOT, 'documentation/src/generated/ui-labels.json');

// group → source file (relative to repo root). The group namespaces ids so the
// same id in two catalogs (e.g. `office`) can't collide.
const SOURCES = [
  { group: 'catalog', file: 'apps/web/src/features/global-search/toolCatalog.ts' },
  { group: 'workplace', file: 'apps/web/src/config/workplaceToolsConfig.ts' },
  { group: 'menu', file: 'apps/web/src/components/layout/Header/menuData.tsx' },
  { group: 'lv', file: 'packages/shared/src/agents/landesverbaende.ts' },
];

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

function objectProp(obj, name) {
  for (const p of obj.properties) {
    if (
      ts.isPropertyAssignment(p) &&
      p.name &&
      ts.isIdentifier(p.name) &&
      p.name.text === name &&
      ts.isObjectLiteralExpression(p.initializer)
    ) {
      return p.initializer;
    }
  }
  return undefined;
}

function extractFile(group, absFile, out, warnings) {
  const text = readFileSync(absFile, 'utf-8');
  const sf = ts.createSourceFile(absFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const id = stringProp(node, 'id');
      const title = stringProp(node, 'title') ?? stringProp(node, 'label');
      if (id && title) {
        const key = `${group}.${id}`;
        const entry = { title };
        const subtitle = stringProp(node, 'subtitle') ?? stringProp(node, 'description');
        if (subtitle) entry.subtitle = subtitle;
        const routePath = stringProp(node, 'path');
        if (routePath) entry.path = routePath;
        // Landesverband entries also carry the shared notebook + hub slug — the
        // drift-prone ids AgentTiles links to. Only LV objects have these fields.
        const notebookId = stringProp(node, 'notebookId');
        if (notebookId) entry.notebook = notebookId.replace(/-notebook$/, '');
        const hub = objectProp(node, 'hub');
        const agentSlug = hub && stringProp(hub, 'slug');
        if (agentSlug) entry.agentSlug = agentSlug;
        if (out[key] && JSON.stringify(out[key]) !== JSON.stringify(entry)) {
          warnings.push(`duplicate key "${key}" with differing values — last one wins`);
        }
        out[key] = entry;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
}

function generate() {
  const out = {};
  const warnings = [];
  for (const { group, file } of SOURCES) {
    extractFile(group, path.join(REPO_ROOT, file), out, warnings);
  }
  // Sort keys for stable, diff-friendly output.
  const sorted = {};
  for (const key of Object.keys(out).sort()) sorted[key] = out[key];
  return {
    json: JSON.stringify(sorted, null, 2) + '\n',
    count: Object.keys(sorted).length,
    warnings,
  };
}

const check = process.argv.includes('--check');
const { json, count, warnings } = generate();
for (const w of warnings) console.warn(`⚠️  ${w}`);

if (check) {
  let current = '';
  try {
    current = readFileSync(OUT_FILE, 'utf-8');
  } catch {
    // missing file → treat as stale
  }
  if (current !== json) {
    console.error(
      `✗ ui-labels.json is out of date (${count} labels expected).\n` +
        `  A UI catalog label changed in code but the manifest wasn't regenerated.\n` +
        `  Run: pnpm --filter @gruenerator/documentation labels:generate`
    );
    process.exit(1);
  }
  console.log(`✓ ui-labels.json is up to date (${count} labels).`);
} else {
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, json);
  console.log(`✓ Wrote ${count} labels → ${path.relative(REPO_ROOT, OUT_FILE)}`);
}
