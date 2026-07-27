/**
 * Generate documentation/src/generated/reference.json — the plain reference data
 * three articles kept restating in prose, read from the code that owns it:
 *
 *   - uploads     (packages/chat … fileUtils.ts) — which files the chat accepts
 *     and the four size/count caps,
 *   - collections (apps/api … systemCollectionsConfig.ts) — the collections the
 *     MCP server exposes, split into nationwide and Landesverbände,
 *   - connectors  (apps/api … McpRegistryService.ts) — the connector directory.
 *
 * ── Why one manifest, and why no audit ──────────────────────────────────────
 *
 * These are closed factual sets: a file format, a byte cap, a connector's name
 * and auth method. Unlike the chat capabilities or the Office operations there
 * is no hand-written German half to pair them with — the reader wants the fact,
 * not a phrasing. So there is nothing an audit could find missing, and `--check`
 * in docs-build is the whole contract (same call as agentura.json).
 *
 * They share one file because they share that property; splitting them into
 * three scripts would triple the CI ceremony for no gain.
 *
 * Usage:
 *   node scripts/generate-reference.mjs           # write the JSON
 *   node scripts/generate-reference.mjs --check    # exit 1 if the committed JSON is stale
 */
import {
  arrayStrings,
  constNumber,
  constSetStrings,
  fail,
  findDeclaration,
  literalText,
  objectEntries,
  parse,
  sortKeys,
  stringProp,
  ts,
  unwrap,
} from './lib/ast.mjs';
import { runGenerator } from './lib/audit.mjs';

const SRC = {
  fileUtils: 'packages/chat/src/lib/fileUtils.ts',
  collections: 'apps/api/config/systemCollectionsConfig.ts',
  connectors: 'apps/api/services/mcp/McpRegistryService.ts',
};

const OUT_FILE = 'documentation/src/generated/reference.json';

// ── Uploads ─────────────────────────────────────────────────────────────────

/**
 * Group the accepted mime types the way a reader thinks about them. The code
 * groups by mime prefix, which is an implementation detail; a person looking for
 * "can I upload a spreadsheet" wants the spreadsheet row.
 */
