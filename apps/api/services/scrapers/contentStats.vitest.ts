import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const count = vi.fn();
const readClient = vi.fn((_collection: string) => ({ count }));

vi.mock('../../database/services/QdrantService/index.js', () => ({
  getQdrantInstance: () => ({ readClient }),
}));

import { getContentStatsMarkdown } from './contentStats.js';

describe('contentStats', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    count.mockReset();
    readClient.mockClear();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('counts through readClient', async () => {
    count.mockResolvedValue({ count: 7 });

    const { markdown, totalPoints } = await getContentStatsMarkdown();

    expect(totalPoints).toBe(7 * 18);
    expect(markdown).toContain('| Grundsatzprogramm | 7 |');
    expect(readClient).toHaveBeenCalledWith('grundsatz_documents');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the landesverband filter on the landesverbaende count', async () => {
    count.mockResolvedValue({ count: 1 });

    await getContentStatsMarkdown();

    expect(count).toHaveBeenCalledWith('landesverbaende_documents', {
      filter: { must: [{ key: 'landesverband', match: { value: 'BB' } }] },
      exact: true,
    });
    expect(count).toHaveBeenCalledWith('grundsatz_documents', { exact: true });
  });

  it('treats a failing count as unknown', async () => {
    count.mockRejectedValue(new Error('down'));

    const { totalPoints } = await getContentStatsMarkdown();

    expect(totalPoints).toBe(0);
  });
});
