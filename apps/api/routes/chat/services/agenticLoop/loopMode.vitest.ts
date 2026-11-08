import { describe, it, expect } from 'vitest';

import { resolveLoopMode } from './loopMode.js';

const MISTRAL = { provider: 'mistral', modelName: 'mistral-large-4' };
const CLEAN = { materialHeavy: false, carriesGuarantee: false };

describe('resolveLoopMode', () => {
  it.each([
    ['clean Mistral turn', MISTRAL, CLEAN, 'unified', 'unified_model'],
    ['material-heavy turn', MISTRAL, { ...CLEAN, materialHeavy: true }, 'split', 'material_heavy'],
    ['guarantee turn', MISTRAL, { ...CLEAN, carriesGuarantee: true }, 'split', 'guarantee'],
    [
      'melious gemma 31b is unified',
      { provider: 'melious', modelName: 'gemma-4-31b:balanced' },
      CLEAN,
      'unified',
      'unified_model',
    ],
    [
      'melious gemma 31b with a guarantee',
      { provider: 'melious', modelName: 'gemma-4-31b:balanced' },
      { ...CLEAN, carriesGuarantee: true },
      'split',
      'guarantee',
    ],
    [
      'non-unified model',
      { provider: 'cortecs', modelName: 'gemma-4-31b-it' },
      CLEAN,
      'split',
      'not_unified_model',
    ],
  ] as const)('%s', (_name, lane, flags, mode, reason) => {
    expect(resolveLoopMode({ ...lane, ...flags })).toEqual({ mode, reason });
  });
});
