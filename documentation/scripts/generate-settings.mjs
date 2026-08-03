/**
 * Generate documentation/src/generated/settings.json — the machine-read
 * inventory of the Grünerator's Einstellungen dialog, derived from the app's own
 * configs so the documentation can't quietly drift from the UI:
 *
 *   - the tab strip        (apps/web … settings/SettingsDialog.tsx, `NAV`)
 *   - the settings rows    (packages/shared … settings/catalog.ts) — every row
 *     the dialog renders through <SettingsRow>, with its title and description.
 *     Shared with apps/mobile, which shows a subset marked by `platforms`.
 *   - the choices          (apps/web … settings/tabs/GeneralTab.tsx) — theme,
 *     locale and start-page options as the user sees them labelled
 *   - writing-style presets (apps/web … settings/tabs/TexteAnlernenTab.tsx)
 *   - notification types   (apps/web … notifications/notificationPreferenceMeta.ts,
 *     `RAW_TYPE_META` + `LEVEL_OPTIONS`) and their groups
 *
 * Drift is REPORTED, not thrown, exactly like generate-chat-capabilities.mjs:
 * `--audit` compares the dialog against what the article documents and, with
 * `--apply`, files or updates one deduplicated GitHub issue. A new setting never
 * breaks anyone's build — it shows up as a task.
 *
 * The audit also checks the catalog's `platforms` field against apps/mobile in
 * both directions: marked as an app setting but never referenced there, and
 * referenced there but still marked web-only. Both stay on the soft side — a
 * row that is planned for mobile but not built yet is a task, not a broken build.
 *
 * Extraction is AST-based (TypeScript compiler API), never an import: these
 * modules pull in react-icons and Vite aliases that don't resolve under plain
 * Node. We only read string literals, so the app is never executed.
 *
 * Usage:
 *   node scripts/generate-settings.mjs                  # write the JSON
 *   node scripts/generate-settings.mjs --check          # exit 1 if the committed JSON is stale
 *   node scripts/generate-settings.mjs --audit          # report drift (always exit 0)
 *   node scripts/generate-settings.mjs --audit --apply  # …and sync the GitHub issue
 *   node scripts/generate-settings.mjs --audit --pr-comment  # …and post a sticky PR comment
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const OUT_FILE = path.join(REPO_ROOT, 'documentation/src/generated/settings.json');

const SRC = {
  dialog: 'apps/web/src/features/settings/SettingsDialog.tsx',
  // Shared with apps/mobile, which renders a subset of the same rows.
  catalog: 'packages/shared/src/settings/catalog.ts',
  general: 'apps/web/src/features/settings/tabs/GeneralTab.tsx',
  texteAnlernen: 'apps/web/src/features/settings/tabs/TexteAnlernenTab.tsx',
  notificationMeta: 'apps/web/src/features/notifications/notificationPreferenceMeta.ts',
  notificationGroups: 'apps/web/src/features/notifications/types/index.ts',
};

const EXAMPLES_FILE = 'documentation/src/components/SettingsOverview/tabNotes.ts';
const ARTICLE = 'documentation/docs/Profil/einstellungen.mdx';
const ISSUE_LABEL = 'docs-freshness';
const ISSUE_TITLE = 'Docs freshness: Einstellungen ohne Beschreibung';
const ISSUE_MARKER = '<!-- docs-settings -->';

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
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === name &&
      (ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer))
    ) {
      return p.initializer.text;
    }
  }
  return undefined;
}

function walk(sf, fn) {
  const visit = (node) => {
    fn(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

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

function requireArray(relFile, name) {
  const decl = unwrap(findDeclaration(parse(relFile), name));
  if (!decl || !ts.isArrayLiteralExpression(decl)) {
    throw new Error(
      `${relFile}: \`${name}\` not found as an array literal — the settings UI moved ` +
        `or changed shape; update generate-settings.mjs.`
    );
  }
  return decl.elements.filter((e) => ts.isObjectLiteralExpression(e));
}

function requireObject(relFile, name) {
  const decl = unwrap(findDeclaration(parse(relFile), name));
  if (!decl || !ts.isObjectLiteralExpression(decl)) {
    throw new Error(
      `${relFile}: \`${name}\` not found as an object literal — the settings UI moved ` +
        `or changed shape; update generate-settings.mjs.`
    );
  }
  return decl;
}

/** `NAV` in SettingsDialog.tsx → the tab strip, in display order. */
function extractTabs() {
  return requireArray(SRC.dialog, 'NAV')
    .map((el) => ({ value: stringProp(el, 'value'), label: stringProp(el, 'label') }))
    .filter((t) => t.value && t.label);
}

