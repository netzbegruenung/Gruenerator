import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
const mockGetToken = vi.fn();
const mockFiles: { name: string; written?: Uint8Array }[] = [];

vi.mock('@gruenerator/chat', () => ({
  useChatConfigStore: { getState: () => ({ fetch: mockFetch }) },
}));
vi.mock('../../services/storage', () => ({
  secureStorage: { getToken: () => mockGetToken() },
}));
vi.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: class {
    entry: { name: string; written?: Uint8Array };
    uri: string;
    constructor(_dir: string, name: string) {
      this.entry = { name };
      this.uri = `file:///${name}`;
      mockFiles.push(this.entry);
    }
    write(bytes: Uint8Array) {
      this.entry.written = bytes;
    }
  },
}));

import { downloadDocumentPdf, fetchAssetBytes } from './chatFileActions';

const response = (status: number, body = new Uint8Array([1, 2, 3])) => ({
  ok: status >= 200 && status < 300,
  status,
  arrayBuffer: async () => body.buffer,
});

describe('fetchAssetBytes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the body bytes', async () => {
    mockFetch.mockResolvedValue(response(200));
    expect(await fetchAssetBytes('/x')).toEqual(new Uint8Array([1, 2, 3]));
    expect(mockFetch).toHaveBeenCalledWith('/x', { method: 'GET' });
  });

  it('rejects with the status on a non-ok response', async () => {
    mockFetch.mockResolvedValue(response(404));
    await expect(fetchAssetBytes('/x')).rejects.toThrow('HTTP 404');
  });
});

describe('downloadDocumentPdf', () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    mockFiles.length = 0;
    fetchSpy.mockResolvedValue(response(200));
    vi.stubGlobal('fetch', fetchSpy);
  });

  it('sends the bearer token and strips a trailing /api from the base', async () => {
    mockGetToken.mockResolvedValue('t');
    await downloadDocumentPdf({ url: '/api/chat-service/a.pdf', documentId: 'a.pdf' });
    expect(fetchSpy).toHaveBeenCalledWith('https://gruenerator.eu/api/chat-service/a.pdf', {
      headers: { Authorization: 'Bearer t' },
    });
  });

  it('sends no headers without a token', async () => {
    mockGetToken.mockResolvedValue(null);
    await downloadDocumentPdf({ url: '/api/x', documentId: 'a' });
    expect(fetchSpy.mock.calls[0][1]).toEqual({ headers: {} });
  });

  it.each([
    ['x.pdf', 'x.pdf'],
    ['x', 'x.pdf'],
    [undefined, 'gruenerator.pdf'],
  ])('names %s as %s and writes the bytes', async (documentId, expected) => {
    mockGetToken.mockResolvedValue(null);
    const file = await downloadDocumentPdf({ url: '/api/x', documentId });
    expect(mockFiles[0].name).toBe(expected);
    expect(mockFiles[0].written).toEqual(new Uint8Array([1, 2, 3]));
    expect(file.uri).toBe(`file:///${expected}`);
  });

  it('rejects with the status on a non-ok response', async () => {
    mockGetToken.mockResolvedValue(null);
    fetchSpy.mockResolvedValue(response(410));
    await expect(downloadDocumentPdf({ url: '/api/x' })).rejects.toThrow(
      'Download fehlgeschlagen (410)'
    );
  });
});
