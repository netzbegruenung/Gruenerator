/**
 * Was hier leise falsch werden könnte: die Liste wird mit einer fremden Kennung
 * geholt, oder ein abgelaufener Zugang kommt als stummer 500 an, sodass der
 * Browser nicht „neu verbinden" anbieten kann.
 */
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getConnection = vi.fn();
const browseDrive = vi.fn();
vi.mock('../../services/connections/ConnectionService.js', () => ({
  ConnectionService: { getConnection },
}));
vi.mock('../../services/connections/driveBrowse.js', () => ({ browseDrive }));

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
    expect(browseDrive).toHaveBeenCalledWith('microsoft', 'tok-1', 'folder1');
    expect(res).toEqual({ status: 200, body: { success: true, entries: [], truncated: false } });
  });

  it('meldet ein fehlendes Konto als 401 mit reauth', async () => {
    getConnection.mockRejectedValue(new Error('No microsoft connection found for user'));

    const res = await browse();

    expect(res).toMatchObject({ status: 401, body: { reauth: true } });
    expect(browseDrive).not.toHaveBeenCalled();
  });

  it('meldet einen abgelehnten Token des Anbieters als 401 mit reauth', async () => {
    browseDrive.mockRejectedValue(axiosError(401));
    expect(await browse()).toMatchObject({ status: 401, body: { reauth: true } });
  });

  it('meldet einen unbekannten Ordner als 404', async () => {
    browseDrive.mockRejectedValue(axiosError(404));
    expect(await browse('gone')).toMatchObject({ status: 404, body: { reauth: false } });
  });
});
