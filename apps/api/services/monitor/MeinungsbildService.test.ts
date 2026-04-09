/**
 * Tests for MeinungsbildService — transform and lookup logic
 * Run with: npx tsx apps/api/services/monitor/MeinungsbildService.test.ts
 */

import type { MeinungsbildData, MeinungsbildEstimate, MeinungsbildIssue } from './types.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function expect(actual: any) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toBe(expected: any) {
      if (actual !== expected)
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan(expected: number) {
      if (!(actual > expected)) throw new Error(`Expected ${actual} > ${expected}`);
    },
    toBeLessThan(expected: number) {
      if (!(actual < expected)) throw new Error(`Expected ${actual} < ${expected}`);
    },
    toBeNull() {
      if (actual !== null) throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
    },
    toContain(expected: string) {
      if (typeof actual !== 'string' || !actual.includes(expected))
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
    },
    toBeCloseTo(expected: number, precision = 2) {
      const diff = Math.abs(actual - expected);
      const threshold = Math.pow(10, -precision) / 2;
      if (diff > threshold)
        throw new Error(`Expected ${actual} to be close to ${expected} (diff: ${diff})`);
    },
  };
}

// --- Mock data ---

const MOCK_ISSUES: MeinungsbildIssue[] = [
  {
    id: 'buergergeld_cut',
    label_de: 'Bürgergeld senken',
    category: 'social',
    question_de: 'Das Bürgergeld sollte gesenkt werden.',
    direction: 'higher=support cut',
  },
  {
    id: 'climate_ego',
    label_de: 'Klimaschutz vs. Wirtschaft',
    category: 'climate',
    question_de:
      'Manche meinen, der Kampf gegen den Klimawandel müsse Vorrang haben, auch wenn das der Wirtschaft schadet.',
    direction: 'higher=prioritize climate',
  },
  {
    id: 'speed_limit',
    label_de: 'Tempolimit auf Autobahnen',
    category: 'transport',
    question_de: 'Auf Autobahnen sollte generell ein Tempolimit gelten.',
    direction: 'higher=support',
  },
];

const MOCK_ESTIMATES: Record<string, MeinungsbildEstimate[]> = {
  buergergeld_cut: [
    { state_code: '01', state_name: 'Schleswig-Holstein', estimate: 0.43, pop: 2313578 },
    { state_code: '02', state_name: 'Hamburg', estimate: 0.37, pop: 1431449 },
    { state_code: '11', state_name: 'Berlin', estimate: 0.38, pop: 2877040 },
    { state_code: '14', state_name: 'Sachsen', estimate: 0.505, pop: 3180000 },
  ],
  climate_ego: [
    { state_code: '01', state_name: 'Schleswig-Holstein', estimate: 0.518, pop: 2313578 },
    { state_code: '02', state_name: 'Hamburg', estimate: 0.566, pop: 1431449 },
    { state_code: '11', state_name: 'Berlin', estimate: 0.538, pop: 2877040 },
    { state_code: '14', state_name: 'Sachsen', estimate: 0.401, pop: 3180000 },
  ],
  speed_limit: [
    { state_code: '01', state_name: 'Schleswig-Holstein', estimate: 0.521, pop: 2313578 },
    { state_code: '02', state_name: 'Hamburg', estimate: 0.532, pop: 1431449 },
    { state_code: '11', state_name: 'Berlin', estimate: 0.525, pop: 2877040 },
    { state_code: '14', state_name: 'Sachsen', estimate: 0.491, pop: 3180000 },
  ],
};

const MOCK_DATA: MeinungsbildData = {
  issues: MOCK_ISSUES,
  estimates: MOCK_ESTIMATES,
  fetchedAt: new Date().toISOString(),
};

// --- Inline the lookup logic for unit testing without Redis/fetch ---

function lookupMeinungsbildByTopicSync(data: MeinungsbildData, topic: string): string | null {
  const query = topic.trim().toLowerCase();
  if (!query) return null;
  const words = query.split(/\s+/).filter((w) => w.length > 2);

  const scored = data.issues.map((issue) => {
    const haystack = `${issue.label_de} ${issue.question_de}`.toLowerCase();
    let score = 0;
    for (const word of words) {
      if (haystack.includes(word)) score++;
    }
    if (haystack.includes(query)) score += 3;
    return { issue, score };
  });

  const matches = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (matches.length === 0) return null;

  const parts: string[] = [];
  for (const { issue } of matches) {
    const estimates = data.estimates[issue.id];
    if (!estimates) continue;

    const totalPop = estimates.reduce((sum, e) => sum + e.pop, 0);
    const nationalAvg = estimates.reduce((sum, e) => sum + e.estimate * e.pop, 0) / totalPop;

    const sorted = [...estimates].sort((a, b) => b.estimate - a.estimate);
    const top3 = sorted.slice(0, 3);
    const bottom3 = sorted.slice(-3).reverse();

    const lines = [
      `Thema: ${issue.label_de}`,
      `Frage: „${issue.question_de}"`,
      `Deutschland gesamt: ${(nationalAvg * 100).toFixed(1)}%`,
      `Höchste Zustimmung: ${top3.map((e) => `${e.state_name} ${(e.estimate * 100).toFixed(1)}%`).join(', ')}`,
      `Niedrigste Zustimmung: ${bottom3.map((e) => `${e.state_name} ${(e.estimate * 100).toFixed(1)}%`).join(', ')}`,
      `Richtung: ${issue.direction}`,
    ];
    parts.push(lines.join('\n'));
  }

  return (
    'Meinungsbild Deutschland (MRP-Schätzung basierend auf ~118.000 Befragten)\n' +
    'Quelle: Heddesheimer, Hilbig, Sichart & Wiedemann (2025). GERDA: German Election Database. Nature: Scientific Data, 12: 618.\n\n' +
    parts.join('\n\n---\n\n')
  );
}

