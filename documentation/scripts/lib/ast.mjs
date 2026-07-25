/**
 * Shared AST helpers for the docs manifest generators.
 *
 * Every generator reads the app's own configs and schemas with the TypeScript
 * compiler API rather than importing them: those modules pull in react-icons,
 * zod and Vite's `import.meta.env`, none of which resolve under plain Node. We
 * only ever read literals, so the app is never executed.
 *
 * The older generators (generate-ui-labels, generate-chat-capabilities,
 * generate-settings) still carry their own copies of `parse`/`walk`/`unwrap`.
 * Migrating them onto this module is a deliberate follow-up: their `--check`
 * output is byte-compared in CI, so the refactor is safe but it does not belong
 * in a docs-content PR.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Repo root — this file lives at documentation/scripts/lib/. */
export const REPO_ROOT = path.resolve(HERE, '../../..');

/**
 * Throw with a message that says what moved and which generator to fix. These
 * fire when a source file changes shape — a loud, actionable failure is the
 * whole point, because the silent alternative is a manifest that quietly loses
 * entries and docs that quietly go wrong.
 */
export function fail(relFile, what, expected) {
  throw new Error(
    `${relFile}: could not read ${what} — expected ${expected}.\n` +
      `  The source moved or changed shape. Update the generator in documentation/scripts/.`
  );
}

export function parse(relFile) {
  const abs = path.join(REPO_ROOT, relFile);
  return ts.createSourceFile(
    abs,
    readFileSync(abs, 'utf-8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
}

export function walk(sf, fn) {
  const visit = (node) => {
    fn(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** Unwrap `x as const` / `x satisfies T` / parenthesised expressions. */
export function unwrap(node) {
  let cur = node;
  while (
    cur &&
    (ts.isAsExpression(cur) || ts.isSatisfiesExpression?.(cur) || ts.isParenthesizedExpression(cur))
  ) {
    cur = cur.expression;
  }
  return cur;
}

/** The initializer of `const <name> = …` anywhere in the file, unwrapped. */
export function findDeclaration(sf, name) {
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
  return unwrap(found);
}

export function stringProp(obj, name) {
  for (const p of obj.properties) {
    if (
      ts.isPropertyAssignment(p) &&
      p.name &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === name
    ) {
      const init = unwrap(p.initializer);
      if (init && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init))) {
        return init.text;
      }
    }
  }
  return undefined;
}

/** Property name of an object-literal member, whatever its syntax. */
function propName(p) {
  if (!p.name) return null;
  return ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
}

/** `{ a: <expr>, b: <expr> }` → Map<name, unwrapped initializer>. */
export function objectEntries(obj) {
  const out = new Map();
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const key = propName(p);
    if (key) out.set(key, unwrap(p.initializer));
  }
  return out;
}

/** The text of a string-literal node, or undefined if it isn't one. */
export function literalText(node) {
  const n = unwrap(node);
  return n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined;
}

/** The string elements of an array-literal node. */
export function arrayStrings(node) {
  if (!node || !ts.isArrayLiteralExpression(node)) return [];
  return node.elements.map(literalText).filter((t) => t !== undefined);
}

/** `const NAME = ['a', 'b'] as const` → ['a', 'b']. */
export function constStringArray(sf, name) {
  return arrayStrings(findDeclaration(sf, name));
}

/**
 * The first line of a node's leading JSDoc, whitespace-collapsed. Used as a
 * hint for whoever has to write the German prose for a new entry — it is not
 * rendered to readers, who get the hand-written note instead.
 */
export function jsDocSummary(node) {
  const docs = node.jsDoc;
  if (!Array.isArray(docs) || docs.length === 0) return undefined;
  const comment = docs[docs.length - 1].comment;
  const text =
    typeof comment === 'string'
      ? comment
      : Array.isArray(comment)
        ? comment.map((c) => c.text ?? '').join('')
        : '';
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) return undefined;
  // First sentence only. Requiring a capital after the period keeps "e.g. "A1:D5""
  // and similar abbreviations from being mistaken for a sentence end.
  const firstSentence = collapsed.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/)[0];
  return firstSentence.length > 240 ? `${firstSentence.slice(0, 237).trimEnd()}…` : firstSentence;
}

/** Is this the call `z.<name>(…)`? */
function isZodCall(node, name) {
  return (
    node &&
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === name
  );
}

/**
 * Walk a `.nullish()` / `.optional()` / `.min()` chain down to its base call and
 * report whether the field may be omitted.
 */
function chainInfo(node) {
  let cur = unwrap(node);
  let optional = false;
  while (cur && ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
    const target = unwrap(cur.expression.expression);
    // `z.literal(...)` / `z.enum(...)` is the base of the chain, not another
    // link in it — stop before unwrapping it down to the bare `z`.
    if (target && ts.isIdentifier(target) && target.text === 'z') break;
    const method = cur.expression.name.text;
    if (method === 'nullish' || method === 'optional' || method === 'nullable') optional = true;
    cur = target;
  }
  return { optional, base: cur };
}