/** `SETTINGS_CATALOG` → every row the dialog renders, with title + description. */
function extractRows() {
  const rows = {};
  for (const el of requireArray(SRC.catalog, 'SETTINGS_CATALOG')) {
    const id = stringProp(el, 'id');
    const title = stringProp(el, 'title');
    if (!id || !title) continue;
    const entry = { tab: stringProp(el, 'tab') ?? '', title };
    const description = stringProp(el, 'description');
    if (description) entry.description = description;
    rows[id] = entry;
  }
  return rows;
}

/** The labelled choices behind the three pickers in the Allgemein tab. */
function extractChoices() {
  const readOptions = (name) =>
    requireArray(SRC.general, name)
      .map((el) => ({ value: stringProp(el, 'value'), label: stringProp(el, 'label') }))
      .filter((o) => o.value && o.label);
  return {
    theme: readOptions('THEME_OPTIONS'),
    locale: readOptions('LOCALE_OPTIONS'),
    startPage: readOptions('START_PAGE_OPTIONS'),
  };
}

/** The writing-style presets a user can teach. */
function extractTextFormPresets() {
  return requireArray(SRC.texteAnlernen, 'PRESETS')
    .map((el) => ({
      textType: stringProp(el, 'textType'),
      label: stringProp(el, 'label'),
      hint: stringProp(el, 'hint'),
    }))
    .filter((p) => p.textType && p.label);
}

/** Every notification a user can switch on or off, grouped as the UI groups them. */
function extractNotifications() {
  const groupsObj = requireObject(SRC.notificationGroups, 'NOTIFICATION_GROUPS');
  const groups = [];
  for (const p of groupsObj.properties) {
    if (!ts.isPropertyAssignment(p) || !p.name) continue;
    const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
    const init = unwrap(p.initializer);
    if (!key || !init || !ts.isObjectLiteralExpression(init)) continue;
    const label = stringProp(init, 'label');
    const orderProp = init.properties.find(
      (q) =>
        ts.isPropertyAssignment(q) &&
        q.name &&
        ts.isIdentifier(q.name) &&
        q.name.text === 'order' &&
        ts.isNumericLiteral(q.initializer)
    );
    if (label)
      groups.push({ key, label, order: orderProp ? Number(orderProp.initializer.text) : 0 });
  }
  groups.sort((a, b) => a.order - b.order);

  const metaObj = requireObject(SRC.notificationMeta, 'RAW_TYPE_META');
  const types = [];
  for (const p of metaObj.properties) {
    if (!ts.isPropertyAssignment(p) || !p.name) continue;
    const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
    const init = unwrap(p.initializer);
    if (!key || !init || !ts.isObjectLiteralExpression(init)) continue;
    const label = stringProp(init, 'label');
    if (!label) continue;
    types.push({
      key,
      label,
      description: stringProp(init, 'description') ?? '',
      group: stringProp(init, 'group') ?? '',
    });
  }

  const levels = requireArray(SRC.notificationMeta, 'LEVEL_OPTIONS')
    .map((el) => ({
      value: stringProp(el, 'value'),
      label: stringProp(el, 'label'),
      description: stringProp(el, 'description') ?? '',
    }))
    .filter((l) => l.value && l.label);

  return {
    groups: groups.map(({ key, label }) => ({ key, label })),
    types,
    levels,
  };
}

function generate() {
  const manifest = {
    tabs: extractTabs(),
    rows: extractRows(),
    choices: extractChoices(),
    textFormPresets: extractTextFormPresets(),
    notifications: extractNotifications(),
  };
  return {
    json: JSON.stringify(manifest, null, 2) + '\n',
    manifest,
    count: manifest.tabs.length,
  };
}

// ── Audit: what the dialog offers vs. what the article documents ────────────

