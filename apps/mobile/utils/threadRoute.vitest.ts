import { describe, expect, it } from 'vitest';

import { threadRoute } from './threadRoute';

describe('threadRoute', () => {
  it('opens a notebook thread in its notebook chat, with the notebook beneath', () => {
    expect(
      threadRoute({ id: 't1', threadType: 'notebook', notebookCollectionId: 'saarland-system' })
    ).toEqual({
      href: {
        pathname: '/notebook/[id]/chat',
        params: { id: 'saarland-notebook', threadId: 't1' },
      },
      withAnchor: true,
    });
  });

  it('keeps a user notebook id (its own collection) as is', () => {
    const uuid = '6f1c2a5e-0000-4000-8000-000000000000';
    expect(
      threadRoute({ id: 't2', threadType: 'notebook', notebookCollectionId: uuid })
    ).toMatchObject({ href: { params: { id: uuid } } });
  });

  it('opens every other thread as a chat, without an anchor', () => {
    expect(threadRoute({ id: 't3', threadType: 'chat' })).toEqual({
      href: { pathname: '/(focused)/chat-conversation', params: { threadId: 't3' } },
      withAnchor: false,
    });
    // A notebook thread whose collection is unknown has nothing to scope to.
    expect(threadRoute({ id: 't4', threadType: 'notebook' })).toMatchObject({
      href: { pathname: '/(focused)/chat-conversation' },
      withAnchor: false,
    });
  });
});