/** `z.enum(['a','b'])` declared as `const <name> = …` → the members. */
export function zodEnum(sf, name, relFile) {
  const decl = findDeclaration(sf, name);
  if (!isZodCall(decl, 'enum')) fail(relFile, name, 'z.enum([...])');
  const members = arrayStrings(unwrap(decl.arguments[0]));
  if (members.length === 0) fail(relFile, name, 'a non-empty z.enum([...])');
  return members;
}

/**
 * An inline `z.enum([...])` on a property of `const <declName> = z.object({…})`.
 * Several closed sets (share mode, share permission) only exist as inline enums
 * on a request/response schema — there is no standalone constant to point at.
 */
export function zodEnumProp(sf, declName, propertyName, relFile) {
  const decl = findDeclaration(sf, declName);
  if (!isZodCall(decl, 'object')) fail(relFile, declName, 'z.object({...})');
  const shape = unwrap(decl.arguments[0]);
  if (!shape || !ts.isObjectLiteralExpression(shape))
    fail(relFile, declName, 'an object literal shape');
  for (const p of shape.properties) {
    if (!ts.isPropertyAssignment(p) || propName(p) !== propertyName) continue;
    const { base } = chainInfo(p.initializer);
    if (isZodCall(base, 'enum')) return arrayStrings(unwrap(base.arguments[0]));
  }
  return fail(relFile, `${declName}.${propertyName}`, 'a z.enum([...]) property');
}

/**
 * `z.discriminatedUnion('type', [z.object({...}), …])` → one entry per member:
 * its discriminator value, its JSDoc summary, and its field names (with which
 * ones are optional). Nested unions inside a field (e.g. a `rule` with several
 * `kind`s) are flattened into `variants` so the docs can name them.
 */
export function zodDiscriminatedUnion(sf, name, relFile) {
  const decl = findDeclaration(sf, name);
  if (!isZodCall(decl, 'discriminatedUnion')) {
    fail(relFile, name, "z.discriminatedUnion('<key>', [...])");
  }
  const discriminator = literalText(decl.arguments[0]);
  if (!discriminator) fail(relFile, name, 'a string literal as the discriminator key');
  const membersNode = unwrap(decl.arguments[1]);
  if (!membersNode || !ts.isArrayLiteralExpression(membersNode)) {
    fail(relFile, name, 'an array literal of z.object(...) members');
  }

  const members = [];
  for (const el of membersNode.elements) {
    const member = unwrap(el);
    if (!isZodCall(member, 'object')) continue;
    const shape = unwrap(member.arguments[0]);
    if (!shape || !ts.isObjectLiteralExpression(shape)) continue;

    let id;
    const fields = [];
    const variants = [];
    for (const p of shape.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const key = propName(p);
      if (!key) continue;
      const { optional, base } = chainInfo(p.initializer);

      if (key === discriminator && isZodCall(base, 'literal')) {
        id = literalText(base.arguments[0]);
        continue;
      }
      // A nested discriminated union (sheets' conditional-format / validation
      // `rule`) — its kinds are user-visible, so surface them.
      if (isZodCall(base, 'discriminatedUnion')) {
        const inner = unwrap(base.arguments[1]);
        if (inner && ts.isArrayLiteralExpression(inner)) {
          for (const innerEl of inner.elements) {
            const innerMember = unwrap(innerEl);
            if (!isZodCall(innerMember, 'object')) continue;
            const innerShape = unwrap(innerMember.arguments[0]);
            if (!innerShape || !ts.isObjectLiteralExpression(innerShape)) continue;
            const kind = stringProp(innerShape, 'kind') ?? readLiteralProp(innerShape, 'kind');
            if (kind) variants.push(kind);
          }
        }
      }
      fields.push({ name: key, optional, doc: jsDocSummary(p) });
    }

    if (!id) continue;
    const entry = { id, fields };
    const doc = jsDocSummary(el) ?? jsDocSummary(member);
    if (doc) entry.doc = doc;
    if (variants.length > 0) entry.variants = variants;
    members.push(entry);
  }

  if (members.length === 0)
    fail(relFile, name, 'at least one z.object member with a discriminator');
  return members;
}

/** `{ kind: z.literal('list') }` → 'list'. */
function readLiteralProp(obj, name) {
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p) || propName(p) !== name) continue;
    const { base } = chainInfo(p.initializer);
    if (isZodCall(base, 'literal')) return literalText(base.arguments[0]);
  }
  return undefined;
}

/** The numeric argument of a `.max(n)` anywhere in `const <name> = …`. */
export function zodArrayMax(sf, name) {
  const decl = findDeclaration(sf, name);
  let cur = decl;
  while (cur && ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
    if (cur.expression.name.text === 'max') {
      const arg = unwrap(cur.arguments[0]);
      if (arg && ts.isNumericLiteral(arg)) return Number(arg.text);
    }
    cur = unwrap(cur.expression.expression);
  }
  return undefined;
}

export function sortKeys(obj) {
  const sorted = {};
  for (const key of Object.keys(obj).sort()) sorted[key] = obj[key];
  return sorted;
}

export { ts };
