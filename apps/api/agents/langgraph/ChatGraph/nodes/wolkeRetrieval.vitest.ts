import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getShareLinks: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../../../../utils/integrations/nextcloud/shareManager.js', () => ({
  NextcloudShareManager: { getShareLinks: mocks.getShareLinks },
}));
vi.mock('../../../../services/api-clients/nextcloudApiClient.js', () => ({
  default: { create: mocks.create },
}));
vi.mock(
  '../../../../services/document-services/DocumentProcessingService/textExtraction.js',
  () => ({
    extractTextFromFile: vi.fn(),
  })
);

import { downloadWolkeFile } from './wolkeRetrieval.js';

const REF = { shareLinkId: 'link-1', path: '/a.jpg', name: 'a.jpg' };

describe('downloadWolkeFile', () => {
  beforeEach(() => {
    mocks.getShareLinks.mockReset();
    mocks.create.mockReset();
  });

  it('refuses a share link that is not this user’s and never opens a client', async () => {
    mocks.getShareLinks.mockResolvedValue([{ id: 'someone-elses', share_link: 'https://x' }]);
    const result = await downloadWolkeFile('user-1', REF);
    expect(result.ok).toBe(false);
    expect(mocks.getShareLinks).toHaveBeenCalledWith('user-1');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('downloads through the resolved share link', async () => {
    mocks.getShareLinks.mockResolvedValue([{ id: 'link-1', share_link: 'https://x' }]);
    mocks.create.mockResolvedValue({
      downloadFile: vi
        .fn()
        .mockResolvedValue({ buffer: Buffer.from('x'), mimeType: null, size: 1 }),
    });
    expect(await downloadWolkeFile('user-1', REF)).toMatchObject({ ok: true, size: 1 });
  });
});
