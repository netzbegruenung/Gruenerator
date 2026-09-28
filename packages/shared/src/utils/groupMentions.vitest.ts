import { describe, expect, it } from 'vitest';

import {
  buildMemberMention,
  groupMentionSegments,
  groupMentionsToPlain,
  parseGroupMentions,
} from './groupMentions.js';

const ANNA = '11111111-1111-4111-8111-111111111111';
const OEZLEM = '22222222-2222-4222-8222-222222222222';

describe('buildMemberMention', () => {
  it('builds a user token', () => {
    expect(buildMemberMention('Anna Beispiel', ANNA)).toBe(`@[Anna Beispiel](user:${ANNA})`);
  });

  it('keeps the label inside the token grammar', () => {
    expect(buildMemberMention('A]nn\na', ANNA)).toBe(`@[A nn a](user:${ANNA})`);
  });
});

describe('parseGroupMentions', () => {
  it('finds members and deduplicates them', () => {
    const text = `Hi ${buildMemberMention('Anna', ANNA)} und ${buildMemberMention('Özlem Yılmaz', OEZLEM)}, ${buildMemberMention('Anna', ANNA)}`;
    expect(parseGroupMentions(text)).toEqual({ userIds: [ANNA, OEZLEM], all: false });
  });

  it.each(['@alle bitte lesen', 'Hallo @alle!', 'Hallo @all.', '(@alle)', '@Alle'])(
    'recognises everyone in %j',
    (text) => {
      expect(parseGroupMentions(text).all).toBe(true);
    }
  );

  it.each(['@allerdings', 'mail@alle.de', '@allein', '@alles', 'alle', '@allä'])(
    'does not treat %j as everyone',
    (text) => {
      expect(parseGroupMentions(text).all).toBe(false);
    }
  );

  it('ignores @alle inside a member label', () => {
    expect(parseGroupMentions(buildMemberMention('Team @alle', ANNA))).toEqual({
      userIds: [ANNA],
      all: false,
    });
  });

  it('ignores user tokens whose id is not a uuid', () => {
    expect(parseGroupMentions('@[x](user:not-a-uuid)').userIds).toEqual([]);
  });
});

describe('groupMentionSegments', () => {
  it('splits text, members and everyone and round-trips', () => {
    const text = `@alle: ${buildMemberMention('Anna', ANNA)} macht das.`;
    const segments = groupMentionSegments(text);
    expect(segments).toEqual([
      { kind: 'all', raw: '@alle' },
      { kind: 'text', text: ': ' },
      { kind: 'user', userId: ANNA, label: 'Anna', raw: `@[Anna](user:${ANNA})` },
      { kind: 'text', text: ' macht das.' },
    ]);
    expect(segments.map((s) => (s.kind === 'text' ? s.text : s.raw)).join('')).toBe(text);
  });

  it('returns a single text segment without mentions', () => {
    expect(groupMentionSegments('nur Text')).toEqual([{ kind: 'text', text: 'nur Text' }]);
  });
});

describe('groupMentionsToPlain', () => {
  it('renders member tokens as @Label', () => {
    expect(groupMentionsToPlain(`@alle, ${buildMemberMention('Anna Beispiel', ANNA)} fragt`)).toBe(
      '@alle, @Anna Beispiel fragt'
    );
  });
});
