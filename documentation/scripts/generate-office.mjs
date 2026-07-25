/**
 * Generate documentation/src/generated/office.json — the machine-read inventory
 * of the Office suite (Dokumente, Tabellen, Präsentationen, Boards), derived
 * from the code's own contracts:
 *
 *   - the document subtypes    (contracts … docs.ts, COLLAB_SUBTYPE_VALUES — the
 *     file calls itself the single source of truth and the API derives from it),
 *   - the sharing model        (contracts … docs.ts, share mode / permission),
 *   - what the AI can change   (contracts … sheets.ts / presentations.ts, the
 *     two discriminated operation unions, plus their per-request caps),
 *   - the Grünerator-Spalte    (contracts … boardFlow.ts, sources / tasks /
 *     outputs / presets),
 *   - the sheet import limits  (apps/web … SheetImportDialog.tsx).
 *
 * ── Why this reads the runtime and not just the schema ──────────────────────
 *
 * A Zod union says what the model MAY emit, not what the editor actually does.
 * `add_chart` is in sheetOperationSchema but applySheetOperations.ts skips it
 * with "Diagramme sind vorübergehend deaktiviert." — a manifest built from the
 * schema alone would document a feature that silently does nothing. So we also
 * read the apply switch and mark ops whose case body is nothing but a
 * `skipped.push(...)` + `break`. That distinguishes a permanently disabled
 * operation from a conditional skip (a sort column outside its range), which
 * depends on the data and is not a documentation concern.
 *
 * The docs article embeds this via <OfficeOps>, which pairs every operation
 * with a hand-written German example sentence in OfficeOps/opNotes.ts —
 * readers never type operation names, so what they need is the phrasing.
 *
 * Usage:
 *   node scripts/generate-office.mjs                  # write the JSON
 *   node scripts/generate-office.mjs --check          # exit 1 if committed JSON is stale
 *   node scripts/generate-office.mjs --audit          # report gaps (always exit 0)
 *   node scripts/generate-office.mjs --audit --apply  # …and sync the GitHub issue
 */
import {
  arrayStrings,
  constStringArray,
  fail,
  findDeclaration,
  jsDocSummary,
  literalText,
  objectEntries,
  parse,
  sortKeys,
  stringProp,
  ts,
  unwrap,
  walk,
  zodArrayMax,
  zodDiscriminatedUnion,
  zodEnum,
  zodEnumProp,
} from './lib/ast.mjs';
import { runGenerator } from './lib/audit.mjs';

const SRC = {
  docs: 'packages/contracts/src/schemas/docs.ts',
  sheets: 'packages/contracts/src/schemas/sheets.ts',
  presentations: 'packages/contracts/src/schemas/presentations.ts',
  boardFlow: 'packages/contracts/src/schemas/boardFlow.ts',
  applySheet: 'packages/sheets/src/ai/applySheetOperations.ts',
  docTypeMeta: 'apps/web/src/features/docs/docTypeMeta.tsx',
  sheetImport: 'apps/web/src/features/sheets/SheetImportDialog.tsx',
};

const OUT_FILE = 'documentation/src/generated/office.json';
const NOTES_FILE = 'documentation/src/components/OfficeOps/opNotes.ts';

// ── Documents ───────────────────────────────────────────────────────────────

function extractDocuments() {
  const sf = parse(SRC.docs);
  const subtypes = constStringArray(sf, 'COLLAB_SUBTYPE_VALUES');
  if (subtypes.length === 0) {
    fail(SRC.docs, 'COLLAB_SUBTYPE_VALUES', 'a `const … = [...] as const` string array');
  }

  const meta = parse(SRC.docTypeMeta);
  const decl = findDeclaration(meta, 'DOC_TYPE_META');
  const labels = {};
  if (decl && ts.isObjectLiteralExpression(decl)) {
    for (const [kind, value] of objectEntries(decl)) {
      if (value && ts.isObjectLiteralExpression(value)) {
        const label = stringProp(value, 'label');
        if (label) labels[kind] = label;
      }
    }
  }
  if (Object.keys(labels).length === 0) {
    fail(SRC.docTypeMeta, 'DOC_TYPE_META', 'an object literal of { kind: { label } }');
  }

  return {
    subtypes,
    typeLabels: sortKeys(labels),
    sharing: {
      modes: zodEnumProp(sf, 'shareSettingsSchema', 'share_mode', SRC.docs),
      permissions: zodEnumProp(sf, 'shareSettingsSchema', 'share_permission', SRC.docs),
    },
  };
}

// ── Sheets: schema union crossed with the apply switch ──────────────────────

