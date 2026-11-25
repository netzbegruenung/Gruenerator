/**
 * Was hier leise falsch werden könnte: die Liste wird mit einer fremden Kennung
 * geholt, oder ein abgelaufener Zugang kommt als stummer 500 an, sodass der
 * Browser nicht „neu verbinden" anbieten kann.
 */
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getConnection = vi.fn();
const createConnectLink = vi.fn();
const browseDrive = vi.fn();
class ConnectionNotAllowedError extends Error {}
class ConnectionNotConfiguredError extends Error {}
vi.mock('../../services/connections/ConnectionService.js', () => ({
  ConnectionService: { getConnection, createConnectLink },
  ConnectionNotAllowedError,
  ConnectionNotConfiguredError,
}));
vi.mock('../../services/connections/driveBrowse.js', () => ({ browseDrive }));
const uploadToDrive = vi.fn();
vi.mock('../../services/connections/driveUpload.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/connections/driveUpload.js')>()),
  uploadToDrive,
}));
const env: Record<string, string | undefined> = {};
vi.mock('../../config/env.js', () => ({ env }));

const { connectionsContractRouter } = await import('./connectionsContractRouter.js');

const req = { user: { id: 'user-1', email: 'u@example.org' } } as never;

function browse(folderId?: string) {
  return connectionsContractRouter.browse({
    req,
    params: { provider: 'microsoft' },
    query: folderId ? { folderId } : {},
  } as never);
}

function axiosError(status: number) {
  return new AxiosError('fail', undefined, undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: null,
  });
}

beforeEach(() => {
  getConnection.mockReset().mockResolvedValue({ accessToken: 'tok-1' });
  browseDrive.mockReset().mockResolvedValue({ entries: [], truncated: false });
});

describe('connectionsContractRouter.browse', () => {
  it('liest mit dem Token der angemeldeten Person', async () => {
    const res = await browse('folder1');

    expect(getConnection).toHaveBeenCalledWith('user-1', 'microsoft');
    expect(browseDrive).toHaveBeenCalledWith('microsoft', 'tok-1', 'folder1', undefined);
    expect(res).toEqual({ status: 200, body: { success: true, entries: [], truncated: false } });
  });

  it('meldet ein fehlendes Konto als 403 mit reauth', async () => {
    getConnection.mockRejectedValue(new Error('No microsoft connection found for user'));

    const res = await browse();

    expect(res).toMatchObject({ status: 403, body: { reauth: true } });
    expect(browseDrive).not.toHaveBeenCalled();
  });

  it('meldet einen abgelehnten Token des Anbieters als 403 mit reauth', async () => {
    browseDrive.mockRejectedValue(axiosError(401));
    expect(await browse()).toMatchObject({ status: 403, body: { reauth: true } });
  });

  it('meldet einen unbekannten Ordner als 404', async () => {
    browseDrive.mockRejectedValue(axiosError(404));
    expect(await browse('gone')).toMatchObject({ status: 404, body: { reauth: false } });
  });
});

describe('connectionsContractRouter.connectLink', () => {
  const connectLink = () =>
    connectionsContractRouter.connectLink({ req, params: { provider: 'microsoft' } } as never);

  it('holt den Link mit der Kennung der angemeldeten Person', async () => {
    createConnectLink.mockReset().mockResolvedValue('https://nango.example/connect?x=1');

    expect(await connectLink()).toEqual({
      status: 200,
      body: { success: true, connectLink: 'https://nango.example/connect?x=1' },
    });
    expect(createConnectLink).toHaveBeenCalledWith('user-1', 'microsoft');
  });

  it('meldet einen gesperrten Anbieter als 403', async () => {
    createConnectLink.mockReset().mockRejectedValue(new ConnectionNotAllowedError('gesperrt'));
    expect(await connectLink()).toMatchObject({ status: 403, body: { success: false } });
  });

  it('nennt eine nicht eingerichtete Integration beim Namen', async () => {
    createConnectLink
      .mockReset()
      .mockRejectedValue(new ConnectionNotConfiguredError('Outlook ist noch nicht eingerichtet.'));
    expect(await connectLink()).toMatchObject({
      status: 500,
      body: { success: false, message: 'Outlook ist noch nicht eingerichtet.' },
    });
  });

  it('meldet einen Nango-Fehler als 500', async () => {
    createConnectLink.mockReset().mockRejectedValue(new Error('nango down'));
    expect(await connectLink()).toMatchObject({ status: 500, body: { success: false } });
  });
});

describe('connectionsContractRouter.googlePicker', () => {
  const picker = () => connectionsContractRouter.googlePicker({ req } as never);

  beforeEach(() => {
    env.GOOGLE_PICKER_API_KEY = 'picker-key';
    env.GOOGLE_PICKER_APP_ID = '531200095410';
  });

  it('gibt den Google-Token der angemeldeten Person mit Key und App-ID heraus', async () => {
    expect(await picker()).toEqual({
      status: 200,
      body: { success: true, accessToken: 'tok-1', apiKey: 'picker-key', appId: '531200095410' },
    });
    expect(getConnection).toHaveBeenCalledWith('user-1', 'google');
  });

  it('meldet fehlende Picker-Konfiguration als 404, ohne einen Token zu holen', async () => {
    env.GOOGLE_PICKER_APP_ID = undefined;

    expect(await picker()).toMatchObject({ status: 404, body: { success: false } });
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('meldet ein fehlendes Konto als 403 mit reauth', async () => {
    getConnection.mockRejectedValue(new Error('No google connection found for user'));
    expect(await picker()).toMatchObject({ status: 403, body: { reauth: true } });
  });
});

describe('connectionsContractRouter.upload', () => {
  const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
  const upload = (file: { buffer: Buffer; originalname: string } | undefined) =>
    connectionsContractRouter.upload.handler({
      req: { ...(req as object), file },
      params: { provider: 'microsoft' },
    } as never);

  beforeEach(() => {
    uploadToDrive
      .mockReset()
      .mockResolvedValue({ name: 'Antrag.docx', webUrl: 'https://onedrive.example/a' });
  });

  it('speichert die Word-Datei mit dem Token der angemeldeten Person', async () => {
    const res = await upload({ buffer: DOCX, originalname: 'Antrag.docx' });

    expect(getConnection).toHaveBeenCalledWith('user-1', 'microsoft');
    expect(uploadToDrive).toHaveBeenCalledWith('microsoft', 'tok-1', DOCX, 'Antrag.docx');
    expect(res).toEqual({
      status: 200,
      body: { success: true, name: 'Antrag.docx', webUrl: 'https://onedrive.example/a' },
    });
  });

  it('lehnt eine Datei ab, die keine .docx ist, ohne einen Token zu holen', async () => {
    const res = await upload({ buffer: Buffer.from('%PDF-1.7'), originalname: 'x.docx' });

    expect(res).toMatchObject({ status: 400, body: { success: false } });
    expect(getConnection).not.toHaveBeenCalled();
  });

  // Wer vor dem Export-Scope verbunden hat (OneDrive `Files.Read`), bekommt von
  // Graph 403 — das muss als „neu verbinden" ankommen, nicht als 500.
  it('meldet fehlendes Schreibrecht als 403 mit reauth', async () => {
    uploadToDrive.mockRejectedValue(axiosError(403));

    expect(await upload({ buffer: DOCX, originalname: 'a.docx' })).toMatchObject({
      status: 403,
      body: { reauth: true },
    });
  });
});
