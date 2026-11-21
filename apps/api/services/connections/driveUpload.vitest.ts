import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadDocxAsGoogleDoc = vi.fn();
const uploadToMyDrive = vi.fn();
vi.mock('../api-clients/googleDriveClient.js', () => ({ uploadDocxAsGoogleDoc }));
vi.mock('../api-clients/microsoftGraphClient.js', () => ({ uploadToMyDrive }));

const { exportTitle, isDocxBuffer, uploadToDrive } = await import('./driveUpload.js');

describe('exportTitle', () => {
  it('drops the extension and characters OneDrive rejects', () => {
    expect(exportTitle('Antrag: Radwege/Innenstadt?.docx')).toBe('Antrag Radwege Innenstadt');
  });

  it('keeps umlauts and falls back to „Dokument“ when nothing is left', () => {
    expect(exportTitle('Grüne Ideen für Köln.docx')).toBe('Grüne Ideen für Köln');
    expect(exportTitle('???.docx')).toBe('Dokument');
  });
});

describe('isDocxBuffer', () => {
  it('accepts a ZIP header and rejects anything else', () => {
    expect(isDocxBuffer(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14]))).toBe(true);
    expect(isDocxBuffer(Buffer.from('%PDF-1.7'))).toBe(false);
  });
});

describe('uploadToDrive', () => {
  const docx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);

  beforeEach(() => {
    uploadDocxAsGoogleDoc.mockReset();
    uploadToMyDrive.mockReset();
  });

  it('creates a Google Doc named without the extension', async () => {
    uploadDocxAsGoogleDoc.mockResolvedValue({
      name: 'Antrag',
      webViewLink: 'https://docs.google.com/document/d/1/edit',
    });

    expect(await uploadToDrive('google', 'tok', docx, 'Antrag.docx')).toEqual({
      name: 'Antrag',
      webUrl: 'https://docs.google.com/document/d/1/edit',
    });
    expect(uploadDocxAsGoogleDoc).toHaveBeenCalledWith('tok', docx, 'Antrag');
  });

  it('puts a .docx into OneDrive', async () => {
    uploadToMyDrive.mockResolvedValue({ name: 'Antrag 1.docx', webUrl: 'https://1drv.ms/w/x' });

    expect(await uploadToDrive('microsoft', 'tok', docx, 'Antrag.docx')).toEqual({
      name: 'Antrag 1.docx',
      webUrl: 'https://1drv.ms/w/x',
    });
    expect(uploadToMyDrive).toHaveBeenCalledWith('tok', docx, 'Antrag.docx');
  });
});
