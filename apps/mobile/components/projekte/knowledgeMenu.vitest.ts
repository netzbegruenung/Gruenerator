import { type GroupFeedItem } from '@gruenerator/shared/groups';
import { describe, expect, it } from 'vitest';

import { buildKnowledgeActions, DISCUSS_ID, knowledgeItems } from './knowledgeMenu';

const shared = { share: { shareId: 's1' } } as Pick<GroupFeedItem, 'share'>;
const unshared = { share: null } as Pick<GroupFeedItem, 'share'>;
const manage = [{ id: 'remove', title: 'Aus dem Projekt entfernen' }];

describe('buildKnowledgeActions', () => {
  it('puts the Austausch entry first', () => {
    expect(buildKnowledgeActions(shared, true, manage).map((a) => a.id)).toEqual([
      DISCUSS_ID,
      'remove',
    ]);
  });
  it('omits it without an Austausch or without a share', () => {
    expect(buildKnowledgeActions(shared, false, manage).map((a) => a.id)).toEqual(['remove']);
    expect(buildKnowledgeActions(unshared, true, manage).map((a) => a.id)).toEqual(['remove']);
  });
});

describe('knowledgeItems', () => {
  it('drops posts', () => {
    const items = [{ kind: 'post' }, { kind: 'doc' }] as GroupFeedItem[];
    expect(knowledgeItems(items).map((i) => i.kind)).toEqual(['doc']);
  });
});
