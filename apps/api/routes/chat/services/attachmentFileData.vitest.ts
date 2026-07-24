/**
 * `chat_thread_attachments.file_data` is no longer tabular-only: fillable PDFs
 * are stored in the same column for the PDF form tools. These tests pin the
 * separation, because the failure mode is silent — an unfiltered read would
 * stage a PDF into the browser's Pyodide FS and hand it to pandas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));

const { getThreadTabularFiles, getThreadPdfFiles } =
  await import('./attachmentPersistenceService.js');

describe('file_data readers', () => {
  beforeEach(() => mockQuery.mockReset());

  it('getThreadTabularFiles drops PDFs that share the column', async () => {
    mockQuery.mockResolvedValue([
      { name: 'umsatz.xlsx', mime_type: 'application/vnd.ms-excel', file_data: 'eA==' },
      { name: 'antrag.pdf', mime_type: 'application/pdf', file_data: 'eQ==' },
      { name: 'export.csv', mime_type: 'text/csv', file_data: 'eg==' },
    ]);

    const files = await getThreadTabularFiles('thread-1', 'user-1');

    expect(files.map((f) => f.name)).toEqual(['umsatz.xlsx', 'export.csv']);
  });

  it('getThreadPdfFiles asks the DB for PDFs only, scoped to the owner', async () => {
    mockQuery.mockResolvedValue([{ name: 'antrag.pdf', file_data: 'eQ==' }]);

    const files = await getThreadPdfFiles('thread-1', 'user-1');

    expect(files).toEqual([{ name: 'antrag.pdf', data: 'eQ==' }]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("mime_type = 'application/pdf'");
    expect(sql).toContain('user_id = $2');
    // Newest first: a re-uploaded form must win over the stale one.
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(params).toEqual(['thread-1', 'user-1']);
  });
});
