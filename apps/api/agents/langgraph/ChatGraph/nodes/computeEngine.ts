/**
 * Compute Engine
 *
 * Pure, deterministic calculators for the `compute` intent. This module NEVER
 * calls an LLM — its whole reason to exist is that language models cannot count
 * characters or do reliable arithmetic (they operate on tokens, not glyphs).
 * The LLM's only job (in computeNode) is to parse a request into a structured
 * plan; every number returned here is computed by real JS.
 *
 * All functions are total: on malformed input they return `null` so the caller
 * can degrade gracefully rather than surface a wrong number.
 */

import type { ComputePayload, ComputeEntry } from '@gruenerator/contracts';

export type ComputeResult = ComputePayload;

const nfInt = new Intl.NumberFormat('de-DE');
const nfDecimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/**
 * German-formatted number: integers stay exact, everything else rounds to at
 * most 2 decimals (e.g. 1234.5 → "1.234,5") — 6 fraction digits like
 * `33,333333` reads as false precision next to an "exakt berechnet" badge.
 * Below 0.01 a flat 2-decimal round would erase the value to "0,00", so a
 * significance rule takes over instead: keep 3 significant digits regardless
 * of magnitude, so e.g. 0.0001234 stays visible as "0,000123".
 */
function fmt(n: number): string {
  if (Number.isInteger(n)) return nfInt.format(n);
  const abs = Math.abs(n);
  if (abs > 0 && abs < 0.01) return formatSignificant(n);
  return nfDecimal.format(Math.round(n * 100) / 100);
}

function formatSignificant(n: number): string {
  const exponent = Math.floor(Math.log10(Math.abs(n)));
  const decimals = -exponent + 2; // 3 significant digits
  const fixed = n
    .toFixed(decimals)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return fixed.replace('.', ',');
}

// ── Text metrics ────────────────────────────────────────────────────────────

/**
 * Count the objective, unambiguous properties of a text. "Words" is the one
 * metric without a single definition, so it is explicitly labelled as
 * whitespace-separated — the convention a reader can reproduce by hand.
 */
export function computeTextMetrics(text: string): ComputeResult {
  const charsWithSpaces = [...text].length; // spread → count code points, not UTF-16 units
  const withoutLineBreaks = [...text.replace(/\r?\n/g, '')].length;
  const withoutWhitespace = [...text.replace(/\s/g, '')].length;
  const words = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  const lines = text.length === 0 ? 0 : text.split(/\r?\n/).length;
  const sentences = (text.match(/[.!?]+(\s|$)/g) || []).length;
  const vowels = (text.match(/[aeiouäöüAEIOUÄÖÜ]/g) || []).length;

  const entries: ComputeEntry[] = [
    { label: 'Zeichen (inkl. Leerzeichen)', value: fmt(charsWithSpaces) },
    { label: 'Zeichen (ohne Zeilenumbrüche)', value: fmt(withoutLineBreaks) },
    { label: 'Zeichen (ohne Leerzeichen)', value: fmt(withoutWhitespace) },
    { label: 'Wörter (durch Leerzeichen getrennt)', value: fmt(words) },
    { label: 'Zeilen', value: fmt(lines) },
    { label: 'Sätze', value: fmt(sentences) },
    { label: 'Vokale', value: fmt(vowels) },
  ];

  return {
    operation: 'Text analysieren',
    entries,
    summary: `${fmt(charsWithSpaces)} Zeichen (inkl. Leerzeichen), ${fmt(words)} Wörter, ${fmt(lines)} Zeilen.`,
  };
}

// ── Arithmetic ────────────────────────────────────────────────────────────────

/**
 * Safe arithmetic evaluator — a hand-rolled recursive-descent parser over a
 * fixed grammar (+ - * / % ^, parentheses, unary sign, decimals). No `eval`,
 * no dependency, no way to execute arbitrary code: any token outside the
 * grammar makes the whole parse fail and return `null`. Expects `.` as the
 * decimal separator (computeNode has the LLM normalise before calling).
 */
