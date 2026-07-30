import { describe, expect, it } from 'vitest';

import { buildAiTelemetry, maskSensitive } from './langfuseTelemetry.js';

describe('maskSensitive', () => {
  it('redacts email addresses', () => {
    expect(maskSensitive('Schreib an max.mustermann+kv@gruene.de bitte')).toBe(
      'Schreib an [email] bitte'
    );
  });

  it('redacts IBANs', () => {
    expect(maskSensitive('IBAN DE02120300000000202051 überweisen')).toBe('IBAN [iban] überweisen');
  });

  it('redacts international and national phone numbers', () => {
    expect(maskSensitive('Ruf +49 30 227 12345 an')).toBe('Ruf [phone] an');
    expect(maskSensitive('Ruf 030 227 12345 an')).toBe('Ruf [phone] an');
  });

  // The corpus is full of years, shares and paragraph numbers — a greedy phone
  // pattern would eat them and make traces useless.
  it('leaves years, percentages and paragraph numbers alone', () => {
    const text = 'Bis 2030 auf 1,5 Grad, siehe § 218 und Drucksache 20/1234.';
    expect(maskSensitive(text)).toBe(text);
  });

  it('walks arrays and nested objects, leaving keys untouched', () => {
    expect(maskSensitive({ 'contact@example.org': ['ping a@b.de', { note: 'ok' }] })).toEqual({
      'contact@example.org': ['ping [email]', { note: 'ok' }],
    });
  });

  it('passes non-string primitives through unchanged', () => {
    expect(maskSensitive(42)).toBe(42);
    expect(maskSensitive(null)).toBeNull();
    expect(maskSensitive(true)).toBe(true);
  });
});

describe('buildAiTelemetry', () => {
  // No LANGFUSE_* in the test env, so initLangfuseTelemetry never armed the
  // integration. Every call site relies on this returning undefined — that is
  // what keeps an unconfigured environment from emitting spans at all.
  it('returns undefined when telemetry was never initialised', () => {
    expect(buildAiTelemetry('chat-graph.respond')).toBeUndefined();
  });
});
