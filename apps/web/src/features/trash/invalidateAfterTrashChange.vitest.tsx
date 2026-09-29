import { requestThreadListReload } from '@gruenerator/chat';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invalidateAfterTrashChange } from './invalidateAfterTrashChange';

vi.mock('@gruenerator/chat', () => ({ requestThreadListReload: vi.fn() }));

function spyClient() {
  const qc = new QueryClient();
  return { qc, invalidate: vi.spyOn(qc, 'invalidateQueries') };
}

beforeEach(() => {
  vi.mocked(requestThreadListReload).mockClear();
});

describe('invalidateAfterTrashChange', () => {
  it('reloads the chat thread list, which lives outside TanStack', () => {
    const { qc } = spyClient();
    invalidateAfterTrashChange(qc, 'chat_thread');
    expect(requestThreadListReload).toHaveBeenCalledTimes(1);
  });

  it('leaves the thread list alone for other kinds and for emptying the trash', () => {
    const { qc } = spyClient();
    invalidateAfterTrashChange(qc, 'notebook');
    invalidateAfterTrashChange(qc, null);
    expect(requestThreadListReload).not.toHaveBeenCalled();
  });

  it('refreshes the candidate site (`my-site`), not the profile website links', () => {
    const { qc, invalidate } = spyClient();
    invalidateAfterTrashChange(qc, 'user_site');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['my-site'] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['user-websites'] });
  });
});
