import { describe, expect, it } from 'vitest';

import { applyOperation } from './applyOperation';

import type { TemplateAiCapabilities } from '@ggraphic/editor/ai/types';

type HostOp = { kind: 'set-text'; field: string; label: string; value: string } | HostOnly;
type HostOnly = { kind: 'host-only'; on: boolean };

const describeForAi = () => ({ template: 't', textFields: [], elementsSummary: [] });

describe('applyOperation over a host-composed union', () => {
  it('fails a host kind without an override with the override reason', () => {
    const caps: TemplateAiCapabilities<object, object, HostOp, unknown> = {
      supportedOperations: ['host-only'],
      describeForAi,
    };
    expect(applyOperation({ kind: 'host-only', on: true }, {}, () => ({}), caps)).toEqual({
      ok: false,
      reason: 'host-only requires a template applyOverride',
    });
  });

  it('routes a host kind to its override', () => {
    const seen: HostOnly[] = [];
    const caps: TemplateAiCapabilities<object, object, HostOp, unknown> = {
      supportedOperations: ['host-only'],
      describeForAi,
      applyOverrides: { 'host-only': (op) => void seen.push(op) },
    };
    expect(applyOperation({ kind: 'host-only', on: false }, {}, () => ({}), caps)).toEqual({
      ok: true,
    });
    expect(seen).toEqual([{ kind: 'host-only', on: false }]);
  });

  it('keeps the core default path for core kinds', () => {
    const caps: TemplateAiCapabilities<object, object, HostOp, unknown> = {
      supportedOperations: ['set-text'],
      describeForAi,
    };
    expect(
      applyOperation(
        { kind: 'set-text', field: 'nope', label: 'Nope', value: 'x' },
        {},
        () => ({}),
        caps
      )
    ).toEqual({ ok: false, reason: 'no setter for text field "nope" in this template' });
  });
});