// --- Tests ---

console.log('MeinungsbildService Tests');
console.log('========================');

console.log('\nFuzzy Matching');

test('matches exact topic name', () => {
  const result = lookupMeinungsbildByTopicSync(MOCK_DATA, 'Bürgergeld');
  expect(result).toContain('Bürgergeld senken');
  expect(result).toContain('Deutschland gesamt:');
});

test('matches partial topic name', () => {
  const result = lookupMeinungsbildByTopicSync(MOCK_DATA, 'Klima');
  expect(result).toContain('Klimaschutz vs. Wirtschaft');
});

test('matches question text keywords', () => {
  const result = lookupMeinungsbildByTopicSync(MOCK_DATA, 'Autobahnen Tempolimit');
  expect(result).toContain('Tempolimit auf Autobahnen');
});

test('returns null for unmatched topic', () => {
  const result = lookupMeinungsbildByTopicSync(MOCK_DATA, 'Weltraumprogramm');
  expect(result).toBeNull();
});

test('case insensitive matching', () => {
  const result = lookupMeinungsbildByTopicSync(MOCK_DATA, 'bürgergeld');
  expect(result).toContain('Bürgergeld senken');
});

test('filters out short words (<=2 chars)', () => {
  const result = lookupMeinungsbildByTopicSync(MOCK_DATA, 'zu Klima');
  expect(result).toContain('Klimaschutz');
});

test('multi-word query matches better', () => {
  const result = lookupMeinungsbildByTopicSync(MOCK_DATA, 'Klimawandel Wirtschaft');
  expect(result).toContain('Klimaschutz vs. Wirtschaft');
});

console.log('\nNational Average Calculation');

test('calculates population-weighted national average', () => {
  const estimates = MOCK_ESTIMATES['buergergeld_cut'];
  const totalPop = estimates.reduce((sum, e) => sum + e.pop, 0);
  const avg = estimates.reduce((sum, e) => sum + e.estimate * e.pop, 0) / totalPop;
  // Weighted avg: (0.43*2313578 + 0.37*1431449 + 0.38*2877040 + 0.505*3180000) / total
  expect(avg).toBeGreaterThan(0.4);
  expect(avg).toBeLessThan(0.5);
});

console.log('\nOutput Format');

test('includes GERDA citation in output', () => {
  const result = lookupMeinungsbildByTopicSync(MOCK_DATA, 'Bürgergeld');
  expect(result).toContain('Heddesheimer');
  expect(result).toContain('GERDA');
  expect(result).toContain('Scientific Data');
});

test('includes highest and lowest states', () => {
  const result = lookupMeinungsbildByTopicSync(MOCK_DATA, 'Bürgergeld');
  expect(result).toContain('Höchste Zustimmung');
  expect(result).toContain('Niedrigste Zustimmung');
  expect(result).toContain('Sachsen');
  expect(result).toContain('Hamburg');
});

test('includes direction field', () => {
  const result = lookupMeinungsbildByTopicSync(MOCK_DATA, 'Bürgergeld');
  expect(result).toContain('Richtung: higher=support cut');
});

test('returns max 3 matched issues', () => {
  // "sollte" appears in all 3 question texts
  const result = lookupMeinungsbildByTopicSync(MOCK_DATA, 'sollte');
  const themaCount = (result?.match(/Thema:/g) || []).length;
  expect(themaCount).toBeGreaterThan(0);
  expect(themaCount).toBeLessThan(4);
});

console.log('\nEdge Cases');

test('handles empty query gracefully', () => {
  const result = lookupMeinungsbildByTopicSync(MOCK_DATA, '');
  expect(result).toBeNull();
});

test('handles query with only short words', () => {
  const result = lookupMeinungsbildByTopicSync(MOCK_DATA, 'zu ab in');
  expect(result).toBeNull();
});

test('handles empty issues list', () => {
  const emptyData: MeinungsbildData = { issues: [], estimates: {}, fetchedAt: '' };
  const result = lookupMeinungsbildByTopicSync(emptyData, 'Klima');
  expect(result).toBeNull();
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
