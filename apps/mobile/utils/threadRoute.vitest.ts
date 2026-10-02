import { describe, expect, it } from 'vitest';

import { threadRoute } from './threadRoute';

describe('threadRoute', () => {
  it('opens a notebook thread in its notebook chat, not as a plain chat', () => {
    expect(
      threadRoute({ id: 't1', threadType: 'notebook', notebookCollectionId: 'saarland-system' })
    ).toEqual({
      pathname: '/(focused)/notebook-chat',
      params: { notebookId: 'saarland-notebook', threadId: 't1' },
    });
  });

  it('keeps a user notebook id (its own collection) as is', () => {
    const uuid = '6f1c2a5e-0000-4000-8000-000000000000';
    expect(
      threadRoute({ id: 't2', threadType: 'notebook', notebookCollectionId: uuid })
    ).toMatchObject({ params: { notebookId: uuid } });
  });

  it('opens every other thread as a chat', () => {
    expect(threadRoute({ id: 't3', threadType: 'chat' })).toEqual({
      pathname: '/(focused)/chat-conversation',
      params: { threadId: 't3' },
    });
    // A notebook thread whose collection is unknown has nothing to scope to.
    expect(threadRoute({ id: 't4', threadType: 'notebook' })).toMatchObject({
      pathname: '/(focused)/chat-conversation',
    });
  });
});