/** The tabs and rows the article describes, read from tabNotes.ts by AST. */
function extractDocumented() {
  const sf = parse(EXAMPLES_FILE);
  const tabs = [];
  const decl = unwrap(findDeclaration(sf, 'TAB_NOTES'));
  if (decl && ts.isArrayLiteralExpression(decl)) {
    for (const el of decl.elements) {
      if (!ts.isObjectLiteralExpression(el)) continue;
      const tab = stringProp(el, 'tab');
      if (tab) tabs.push(tab);
    }
  }
  return tabs;
}

/**
 * `SETTINGS_CATALOG` → id → the platforms it claims to exist on.
 *
 * Kept out of the manifest on purpose: the JSON describes what a *reader* of the
 * docs sees, and "which app ships this row" is a fact about the codebase.
 */
function catalogPlatforms() {
  const platforms = {};
  for (const el of requireArray(SRC.catalog, 'SETTINGS_CATALOG')) {
    const id = stringProp(el, 'id');
    if (!id) continue;
    const prop = el.properties.find(
      (p) =>
        ts.isPropertyAssignment(p) &&
        p.name &&
        ts.isIdentifier(p.name) &&
        p.name.text === 'platforms'
    );
    const init = prop ? unwrap(prop.initializer) : null;
    if (!init) {
      // Absent means web-only — the catalog's own default.
      platforms[id] = ['web'];
    } else if (ts.isArrayLiteralExpression(init)) {
      platforms[id] = init.elements.filter(ts.isStringLiteral).map((e) => e.text);
    } else {
      // `platforms: BOTH` and friends: an identifier we can't evaluate without
      // running the module. Resolve the alias from its own declaration.
      const alias = ts.isIdentifier(init)
        ? unwrap(findDeclaration(parse(SRC.catalog), init.text))
        : null;
      platforms[id] =
        alias && ts.isArrayLiteralExpression(alias)
          ? alias.elements.filter(ts.isStringLiteral).map((e) => e.text)
          : ['web'];
    }
  }
  return platforms;
}

/** Every `getSettingsEntry('<id>')` the mobile app actually references. */
function mobileReferencedIds() {
  const root = path.join(REPO_ROOT, 'apps/mobile');
  const ids = new Set();
  for (const rel of readdirSync(root, { recursive: true })) {
    const name = String(rel);
    if (!/\.tsx?$/.test(name) || name.includes('node_modules')) continue;
    const text = readFileSync(path.join(root, name), 'utf-8');
    for (const m of text.matchAll(/getSettingsEntry\(\s*['"]([^'"]+)['"]\s*\)/g)) ids.add(m[1]);
  }
  return ids;
}

function auditDrift(manifest) {
  const documented = new Set(extractDocumented());
  const known = new Set(manifest.tabs.map((t) => t.value));

  // Mobile is the deliberate subset, so both directions of the mismatch matter.
  // This checks *referencing*, not visibility: a row behind a condition that is
  // never true still counts as present — the same blind spot the UiLabel
  // manifest has.
  const platforms = catalogPlatforms();
  const mobileIds = mobileReferencedIds();
  const claimsMobile = (id) => (platforms[id] ?? ['web']).includes('mobile');

  return {
    undocumented: manifest.tabs.filter((t) => !documented.has(t.value)),
    obsolete: [...documented].filter((t) => !known.has(t)).sort(),
    rowsWithoutDescription: Object.entries(manifest.rows)
      .filter(([, row]) => !row.description)
      .map(([id]) => id),
    // Marked as shipping on mobile, but no mobile file asks for it.
    mobileMissing: Object.keys(manifest.rows)
      .filter((id) => claimsMobile(id) && !mobileIds.has(id))
      .sort(),
    // The quieter direction, and the one that rots unnoticed: mobile renders the
    // row, but the catalog still calls it web-only — so the docs undersell it.
    mobileUnmarked: [...mobileIds].filter((id) => !claimsMobile(id)).sort(),
  };
}

