/**
 * Excel & Co. liest die Extraktion nicht; für Microsoft holt der Abruf sie als
 * PDF. Bricht das, kommt im Chat „XLSX-Dateien können nicht gelesen werden“.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const downloadDriveItem = vi.fn();
const extractTextFromFile = vi.fn();

vi.mock('../../../../services/api-clients/microsoftGraphClient.js', () => ({ downloadDriveItem }));
vi.mock('../../../../services/api-clients/googleDriveClient.js', () => ({}));
vi.mock('../../../../services/api-clients/atlassianClient.js', () => ({}));
vi.mock('../../../../services/connections/ConnectionService.js', () => ({
  ConnectionService: { getConnection: vi.fn().mockResolvedValue({ accessToken: 'tok' }) },
}));
vi.mock(
  '../../../../services/document-services/DocumentProcessingService/textExtraction.js',
  () => ({ extractTextFromFile })
);

const { retrieveConnectFile } = await import('./connectRetrieval.js');

function source(name: string) {
  return {
    kind: 'connect',
    id: 's1',
    label: name,
    connect: { provider: 'microsoft', fileId: 'item-1', name, mimeType: null },
  } as never;
}

beforeEach(() => {
  downloadDriveItem.mockReset().mockResolvedValue(Buffer.from('x'));
  extractTextFromFile.mockReset().mockResolvedValue('Inhalt');
});

describe('retrieveConnectFile — Microsoft', () => {
  it('liest XLSX als von Graph umgewandeltes PDF', async () => {
    const result = await retrieveConnectFile(source('Haushalt.xlsx'), 5, 'u1');

    expect(downloadDriveItem).toHaveBeenCalledWith('tok', 'item-1', { asPdf: true });
    expect(extractTextFromFile).toHaveBeenCalledWith(
      expect.objectContaining({ mimetype: 'application/pdf', originalname: 'Haushalt.xlsx.pdf' })
    );
    expect(result.results).toHaveLength(1);
  });

  it('lädt DOCX unverändert', async () => {
    await retrieveConnectFile(source('Antrag.docx'), 5, 'u1');

    expect(downloadDriveItem).toHaveBeenCalledWith('tok', 'item-1');
    expect(extractTextFromFile).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'Antrag.docx' })
    );
  });
});
