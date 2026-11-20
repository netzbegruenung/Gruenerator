import { describe, expect, it } from 'vitest';

import { projectChatThreads } from './projectChats.js';

const t = (id: string, updatedAt: string, groupId: string | null, status = 'active') => ({
  id,
  updatedAt,
  groupId,
  status,
});

describe('projectChatThreads', () => {
  it('keeps only live threads of the project, newest first', () => {
    const out = projectChatThreads(
      [
        t('a', '2026-11-01T10:00:00Z', 'g1'),
        t('b', '2026-11-03T10:00:00Z', 'g1'),
        t('c', '2026-11-04T10:00:00Z', 'g2'),
        t('d', '2026-11-05T10:00:00Z', 'g1', 'archived'),
        t('e', '2026-11-06T10:00:00Z', null),
      ],
      'g1'
    );
    expect(out.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('does not mutate its input', () => {
    const input = [t('a', '2026-11-01T10:00:00Z', 'g1'), t('b', '2026-11-03T10:00:00Z', 'g1')];
    projectChatThreads(input, 'g1');
    expect(input.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