function buildReport(drift, manifestStale) {
  const lines = [ISSUE_MARKER, ''];
  lines.push(
    `Der Einstellungen-Dialog und der Artikel [\`einstellungen.mdx\`](${ARTICLE}) laufen auseinander.`,
    ''
  );

  if (drift.undocumented.length > 0) {
    lines.push('### Neue Bereiche ohne Beschreibung', '');
    for (const tab of drift.undocumented) lines.push(`- **${tab.label}** (\`${tab.value}\`)`);
    lines.push(
      '',
      `Beschreib sie in \`${EXAMPLES_FILE}\`: wofür der Bereich da ist und was man dort einstellen kann.`,
      ''
    );
  }
  if (drift.obsolete.length > 0) {
    lines.push('### Beschrieben, aber im Dialog nicht mehr vorhanden', '');
    for (const tab of drift.obsolete) lines.push(`- \`${tab}\``);
    lines.push('', `Eintrag aus \`${EXAMPLES_FILE}\` entfernen.`, '');
  }
  if (drift.mobileMissing.length > 0) {
    lines.push('### Als App-Einstellung markiert, aber in der App nicht vorhanden', '');
    for (const id of drift.mobileMissing) lines.push(`- \`${id}\``);
    lines.push(
      '',
      'Entweder die Zeile in `apps/mobile` bauen (über `getSettingsEntry` beschriften) oder das `platforms`-Feld im Katalog wieder auf Web-only setzen.',
      ''
    );
  }
  if (drift.mobileUnmarked.length > 0) {
    lines.push('### In der App vorhanden, im Katalog aber nicht als App-Einstellung markiert', '');
    for (const id of drift.mobileUnmarked) lines.push(`- \`${id}\``);
    lines.push(
      '',
      `\`platforms: BOTH\` im Katalog (\`${SRC.catalog}\`) ergänzen — sonst zählt die Doku die Einstellung weiter als Web-only.`,
      ''
    );
  }
  if (manifestStale) {
    lines.push(
      '### Manifest veraltet',
      '',
      'Beschriftungen im Dialog haben sich geändert, `src/generated/settings.json` wurde aber nicht neu erzeugt.',
      ''
    );
  }

  lines.push(
    '---',
    '',
    'Danach einmal `pnpm --filter @gruenerator/documentation settings:generate` laufen lassen und das Ergebnis mitcommitten. Dieses Issue schließt sich von selbst, sobald die Lücke geschlossen ist.'
  );
  return lines.join('\n');
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf-8' });
}

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
      'Alle Einstellungen sind wieder beschrieben — automatisch geschlossen.',
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

function syncPrComment(hasDrift, body) {
  const prNumber = process.env.PR_NUMBER;
  if (!prNumber) return 'PR_NUMBER fehlt — kein Kommentar';
  const existing = JSON.parse(gh(['pr', 'view', prNumber, '--json', 'comments'])).comments.find(
    (c) => c.body.includes(ISSUE_MARKER)
  );

  if (!hasDrift) {
    if (!existing) return 'nichts zu tun (keine Drift)';
    gh([
      'pr',
      'comment',
      prNumber,
      '--edit-last',
      '--body',
      `${ISSUE_MARKER}\n\n✓ Alle Einstellungen sind beschrieben.`,
    ]);
    return 'Kommentar auf „alles beschrieben" gesetzt';
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
const { json, manifest, count } = generate();

if (audit) {
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
    drift.mobileMissing.length > 0 ||
    drift.mobileUnmarked.length > 0;

  const body = buildReport(drift, manifestStale);
  console.log(
    hasDrift
      ? body
      : `✓ Alle ${count} Einstellungs-Bereiche sind beschrieben und das Manifest ist aktuell.`
  );
  if (drift.rowsWithoutDescription.length > 0) {
    // Not drift, just a nudge: a row without a description reads as a bare label
    // in the dialog AND in the docs.
    console.log(
      `\nHinweis: ohne Beschreibung im Katalog — ${drift.rowsWithoutDescription.join(', ')}`
    );
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      hasDrift ? body : `✓ Alle ${count} Einstellungs-Bereiche sind beschrieben.\n`
    );
  }
  if (process.argv.includes('--apply')) console.log(`→ ${syncIssue(hasDrift, body)}`);
  if (process.argv.includes('--pr-comment')) console.log(`→ ${syncPrComment(hasDrift, body)}`);

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
      `✗ settings.json is out of date (${count} tabs expected).\n` +
        `  The settings dialog changed but the manifest wasn't regenerated.\n` +
        `  Run: pnpm --filter @gruenerator/documentation settings:generate`
    );
    process.exit(1);
  }
  console.log(`✓ settings.json is up to date (${count} tabs).`);
} else {
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, json);
  console.log(`✓ Wrote ${count} tabs → ${path.relative(REPO_ROOT, OUT_FILE)}`);
}