const MIME_GROUPS = [
  { id: 'dokumente', title: 'Dokumente', match: /pdf|wordprocessingml|opendocument\.text/ },
  { id: 'tabellen', title: 'Tabellen', match: /spreadsheet|ms-excel|csv/ },
  { id: 'praesentationen', title: 'Präsentationen', match: /presentationml/ },
  { id: 'bilder', title: 'Bilder', match: /^image\// },
  { id: 'text', title: 'Text & Code', match: /^text\/|json|xml/ },
];

function extractUploads() {
  const sf = parse(SRC.fileUtils);

  const decl = findDeclaration(sf, 'ALLOWED_FILE_TYPES');
  if (!decl || !ts.isObjectLiteralExpression(decl)) {
    fail(SRC.fileUtils, 'ALLOWED_FILE_TYPES', 'an object literal of mime → label');
  }

  const groups = MIME_GROUPS.map((g) => ({ id: g.id, title: g.title, labels: [] }));
  const ungrouped = [];
  for (const p of decl.properties) {
    if (!ts.isPropertyAssignment(p) || !p.name) continue;
    const mime = ts.isStringLiteral(p.name) ? p.name.text : null;
    const label = literalText(p.initializer);
    if (!mime || !label) continue;
    const group = MIME_GROUPS.find((g) => g.match.test(mime));
    if (!group) {
      ungrouped.push(mime);
      continue;
    }
    const target = groups.find((g) => g.id === group.id);
    if (!target.labels.includes(label)) target.labels.push(label);
  }
  // A new mime type that matches no group would silently vanish from the docs —
  // louder to fail than to publish an incomplete list.
  if (ungrouped.length > 0) {
    throw new Error(
      `${SRC.fileUtils}: mime types match no documentation group: ${ungrouped.join(', ')}.\n` +
        `  Add a group to MIME_GROUPS in documentation/scripts/generate-reference.mjs.`
    );
  }

  const extensions = constSetStrings(sf, 'TEXT_EXTENSION_OVERRIDES');
  if (extensions.length === 0) {
    fail(SRC.fileUtils, 'TEXT_EXTENSION_OVERRIDES', 'a `new Set([...])` of extensions');
  }
  const video = constSetStrings(sf, 'VIDEO_MIME_TYPES');

  const mb = (bytes) => (bytes === undefined ? undefined : Math.round(bytes / (1024 * 1024)));
  const limits = {
    maxFileSizeMB: mb(constNumber(sf, 'MAX_FILE_SIZE')),
    maxTotalSizeMB: mb(constNumber(sf, 'MAX_TOTAL_SIZE')),
    maxFiles: constNumber(sf, 'MAX_FILES'),
    maxVideoFileSizeMB: mb(constNumber(sf, 'MAX_VIDEO_FILE_SIZE')),
  };
  for (const [key, value] of Object.entries(limits)) {
    if (value === undefined) fail(SRC.fileUtils, key, 'a numeric constant like `25 * 1024 * 1024`');
  }

  return {
    groups: groups.filter((g) => g.labels.length > 0),
    codeExtensions: extensions.slice().sort(),
    videoFormats: video.map((m) => m.replace(/^video\//, '')).sort(),
    limits,
  };
}

// ── System collections ──────────────────────────────────────────────────────

function extractCollections() {
  const sf = parse(SRC.collections);
  const decl = findDeclaration(sf, 'SYSTEM_COLLECTIONS');
  if (!decl || !ts.isObjectLiteralExpression(decl)) {
    fail(SRC.collections, 'SYSTEM_COLLECTIONS', 'an object literal keyed by collection id');
  }

  const nationwide = [];
  const landesverbaende = [];
  const examples = [];
  for (const [, value] of objectEntries(decl)) {
    if (!value || !ts.isObjectLiteralExpression(value)) continue;
    // Only what the MCP server actually serves — the rest is internal.
    const exposed = value.properties.some(
      (p) =>
        ts.isPropertyAssignment(p) &&
        p.name &&
        ts.isIdentifier(p.name) &&
        p.name.text === 'mcpExposed' &&
        p.initializer.kind === ts.SyntaxKind.TrueKeyword
    );
    if (!exposed) continue;

    const id = stringProp(value, 'id');
    const name = stringProp(value, 'name');
    if (!id || !name) continue;
    const entry = { id, name };
    const description = stringProp(value, 'description');
    if (description) entry.description = description;

    // A Landesverband is identified by its defaultFilter on the shared
    // landesverbaende collection — that filter IS what makes it one.
    const filter = value.properties.find(
      (p) =>
        ts.isPropertyAssignment(p) &&
        p.name &&
        ts.isIdentifier(p.name) &&
        p.name.text === 'defaultFilter'
    );
    const filterObj = filter && unwrap(filter.initializer);
    const isLv =
      filterObj &&
      ts.isObjectLiteralExpression(filterObj) &&
      stringProp(filterObj, 'field') === 'landesverband';

    // `value` is a single code for most, but an array where the Fraktion has its
    // own code ('BY' + 'BY-F'). Both shapes mean the same thing here.
    let codes = [];
    if (isLv) {
      const single = stringProp(filterObj, 'value');
      if (single) codes = [single];
      else {
        const valueProp = filterObj.properties.find(
          (p) =>
            ts.isPropertyAssignment(p) &&
            p.name &&
            ts.isIdentifier(p.name) &&
            p.name.text === 'value'
        );
        codes = arrayStrings(valueProp && unwrap(valueProp.initializer));
      }
    }

    if (codes.length > 0) landesverbaende.push({ ...entry, codes });
    // The social-media examples are exposed to the MCP too, but served by their
    // own tool rather than the document search — counting them among the
    // document collections would overstate that number by one.
    else if (stringProp(value, 'qdrantCollection') === 'social_media_examples')
      examples.push(entry);
    else nationwide.push(entry);
  }

  if (nationwide.length === 0 || landesverbaende.length === 0) {
    fail(SRC.collections, 'SYSTEM_COLLECTIONS', 'both nationwide and Landesverband entries');
  }
  const byName = (a, b) => a.name.localeCompare(b.name, 'de');
  return {
    nationwide: nationwide.sort(byName),
    landesverbaende: landesverbaende.sort(byName),
    examples: examples.sort(byName),
  };
}

// ── Connector directory ─────────────────────────────────────────────────────

/** German wording for the three auth kinds — the code's enum is English. */
const AUTH_LABEL = {
  oauth: 'Anmeldung beim Dienst',
  bearer: 'Zugangsschlüssel',
  none: 'Keine',
};

function extractConnectors() {
  const sf = parse(SRC.connectors);
  const decl = findDeclaration(sf, 'SEEDS');
  if (!decl || !ts.isArrayLiteralExpression(decl)) {
    fail(SRC.connectors, 'SEEDS', 'an array literal of connector tuples');
  }

  const byCategory = {};
  for (const el of decl.elements) {
    const tuple = unwrap(el);
    if (!tuple || !ts.isArrayLiteralExpression(tuple)) continue;
    // Seed = [title, url, authHint, description, websiteUrl, category, opts?]
    const [title, , authHint, description, , category] = arrayStrings(tuple);
    if (!title || !category) continue;
    const auth = AUTH_LABEL[authHint];
    if (!auth) {
      throw new Error(
        `${SRC.connectors}: unknown authHint "${authHint}" for ${title}.\n` +
          `  Add a German wording to AUTH_LABEL in documentation/scripts/generate-reference.mjs.`
      );
    }
    (byCategory[category] ??= []).push({ title, auth, description: description ?? '' });
  }

  const count = Object.values(byCategory).reduce((n, list) => n + list.length, 0);
  if (count === 0) fail(SRC.connectors, 'SEEDS', 'at least one connector');
  for (const list of Object.values(byCategory))
    list.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  return sortKeys(byCategory);
}

// ── Manifest ────────────────────────────────────────────────────────────────

function generate() {
  const uploads = extractUploads();
  const collections = extractCollections();
  const connectors = extractConnectors();
  const connectorCount = Object.values(connectors).reduce((n, list) => n + list.length, 0);

  return {
    json: JSON.stringify({ uploads, collections, connectors }, null, 2) + '\n',
    summary:
      `${collections.nationwide.length} überregionale + ${collections.landesverbaende.length} Landesverband-Sammlungen, ` +
      `${connectorCount} Konnektoren, ${uploads.groups.length} Datei-Gruppen`,
  };
}

runGenerator({
  outFile: OUT_FILE,
  generate,
  regenerateCmd: 'pnpm --filter @gruenerator/documentation reference:generate',
});
