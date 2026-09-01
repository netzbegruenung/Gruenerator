/**
 * Generate documentation/src/generated/tools.json — the inventory of the tools
 * the Grünerator actually offers, grouped the way the app groups them, derived
 * from the app's own configs:
 *
 *   - the Arbeiten-tab groups  (apps/web … workplaceToolsConfig.ts) — which
 *     tiles exist, in which group, with which title/description/route,
 *   - the searchable catalog   (apps/web … toolCatalog.ts) — tools that have no
 *     tile of their own and would otherwise be invisible in the docs,
 *   - the route table          (apps/web … routes.ts) — whether a route needs a
 *     login, and which maturity channel it is on.
 *
 * This differs from generate-ui-labels.mjs on purpose. That one flattens every
 * `{id,title}` literal in these files into one lookup map for <UiLabel>, which
 * is all a single label reference needs. An overview article needs the
 * STRUCTURE — which tool sits in which group — so this reads each exported
 * constant separately and keeps the grouping.
 *
 * The docs article embeds this via <ToolOverview>, which pairs every tool with
 * a hand-written German note (what it is for, where it works) in
 * ToolOverview/toolNotes.ts.
 *
 * Usage:
 *   node scripts/generate-tool-catalog.mjs                  # write the JSON
 *   node scripts/generate-tool-catalog.mjs --check          # exit 1 if committed JSON is stale
 *   node scripts/generate-tool-catalog.mjs --audit          # report gaps (always exit 0)
 *   node scripts/generate-tool-catalog.mjs --audit --apply  # …and sync the GitHub issue
 */
import {
  fail,
  findDeclaration,
  objectEntries,
  parse,
  sortKeys,
  stringProp,
  ts,
  unwrap,
  walk,
} from './lib/ast.mjs';
import { runGenerator } from './lib/audit.mjs';

const SRC = {
  workplace: 'apps/web/src/config/workplaceToolsConfig.ts',
  catalog: 'apps/web/src/features/global-search/toolCatalog.ts',
  routes: 'apps/web/src/config/routes.ts',
};

const OUT_FILE = 'documentation/src/generated/tools.json';
const NOTES_FILE = 'documentation/src/components/ToolOverview/toolNotes.ts';

/**
 * The exported constants of workplaceToolsConfig, in the order a reader meets
 * them, with the German group heading the article uses. `menu: true` marks the
 * dropdown tile whose real content is its nested `items`.
 */
const GROUPS = [
  { const: 'OFFICE_TOOLS', id: 'bereiche', title: 'Die drei Bereiche' },
  {
    const: 'OFFICE_SUITE_TOOLS',
    id: 'office',
    title: 'Office — Dokumente, Boards, Tabellen, Folien',
  },
  { const: 'CANVAS_TOOLS', id: 'studio', title: 'Studio — Bilder, Sharepics, Reels' },
  { const: 'WORKPLACE_TOOLS', id: 'organisieren', title: 'Organisieren' },
  { const: 'TOOL_MENUS', id: 'weitere', title: 'Weitere Werkzeuge', menu: true },
];

/** One tile literal → the fields the docs care about. */
function readTile(node) {
  const id = stringProp(node, 'id');
  const title = stringProp(node, 'title');
  if (!id || !title) return undefined;

  const tile = { id, title };
  const description = stringProp(node, 'description');
  if (description) tile.description = description;
  const path = stringProp(node, 'path');
  if (path) tile.path = path;
  const href = stringProp(node, 'href');
  if (href) tile.external = true;
  // An office tile creates a resource in place instead of navigating.
  const create = stringProp(node, 'create');
  if (create) tile.create = create;
  return tile;
}

/**
 * `channel: 'internal'` on a tile literal — those never reach real users.
 *
 * The instance filter deliberately lives in the DERIVED views, not in these
 * literals, so this file keeps parsing plain array literals and the docs keep
 * describing the full inventory. Only `internal` is dropped here: `preview`
 * content is real, just not on every instance.
 */
function isInternalChannel(node) {
  for (const p of node.properties) {
    if (!ts.isPropertyAssignment(p) || !p.name || !ts.isIdentifier(p.name)) continue;
    if (
      p.name.text === 'channel' &&
      ts.isStringLiteralLike(p.initializer) &&
      p.initializer.text === 'internal'
    ) {
      return true;
    }
  }
  return false;
}