export function evaluateArithmetic(expression: string): number | null {
  const tokens = tokenizeArithmetic(expression);
  if (!tokens) return null;
  let pos = 0;

  const peek = (): string | undefined => tokens[pos];
  const next = (): string | undefined => tokens[pos++];

  function parseExpression(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parseUnary();
    if (left === null) return null;
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const right = parseUnary();
      if (right === null) return null;
      if (op === '*') left = left * right;
      else if (op === '/') {
        if (right === 0) return null; // division by zero → not a number we should report
        left = left / right;
      } else left = left % right;
    }
    return left;
  }

  function parseUnary(): number | null {
    if (peek() === '-') {
      next();
      const v = parseUnary();
      return v === null ? null : -v;
    }
    if (peek() === '+') {
      next();
      return parseUnary();
    }
    return parsePower();
  }

  function parsePower(): number | null {
    const base = parsePrimary();
    if (base === null) return null;
    if (peek() === '^') {
      next();
      const exp = parseUnary(); // right-associative, allow -exp
      if (exp === null) return null;
      return Math.pow(base, exp);
    }
    return base;
  }

  function parsePrimary(): number | null {
    const t = peek();
    if (t === '(') {
      next();
      const v = parseExpression();
      if (v === null || next() !== ')') return null;
      return v;
    }
    if (t !== undefined && /^[0-9.]+$/.test(t)) {
      next();
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  const result = parseExpression();
  if (result === null || pos !== tokens.length || !Number.isFinite(result)) return null;
  return result;
}

/** Split an arithmetic string into number/operator tokens; `null` on any stray char. */
function tokenizeArithmetic(expr: string): string[] | null {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if ('+-*/%^()'.includes(c)) {
      tokens.push(c);
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) num += expr[i++];
      if ((num.match(/\./g) || []).length > 1) return null; // "1.2.3"
      tokens.push(num);
      continue;
    }
    return null; // stray character → refuse to evaluate
  }
  return tokens.length > 0 ? tokens : null;
}

export function computeArithmetic(expression: string, label?: string): ComputeResult | null {
  const value = evaluateArithmetic(expression);
  if (value === null) return null;
  const shown = fmt(value);
  return {
    operation: label || 'Berechnung',
    entries: [{ label: label || 'Ergebnis', value: shown }],
    summary: `${expression.trim()} = ${shown}`,
  };
}

/** One arithmetic claim to check: what to compute, and what the material says it is. */
export interface ArithmeticCheck {
  label: string | null;
  expression: string;
  /** The figure the material asserts. `null` = "just compute", no claim to test. */
  claimed: number | null;
}

/** Two figures agree if they match to the cent — material writes "42.000", not
 *  "42000.0000001", and a float artefact is not a discrepancy. */