/**
 * Operations the editor refuses outright. A case clause counts as disabled only
 * when its whole body is `skipped.push('<reason>')` followed by `break` — no
 * branching, no `applied++`. Conditional skips deeper inside a case (bad sort
 * column, missing editor context) are data-dependent and stay undocumented.
 */
function extractDisabledSheetOps() {
  const sf = parse(SRC.applySheet);
  const disabled = {};

  walk(sf, (node) => {
    if (!ts.isCaseClause(node)) return;
    const opId = literalText(node.expression);
    if (!opId) return;

    // `case 'x': { … }` wraps the body in a block; `case 'x': …` does not.
    let statements = node.statements;
    if (statements.length === 1 && ts.isBlock(statements[0])) statements = statements[0].statements;
    if (statements.length !== 2 || !ts.isBreakStatement(statements[1])) return;

    const first = statements[0];
    if (!ts.isExpressionStatement(first) || !ts.isCallExpression(first.expression)) return;
    const call = first.expression;
    if (
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.name.text !== 'push' ||
      !ts.isIdentifier(call.expression.expression) ||
      call.expression.expression.text !== 'skipped'
    ) {
      return;
    }
    const reason = literalText(call.arguments[0]);
    if (reason) disabled[opId] = reason;
  });

  return disabled;
}

function extractSheets() {
  const sf = parse(SRC.sheets);
  const disabled = extractDisabledSheetOps();
  const operations = zodDiscriminatedUnion(sf, 'sheetOperationSchema', SRC.sheets).map((op) =>
    disabled[op.id] ? { ...op, disabled: true, disabledReason: disabled[op.id] } : op
  );

  // A disabled id that no longer matches any operation means the apply switch
  // and the schema have drifted apart — louder than a stale docs page.
  const ids = new Set(operations.map((o) => o.id));
  const orphans = Object.keys(disabled).filter((id) => !ids.has(id));
  if (orphans.length > 0) {
    throw new Error(
      `${SRC.applySheet}: skips operations that sheetOperationSchema doesn't define: ${orphans.join(', ')}.`
    );
  }

  const imports = parse(SRC.sheetImport);
  return {
    operations,
    maxOperations: zodArrayMax(sf, 'sheetOperationsSchema'),
    import: { formats: extractAcceptedExtensions(imports), maxSizeMB: extractMaxSizeMB(imports) },
  };
}

/** `ACCEPTED_TYPES = { 'mime': ['.xlsx'], … }` → the flat, de-duplicated extensions. */
function extractAcceptedExtensions(sf) {
  const decl = findDeclaration(sf, 'ACCEPTED_TYPES');
  if (!decl || !ts.isObjectLiteralExpression(decl)) {
    fail(SRC.sheetImport, 'ACCEPTED_TYPES', 'an object literal of mime → extensions');
  }
  const out = new Set();
  for (const [, value] of objectEntries(decl)) {
    for (const ext of arrayStrings(value)) out.add(ext);
  }
  return [...out].sort();
}

/** The `maxSizeMB={25}` prop on the import dialog's UploadZone. */
function extractMaxSizeMB(sf) {
  let size;
  walk(sf, (node) => {
    if (size !== undefined || !ts.isJsxAttribute(node)) return;
    if (!ts.isIdentifier(node.name) || node.name.text !== 'maxSizeMB') return;
    const init = node.initializer;
    if (
      init &&
      ts.isJsxExpression(init) &&
      init.expression &&
      ts.isNumericLiteral(init.expression)
    ) {
      size = Number(init.expression.text);
    }
  });
  if (size === undefined)
    fail(SRC.sheetImport, 'maxSizeMB', 'a numeric maxSizeMB prop on UploadZone');
  return size;
}

// ── Presentations & boards ──────────────────────────────────────────────────

function extractPresentations() {
  const sf = parse(SRC.presentations);
  return {
    operations: zodDiscriminatedUnion(sf, 'presentationOperationSchema', SRC.presentations),
    maxOperations: zodArrayMax(sf, 'presentationOperationsSchema'),
    slideLayouts: zodEnum(sf, 'slideLayoutSchema', SRC.presentations),
    slideTransitions: zodEnum(sf, 'slideTransitionSchema', SRC.presentations),
  };
}