function extractGroups() {
  const sf = parse(SRC.workplace);
  const groups = [];

  for (const group of GROUPS) {
    const decl = findDeclaration(sf, group.const);
    if (!decl || !ts.isArrayLiteralExpression(decl)) {
      fail(SRC.workplace, group.const, 'an exported array literal of tool tiles');
    }

    const tools = [];
    for (const el of decl.elements) {
      const node = unwrap(el);
      if (!node || !ts.isObjectLiteralExpression(node) || isInternalChannel(node)) continue;
      const tile = readTile(node);
      if (!tile) continue;

      // The "Weitere" dropdown is a container: its `items` are the real tools.
      if (group.menu) {
        const items = unwrap(
          node.properties.find(
            (p) =>
              ts.isPropertyAssignment(p) &&
              p.name &&
              ts.isIdentifier(p.name) &&
              p.name.text === 'items'
          )?.initializer
        );
        if (items && ts.isArrayLiteralExpression(items)) {
          for (const itemEl of items.elements) {
            const itemNode = unwrap(itemEl);
            if (!itemNode || !ts.isObjectLiteralExpression(itemNode) || isInternalChannel(itemNode))
              continue;
            const item = readTile(itemNode);
            if (item) tools.push(item);
          }
        }
        continue;
      }
      tools.push(tile);
    }

    if (tools.length === 0) fail(SRC.workplace, group.const, 'at least one non-internal tile');
    groups.push({ id: group.id, title: group.title, tools });
  }

  return groups;
}

/**
 * Tools that are reachable and searchable but have no tile — without these the
 * overview would silently omit them, which is exactly the gap this page exists
 * to close.
 */
function extractCatalog() {
  const sf = parse(SRC.catalog);
  const decl = findDeclaration(sf, 'CATALOG');
  if (!decl || !ts.isArrayLiteralExpression(decl)) {
    fail(SRC.catalog, 'CATALOG', 'an array literal of catalog entries');
  }

  const out = {};
  for (const el of decl.elements) {
    const node = unwrap(el);
    if (!node || !ts.isObjectLiteralExpression(node) || isInternalChannel(node)) continue;
    const id = stringProp(node, 'id');
    const title = stringProp(node, 'title');
    const path = stringProp(node, 'path');
    if (!id || !title || !path) continue;
    const entry = { title, path };
    const subtitle = stringProp(node, 'subtitle');
    if (subtitle) entry.subtitle = subtitle;
    out[id] = entry;
  }
  return sortKeys(out);
}

/**
 * Which routes are reachable without a login. routes.ts documents the default
 * explicitly: every route requires login unless it sets `public: true`, so the
 * absence of the flag is meaningful and we only record the exceptions.
 */
function extractPublicRoutes() {
  const sf = parse(SRC.routes);
  const publicPaths = new Set();
  let sawRoute = false;

  walk(sf, (node) => {
    if (!ts.isObjectLiteralExpression(node)) return;
    const path = stringProp(node, 'path');
    if (!path) return;
    const entries = objectEntries(node);
    if (!entries.has('component')) return;
    sawRoute = true;
    if (entries.get('public')?.kind === ts.SyntaxKind.TrueKeyword) publicPaths.add(path);
  });

  if (!sawRoute) fail(SRC.routes, 'the route table', 'object literals with `path` and `component`');
  // '*' is the catch-all 404 — a real route, but nothing a reader can visit.
  publicPaths.delete('*');
  return [...publicPaths].sort();
}

function generate() {
  const groups = extractGroups();
  const manifest = {
    groups,
    catalog: extractCatalog(),
    publicRoutes: extractPublicRoutes(),
  };
  const count = groups.reduce((n, g) => n + g.tools.length, 0);
  return {
    json: JSON.stringify(manifest, null, 2) + '\n',
    summary: `${count} Werkzeuge in ${groups.length} Gruppen`,
  };
}

// ── Audit: what the app offers vs. what the article explains ────────────────

const ISSUE_MARKER = '<!-- docs-tools -->';