function agrees(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/**
 * Several arithmetic claims at once, each optionally checked against what the
 * material asserts.
 *
 * One expression per turn was the whole gap. Live on 02.08.2026 the request was
 * "prüfe diese Angaben auf Widersprüche": the plan extracted exactly one
 * expression (`0.35 * 120000`), and the rest of the answer's arithmetic —
 * including `42.000 + 84.000 = 120.000` and `74 − 62 = 8` — was written
 * free-hand by the responder and confirmed as correct. The deterministic engine
 * was right about the one thing it was asked and silent about everything else,
 * which from the outside is indistinguishable from having checked it all.
 *
 * The verdict rides inside the entry's `value` string on purpose: the wire shape
 * is `{label, value}` and the card renders both verbatim, so a claim and its
 * verdict cannot come apart anywhere downstream.
 */
export function computeArithmeticBatch(checks: readonly ArithmeticCheck[]): ComputeResult | null {
  const entries: ComputeEntry[] = [];
  let wrong = 0;
  let checked = 0;

  for (const check of checks) {
    const value = evaluateArithmetic(check.expression);
    // An unparseable expression is dropped, never guessed: a missing row is
    // visibly incomplete, a fabricated one is not.
    if (value === null) continue;
    const shown = fmt(value);
    const label = check.label?.trim() || check.expression.trim();
    if (check.claimed === null) {
      entries.push({ label, value: shown });
      continue;
    }
    checked++;
    const ok = agrees(value, check.claimed);
    if (!ok) wrong++;
    entries.push({
      label,
      value: ok ? `${shown} — stimmt` : `${shown} — FALSCH, im Text steht ${fmt(check.claimed)}`,
    });
  }

  if (entries.length === 0) return null;

  const summary =
    checked === 0
      ? entries.map((e) => `${e.label} = ${e.value}`).join('; ')
      : wrong === 0
        ? `${checked} geprüfte Angabe${checked === 1 ? '' : 'n'} stimmt${checked === 1 ? '' : 'en'}.`
        : `${wrong} von ${checked} geprüften Angaben ${wrong === 1 ? 'ist' : 'sind'} falsch.`;

  return { operation: checks.length > 1 ? 'Angaben prüfen' : 'Berechnung', entries, summary };
}

// ── Unit conversion ───────────────────────────────────────────────────────────

/**
 * Conversion factors to a canonical base unit per dimension. The factor IS the
 * fact that must not be hallucinated, so it lives here (not in the LLM plan).
 * Temperature is handled separately (affine, not multiplicative).
 */
const UNIT_FACTORS: Record<string, { dim: string; toBase: number; label: string }> = {
  // length → metre
  mm: { dim: 'length', toBase: 0.001, label: 'mm' },
  cm: { dim: 'length', toBase: 0.01, label: 'cm' },
  m: { dim: 'length', toBase: 1, label: 'm' },
  km: { dim: 'length', toBase: 1000, label: 'km' },
  in: { dim: 'length', toBase: 0.0254, label: 'in' },
  ft: { dim: 'length', toBase: 0.3048, label: 'ft' },
  yd: { dim: 'length', toBase: 0.9144, label: 'yd' },
  mi: { dim: 'length', toBase: 1609.344, label: 'mi' },
  // mass → gram
  mg: { dim: 'mass', toBase: 0.001, label: 'mg' },
  g: { dim: 'mass', toBase: 1, label: 'g' },
  kg: { dim: 'mass', toBase: 1000, label: 'kg' },
  t: { dim: 'mass', toBase: 1_000_000, label: 't' },
  lb: { dim: 'mass', toBase: 453.59237, label: 'lb' },
  oz: { dim: 'mass', toBase: 28.349523125, label: 'oz' },
  // time → second
  s: { dim: 'time', toBase: 1, label: 's' },
  min: { dim: 'time', toBase: 60, label: 'min' },
  h: { dim: 'time', toBase: 3600, label: 'h' },
  d: { dim: 'time', toBase: 86400, label: 'd' },
  // data → byte
  b: { dim: 'data', toBase: 1, label: 'B' },
  kb: { dim: 'data', toBase: 1000, label: 'KB' },
  mb: { dim: 'data', toBase: 1_000_000, label: 'MB' },
  gb: { dim: 'data', toBase: 1_000_000_000, label: 'GB' },
  tb: { dim: 'data', toBase: 1_000_000_000_000, label: 'TB' },
};

function normalizeUnit(u: string): string {
  return u.trim().toLowerCase().replace(/s$/, '');
}

export function computeUnitConvert(
  value: number,
  fromUnit: string,
  toUnit: string
): ComputeResult | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  // Temperature: affine conversions, handled explicitly.
  const temp = convertTemperature(value, from, to);
  if (temp !== null) {
    const shown = fmt(temp);
    return {
      operation: 'Einheit umrechnen',
      entries: [{ label: `${fmt(value)} ${fromUnit} entsprechen`, value: `${shown} ${toUnit}` }],
      summary: `${fmt(value)} ${fromUnit} = ${shown} ${toUnit}`,
    };
  }

  const f = UNIT_FACTORS[from];
  const t = UNIT_FACTORS[to];
  if (!f || !t || f.dim !== t.dim) return null;

  const result = (value * f.toBase) / t.toBase;
  const shown = fmt(result);
  return {
    operation: 'Einheit umrechnen',
    entries: [{ label: `${fmt(value)} ${f.label} entsprechen`, value: `${shown} ${t.label}` }],
    summary: `${fmt(value)} ${f.label} = ${shown} ${t.label}`,
  };
}

