import { describe, expect, it } from 'vitest';

import { drawerOpenMode, threadRoute } from './threadRoute';

describe('threadRoute', () => {
  it('opens a notebook thread in its notebook chat, with the notebook beneath', () => {
    expect(
      threadRoute({ id: 't1', threadType: 'notebook', notebookCollectionIds: ['saarland-system'] })
    ).toEqual({
      href: {
        pathname: '/notebook/[id]/chat',
        params: { id: 'saarland-notebook', threadId: 't1' },
      },
      withAnchor: true,
    });
  });

  // #4024: the aggregate's first collection is also the Grüne notebook's only one.
  it('reopens an aggregate thread in the aggregate, not in its first collection', () => {
    const ids = [
      'grundsatz-system',
      'bundestagsfraktion-system',
      'gruene-de-system',
      'kommunalwiki-system',
      'gruenblog-system',
    ];
    expect(
      threadRoute({ id: 't6', threadType: 'notebook', notebookCollectionIds: ids })
    ).toMatchObject({ href: { params: { id: 'gruenerator-notebook' } } });
  });

  it('reopens a source-picker subset in the notebook it was narrowed from', () => {
    expect(
      threadRoute({
        id: 't7',
        threadType: 'notebook',
        notebookCollectionIds: ['grundsatz-system', 'kommunalwiki-system'],
      })
    ).toMatchObject({ href: { params: { id: 'gruenerator-notebook' } } });
  });

  it('reopens a single shared collection in the notebook that asks only it', () => {
    expect(
      threadRoute({ id: 't8', threadType: 'notebook', notebookCollectionIds: ['grundsatz-system'] })
    ).toMatchObject({ href: { params: { id: 'gruene-notebook' } } });
  });

  it('keeps a user notebook id (its own collection) as is', () => {
    const uuid = '6f1c2a5e-0000-4000-8000-000000000000';
    expect(
      threadRoute({ id: 't2', threadType: 'notebook', notebookCollectionIds: [uuid] })
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

  it("reopens an agent's thread with its agent", () => {
    expect(threadRoute({ id: 't5', threadType: 'chat', agentId: 'pressemitteilung' })).toEqual({
      href: {
        pathname: '/(focused)/chat-conversation',
        params: { threadId: 't5', agentId: 'pressemitteilung' },
      },
      withAnchor: false,
    });
  });
});

describe('drawerOpenMode', () => {
  const chat = (threadId: string) => ({ name: 'chat-conversation', params: { threadId } });

  it('only closes the drawer when that conversation is already open', () => {
    expect(drawerOpenMode(chat('t1'), { threadId: 't1', withAnchor: false })).toBe('close');
    expect(
      drawerOpenMode(
        { name: 'chat', params: { id: 'berlin-notebook', threadId: 't2' } },
        {
          threadId: 't2',
          withAnchor: true,
        }
      )
    ).toBe('close');
  });

  it('swaps one chat for another instead of stacking them', () => {
    expect(drawerOpenMode(chat('t1'), { threadId: 't2', withAnchor: false })).toBe('replace');
    // "+" in a chat: a fresh chat in its place, even from an unsent new one.
    expect(drawerOpenMode(chat('new'), { threadId: 'new', withAnchor: false })).toBe('replace');
  });

  it('pushes from anywhere else, and always for a notebook chat', () => {
    expect(drawerOpenMode({ name: 'start' }, { threadId: 't1', withAnchor: false })).toBe('push');
    expect(drawerOpenMode(undefined, { threadId: 't1', withAnchor: false })).toBe('push');
    expect(drawerOpenMode(chat('t1'), { threadId: 't2', withAnchor: true })).toBe('push');
  });
});