/** Tool ids with a hand-written note, and which of them declare a platform. */
function extractDocumentedTools() {
  const sf = parse(NOTES_FILE);
  const decl = findDeclaration(sf, 'TOOL_NOTES');
  const documented = new Map();
  if (decl && ts.isObjectLiteralExpression(decl)) {
    for (const [id, value] of objectEntries(decl)) {
      if (!value || !ts.isObjectLiteralExpression(value)) continue;
      const entries = objectEntries(value);
      documented.set(id, { hasPlatform: entries.has('platform') });
    }
  }
  return documented;
}

function audit(manifest, manifestStale) {
  const documented = extractDocumentedTools();
  const live = manifest.groups.flatMap((g) => g.tools.map((t) => ({ ...t, group: g.title })));

  const undocumented = live.filter((t) => !documented.has(t.id));
  const withoutPlatform = live.filter(
    (t) => documented.get(t.id) && !documented.get(t.id).hasPlatform
  );
  const known = new Set(live.map((t) => t.id));
  const obsolete = [...documented.keys()].filter((id) => !known.has(id)).sort();
  const hasDrift =
    manifestStale || undocumented.length > 0 || obsolete.length > 0 || withoutPlatform.length > 0;

  const lines = [ISSUE_MARKER, ''];
  lines.push(
    'Die Werkzeuge im Code und der Artikel [`tools.mdx`](documentation/docs/basics/tools.mdx) laufen auseinander.',
    ''
  );
  if (undocumented.length > 0) {
    lines.push('### Neue Werkzeuge ohne Beschreibung', '');
    for (const t of undocumented) lines.push(`- \`${t.id}\` — ${t.title} (${t.group})`);
    lines.push(
      '',
      `Trag sie in \`${NOTES_FILE}\` ein: wofür man das Werkzeug nimmt und wann man es einem anderen vorzieht. Titel und Beschreibung kommen automatisch aus dem Code.`,
      ''
    );
  }
  if (withoutPlatform.length > 0) {
    lines.push('### Ohne Angabe, wo das Werkzeug läuft', '');
    for (const t of withoutPlatform) lines.push(`- \`${t.id}\` — ${t.title}`);
    lines.push(
      '',
      "Ergänze `platform` (z. B. `['web', 'mobile']`). Diese Angabe lässt sich nicht aus dem Code ableiten, weil Web- und Mobile-Routen getrennt gepflegt werden — deshalb wird sie hier eingefordert statt geraten.",
      ''
    );
  }
  if (obsolete.length > 0) {
    lines.push('### Beschrieben, aber im Code nicht mehr vorhanden', '');
    for (const id of obsolete) lines.push(`- \`${id}\``);
    lines.push('', `Eintrag aus \`${NOTES_FILE}\` entfernen.`, '');
  }
  if (manifestStale) {
    lines.push(
      '### Manifest veraltet',
      '',
      `Ein Werkzeug hat sich im Code geändert, \`${OUT_FILE}\` wurde aber nicht neu erzeugt.`,
      ''
    );
  }
  lines.push(
    '---',
    '',
    'Danach `pnpm --filter @gruenerator/documentation tools:generate` laufen lassen und das Ergebnis mitcommitten. Dieses Issue schließt sich von selbst, sobald die Lücke geschlossen ist.'
  );

  return { hasDrift, body: lines.join('\n') };
}

// A toolNotes key without a matching code tool is always a bug (a rename
// slipped through — see issue #2049, spaces → projekte), so it fails --check
// hard. Missing notes for NEW tools stay a soft audit finding: they need a
// human to write prose, not a broken build.
function checkStaleNotes(manifest) {
  const documented = extractDocumentedTools();
  const known = new Set(manifest.groups.flatMap((g) => g.tools.map((t) => t.id)));
  return [...documented.keys()]
    .filter((id) => !known.has(id))
    .sort()
    .map(
      (id) =>
        `${NOTES_FILE} beschreibt '${id}', das es im Code nicht (mehr) gibt — Eintrag entfernen oder auf die neue Id umbenennen.`
    );
}

runGenerator({
  outFile: OUT_FILE,
  generate,
  audit,
  check: checkStaleNotes,
  label: 'docs-freshness',
  issueTitle: 'Docs freshness: Werkzeuge ohne Beschreibung in der Übersicht',
  marker: ISSUE_MARKER,
  allClear: 'Alle Werkzeuge sind wieder beschrieben — automatisch geschlossen.',
  regenerateCmd: 'pnpm --filter @gruenerator/documentation tools:generate',
});