function convertTemperature(value: number, from: string, to: string): number | null {
  const temps = ['c', 'f', 'k', '°c', '°f'];
  const norm = (u: string): 'c' | 'f' | 'k' | null =>
    u === 'c' || u === '°c' || u === 'celsius'
      ? 'c'
      : u === 'f' || u === '°f' || u === 'fahrenheit'
        ? 'f'
        : u === 'k' || u === 'kelvin'
          ? 'k'
          : null;
  if (!temps.includes(from) && norm(from) === null) return null;
  const a = norm(from);
  const b = norm(to);
  if (a === null || b === null) return null;
  // to Celsius
  const celsius = a === 'c' ? value : a === 'f' ? ((value - 32) * 5) / 9 : value - 273.15;
  // from Celsius
  return b === 'c' ? celsius : b === 'f' ? (celsius * 9) / 5 + 32 : celsius + 273.15;
}

// ── Date math ─────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

function parseISODate(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  const back = new Date(utc);
  // Reject overflow like 2026-02-31 rolling into March.
  if (back.getUTCMonth() !== Number(mo) - 1 || back.getUTCDate() !== Number(d)) return null;
  return utc;
}

function formatGermanISO(utcMs: number): string {
  const d = new Date(utcMs);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

export function computeDateDiff(fromISO: string, toISO: string): ComputeResult | null {
  const from = parseISODate(fromISO);
  const to = parseISODate(toISO);
  if (from === null || to === null) return null;
  const days = Math.round((to - from) / MS_PER_DAY);
  const abs = Math.abs(days);
  return {
    operation: 'Datumsdifferenz',
    entries: [
      { label: 'Von', value: formatGermanISO(from) },
      { label: 'Bis', value: formatGermanISO(to) },
      { label: 'Differenz', value: `${fmt(abs)} Tage` },
      { label: 'Wochen', value: fmt(Math.round((abs / 7) * 10) / 10) },
    ],
    summary: `${formatGermanISO(from)} bis ${formatGermanISO(to)} sind ${fmt(abs)} Tage.`,
  };
}

export function computeDateAdd(
  baseISO: string,
  amount: number,
  unit: 'days' | 'weeks' | 'months' | 'years'
): ComputeResult | null {
  const base = parseISODate(baseISO);
  if (base === null || !Number.isFinite(amount)) return null;
  const d = new Date(base);
  if (unit === 'days') d.setUTCDate(d.getUTCDate() + amount);
  else if (unit === 'weeks') d.setUTCDate(d.getUTCDate() + amount * 7);
  else if (unit === 'months') d.setUTCMonth(d.getUTCMonth() + amount);
  else d.setUTCFullYear(d.getUTCFullYear() + amount);

  const unitDe = { days: 'Tage', weeks: 'Wochen', months: 'Monate', years: 'Jahre' }[unit];
  const result = d.getTime();
  return {
    operation: 'Datum berechnen',
    entries: [
      { label: 'Ausgangsdatum', value: formatGermanISO(base) },
      { label: `${fmt(amount)} ${unitDe}`, value: amount >= 0 ? 'hinzugefügt' : 'abgezogen' },
      { label: 'Ergebnis', value: formatGermanISO(result) },
    ],
    summary: `${formatGermanISO(base)} ${amount >= 0 ? '+' : '−'} ${fmt(Math.abs(amount))} ${unitDe} = ${formatGermanISO(result)}.`,
  };
}