function extractBoards() {
  const sf = parse(SRC.boardFlow);
  const presetsDecl = findDeclaration(sf, 'BOARD_AI_PRESETS');
  if (!presetsDecl || !ts.isArrayLiteralExpression(presetsDecl)) {
    fail(SRC.boardFlow, 'BOARD_AI_PRESETS', 'an array literal of { type, label, description }');
  }
  const presets = {};
  for (const el of presetsDecl.elements) {
    const obj = unwrap(el);
    if (!obj || !ts.isObjectLiteralExpression(obj)) continue;
    const type = stringProp(obj, 'type');
    const label = stringProp(obj, 'label');
    if (!type || !label) continue;
    presets[type] = { label, description: stringProp(obj, 'description') ?? '' };
  }

  const ids = (union) => zodDiscriminatedUnion(sf, union, SRC.boardFlow).map((m) => m.id);
  return {
    presets: sortKeys(presets),
    flowSources: ids('boardFlowSourceSchema'),
    flowTasks: ids('boardFlowTaskSchema'),
    flowOutputs: ids('boardFlowOutputSchema'),
  };
}

// ── Manifest ────────────────────────────────────────────────────────────────

function generate() {
  const sheets = extractSheets();
  const presentations = extractPresentations();
  const manifest = {
    documents: extractDocuments(),
    sheets,
    presentations,
    boards: extractBoards(),
  };
  const opCount = sheets.operations.length + presentations.operations.length;
  const disabledCount = sheets.operations.filter((o) => o.disabled).length;
  return {
    json: JSON.stringify(manifest, null, 2) + '\n',
    summary: `${opCount} KI-Operationen (davon ${disabledCount} deaktiviert)`,
  };
}

// ── Audit: what the code can do vs. what the article explains ───────────────

const ISSUE_MARKER = '<!-- docs-office -->';

/** The operation ids that have a hand-written German example, read by AST. */
function extractDocumentedOps() {
  const sf = parse(NOTES_FILE);
  const decl = findDeclaration(sf, 'OP_NOTES');
  const documented = new Set();
  if (decl && ts.isObjectLiteralExpression(decl)) {
    for (const [surface, value] of objectEntries(decl)) {
      if (!value || !ts.isObjectLiteralExpression(value)) continue;
      for (const [opId] of objectEntries(value)) documented.add(`${surface}.${opId}`);
    }
  }
  return documented;
}

function audit(manifest, manifestStale) {
  const documented = extractDocumentedOps();
  const live = [];
  for (const surface of ['sheets', 'presentations']) {
    for (const op of manifest[surface].operations) {
      // A disabled operation must NOT be described as if it worked — it is
      // rendered as "derzeit nicht verfügbar" and needs no example sentence.
      if (op.disabled) continue;
      live.push({ key: `${surface}.${op.id}`, surface, id: op.id, doc: op.doc });
    }
  }

  const undocumented = live.filter((op) => !documented.has(op.key));
  const known = new Set(live.map((op) => op.key));
  const obsolete = [...documented].filter((key) => !known.has(key)).sort();
  const hasDrift = manifestStale || undocumented.length > 0 || obsolete.length > 0;

  const lines = [ISSUE_MARKER, ''];
  lines.push(
    'Die Office-Fähigkeiten im Code und die Artikel unter `documentation/docs/office/` laufen auseinander.',
    ''
  );
  if (undocumented.length > 0) {
    lines.push('### Neue KI-Operationen ohne Beispielsatz', '');
    for (const op of undocumented) {
      lines.push(`- \`${op.key}\`${op.doc ? ` — ${op.doc}` : ''}`);
    }
    lines.push(
      '',
      `Trag sie in \`${NOTES_FILE}\` ein: ein Satz in der Sprache, die Nutzer\\*innen tatsächlich tippen — nicht der Operationsname. Beispiel: „Markiere alle Zeilen rot, in denen die Frist überschritten ist."`,
      ''
    );
  }
  if (obsolete.length > 0) {
    lines.push('### Beschrieben, aber im Code nicht mehr vorhanden', '');
    for (const key of obsolete) lines.push(`- \`${key}\``);
    lines.push('', `Eintrag aus \`${NOTES_FILE}\` entfernen.`, '');
  }
  if (manifestStale) {
    lines.push(
      '### Manifest veraltet',
      '',
      `Etwas hat sich im Code geändert, \`${OUT_FILE}\` wurde aber nicht neu erzeugt.`,
      ''
    );
  }
  lines.push(
    '---',
    '',
    'Danach `pnpm --filter @gruenerator/documentation office:generate` laufen lassen und das Ergebnis mitcommitten. Dieses Issue schließt sich von selbst, sobald die Lücke geschlossen ist.'
  );

  return { hasDrift, body: lines.join('\n') };
}

runGenerator({
  outFile: OUT_FILE,
  generate,
  audit,
  label: 'docs-freshness',
  issueTitle: 'Docs freshness: Office-Fähigkeiten ohne Beschreibung',
  marker: ISSUE_MARKER,
  allClear: 'Alle Office-Fähigkeiten sind wieder beschrieben — automatisch geschlossen.',
  regenerateCmd: 'pnpm --filter @gruenerator/documentation office:generate',
});
