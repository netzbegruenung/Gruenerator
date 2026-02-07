/**
 * Tests for TemporalAnalyzer
 * Run with: npx tsx apps/api/services/search/TemporalAnalyzer.test.ts
 */

import { analyzeTemporality } from './TemporalAnalyzer.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
  };
}

console.log('TemporalAnalyzer Tests');
console.log('======================');

// Immediate patterns
console.log('\nImmediate patterns:');

test('"heute" → immediate', () => {
  const result = analyzeTemporality('Was ist heute in der Politik passiert?');
  expect(result.hasTemporal).toBe(true);
  expect(result.urgency).toBe('immediate');
  expect(result.suggestedTimeRange).toBe('day');
});

test('"aktuell" → immediate', () => {
  const result = analyzeTemporality('Aktuelle Nachrichten zur Klimapolitik');
  expect(result.hasTemporal).toBe(true);
  expect(result.urgency).toBe('immediate');
});

test('"jetzt" → immediate', () => {
  const result = analyzeTemporality('Was passiert jetzt im Bundestag?');
  expect(result.hasTemporal).toBe(true);
  expect(result.urgency).toBe('immediate');
});

// Recent patterns
console.log('\nRecent patterns:');

test('"gestern" → recent', () => {
  const result = analyzeTemporality('Was war gestern im Bundestag?');
  expect(result.hasTemporal).toBe(true);
  expect(result.urgency).toBe('recent');
  expect(result.suggestedTimeRange).toBe('week');
});

test('"letzte Woche" → recent', () => {
  const result = analyzeTemporality('Neuigkeiten von letzter Woche');
  expect(result.hasTemporal).toBe(true);
  expect(result.urgency).toBe('recent');
});

test('"kürzlich" → recent', () => {
  const result = analyzeTemporality('Was wurde kürzlich beschlossen?');
  expect(result.hasTemporal).toBe(true);
  expect(result.urgency).toBe('recent');
});

// Current patterns
console.log('\nCurrent patterns:');

test('"diesen Monat" → current', () => {
  const result = analyzeTemporality('Was passiert diesen Monat?');
  expect(result.hasTemporal).toBe(true);
  expect(result.urgency).toBe('current');
  expect(result.suggestedTimeRange).toBe('month');
});

test('"Entwicklung" → current', () => {
  const result = analyzeTemporality('Entwicklung der Klimapolitik');
  expect(result.hasTemporal).toBe(true);
  expect(result.urgency).toBe('current');
});

test('"momentan" → current', () => {
  const result = analyzeTemporality('Wie sieht die Situation momentan aus?');
  expect(result.hasTemporal).toBe(true);
  expect(result.urgency).toBe('current');
});

// Dynamic year patterns
console.log('\nDynamic year patterns:');

test('Current year → current', () => {
  const currentYear = new Date().getFullYear();
  const result = analyzeTemporality(`Klimapolitik ${currentYear}`);
  expect(result.hasTemporal).toBe(true);
  expect(result.urgency).toBe('current');
});

test('Old year (2020) → no temporal', () => {
  const result = analyzeTemporality('Klimapolitik 2020');
  expect(result.hasTemporal).toBe(false);
  expect(result.urgency).toBe('none');
});

// No temporal
console.log('\nNo temporal:');

test('Policy question → no temporal', () => {
  const result = analyzeTemporality('Was ist die Position der Grünen zur Energiewende?');
  expect(result.hasTemporal).toBe(false);
  expect(result.urgency).toBe('none');
});

test('Greeting → no temporal', () => {
  const result = analyzeTemporality('Hallo, wie geht es dir?');
  expect(result.hasTemporal).toBe(false);
  expect(result.urgency).toBe('none');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
