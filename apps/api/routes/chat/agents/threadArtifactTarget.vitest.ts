import { describe, expect, it } from 'vitest';

import { resolveThreadArtifactId, threadHasArtifact } from './threadArtifactTarget.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const state = (over: Record<string, unknown>) => over as unknown as ChatGraphState;
const artifacts = state({
  threadArtifacts: [
    { kind: 'presentation', ref: 'new' },
    { kind: 'sheet', ref: 's' },
    { kind: 'presentation', ref: 'old' },
  ],
});

describe('resolveThreadArtifactId', () => {
  it('takes the newest of the kind', () => {
    expect(resolveThreadArtifactId(artifacts, 'presentation')).toBe('new');
  });
  it('accepts an explicit id only from this thread', () => {
    expect(resolveThreadArtifactId(artifacts, 'presentation', 'old')).toBe('old');
    expect(resolveThreadArtifactId(artifacts, 'presentation', 's')).toBeNull();
  });
  it('is null without one', () => {
    expect(resolveThreadArtifactId(state({}), 'explainable')).toBeNull();
  });
});

describe('threadHasArtifact', () => {
  it('sees thread artifacts and last-turn editables', () => {
    expect(threadHasArtifact(artifacts, 'sheet')).toBe(true);
    expect(threadHasArtifact(state({ lastTurnEditables: ['presentation'] }), 'presentation')).toBe(
      true
    );
    expect(threadHasArtifact(artifacts, 'explainable')).toBe(false);
  });
});
