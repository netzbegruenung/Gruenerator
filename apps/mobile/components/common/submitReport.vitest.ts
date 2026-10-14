import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@gruenerator/shared/api', () => ({
  getContractsClient: () => ({ contentReports: { create: mockCreate } }),
}));

import { FALLBACK_ERROR, RATE_LIMIT_ERROR, submitReport } from './submitReport';

const target = { kind: 'chat_message', targetId: 'm1' } as Parameters<typeof submitReport>[0];

describe('submitReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps 200 to done', async () => {
    mockCreate.mockResolvedValue({ status: 200 });
    expect(await submitReport(target, 'other', '')).toBe('done');
  });

  it('maps 429 to the rate limit message', async () => {
    mockCreate.mockResolvedValue({ status: 429 });
    expect(await submitReport(target, 'other', '')).toBe(RATE_LIMIT_ERROR);
  });

  it('maps any other status to the fallback', async () => {
    mockCreate.mockResolvedValue({ status: 500 });
    expect(await submitReport(target, 'other', '')).toBe(FALLBACK_ERROR);
  });

  it('maps a thrown client to the fallback', async () => {
    mockCreate.mockRejectedValue(new Error('offline'));
    expect(await submitReport(target, 'other', '')).toBe(FALLBACK_ERROR);
  });

  it('omits a blank note and trims a real one', async () => {
    mockCreate.mockResolvedValue({ status: 200 });
    await submitReport(target, 'other', '  ');
    expect(mockCreate.mock.calls[0][0].body).toEqual({ ...target, reason: 'other' });
    await submitReport(target, 'other', ' x ');
    expect(mockCreate.mock.calls[1][0].body).toEqual({ ...target, reason: 'other', note: 'x' });
  });
});
