import { describe, it, expect } from 'vitest';

import { RERANK_INSTRUCT_PRESETS, isRerankInstructPreset } from './rerankInstructs.js';

describe('RERANK_INSTRUCT_PRESETS', () => {
  it('has unique keys', () => {
    const keys = Object.keys(RERANK_INSTRUCT_PRESETS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('service sends no instruct', () => {
    expect(RERANK_INSTRUCT_PRESETS.service).toBeNull();
  });

  it('chat equals rerankNode.ts base + source hint, without the temporal hint', () => {
    expect(RERANK_INSTRUCT_PRESETS.chat).toBe(
      'Given a search query, retrieve relevant passages that answer the query.' +
        ' Prefer official party documents and verified sources over web snippets.'
    );
  });
});

describe('isRerankInstructPreset', () => {
  it('accepts every preset key', () => {
    for (const key of Object.keys(RERANK_INSTRUCT_PRESETS)) {
      expect(isRerankInstructPreset(key)).toBe(true);
    }
  });

  it('rejects an unknown value', () => {
    expect(isRerankInstructPreset('nope')).toBe(false);
  });
});
