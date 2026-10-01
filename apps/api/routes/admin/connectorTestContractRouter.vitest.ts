/**
 * Was hier leise falsch werden könnte: das Admin-Gatter fällt weg (dann bekommt
 * jede angemeldete Person einen Google-Token samt Picker-Key), die Statusabfrage
 * verliert Google wieder an HIDDEN_NANGO_PROVIDERS (dann ist die Testseite für
 * genau den Anbieter blind, den sie testen soll), oder `read` liest an der
 * Chat-Abrufkette vorbei bzw. mit einer fremden Kennung.
 */
import {
  connectorTestProbeResponseSchema,
  connectorTestReadResponseSchema,
  connectorTestStatusResponseSchema,
} from '@gruenerator/contracts';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireInstanceAdmin = vi.fn();
const listConnections = vi.fn();
const getConnection = vi.fn();
const createConnectLink = vi.fn();
const deleteConnection = vi.fn();
const retrieveConnectFile = vi.fn();
const listFiles = vi.fn();
const listDriveItems = vi.fn();
const env: Record<string, string | undefined> = {};

vi.mock('../../utils/adminAuthz.js', () => ({ requireInstanceAdmin }));
vi.mock('../../config/env.js', () => ({ env }));
vi.mock('../../services/connections/ConnectionService.js', () => ({
  ConnectionService: { listConnections, getConnection, createConnectLink, deleteConnection },
}));
vi.mock('../../agents/langgraph/ChatGraph/nodes/connectRetrieval.js', () => ({
  retrieveConnectFile,
}));
vi.mock('../../services/api-clients/googleDriveClient.js', () => ({ listFiles }));
vi.mock('../../services/api-clients/microsoftGraphClient.js', () => ({ listDriveItems }));

const req = { user: { id: 'admin-1', email: 'admin@example.org' } } as never;

async function loadRouter() {
  const mod = await import('./connectorTestContractRouter.js');
  return mod.connectorTestContractRouter;
}

beforeEach(() => {
  requireInstanceAdmin.mockReset().mockResolvedValue(true);
  listConnections.mockReset().mockResolvedValue([
    {
      provider: 'google',
      label: 'Google Workspace',
      connected: true,
      connectedAt: '2026-10-01T10:00:00.000Z',
    },
    { provider: 'microsoft', label: 'Microsoft 365', connected: false, connectedAt: null },
    { provider: 'jira', label: 'Jira', connected: true, connectedAt: null },
  ]);
  getConnection.mockReset().mockResolvedValue({ accessToken: 'tok-1' });
  createConnectLink.mockReset().mockResolvedValue('https://connect.example/?session_token=x');
  deleteConnection.mockReset().mockResolvedValue(undefined);
  retrieveConnectFile.mockReset();
  listFiles.mockReset();
  listDriveItems.mockReset();
  env.NANGO_SECRET_KEY = 'secret';
  env.GOOGLE_PICKER_API_KEY = 'picker-key';
  env.GOOGLE_PICKER_APP_ID = '531200095410';
});

describe('Admin-Gatter', () => {
  it('weist jede Route ohne Instanz-Admin mit 403 ab, bevor Nango gefragt wird', async () => {
    requireInstanceAdmin.mockResolvedValue(false);
    const router = await loadRouter();
    const params = { provider: 'google' };

    const results = await Promise.all([
      router.status({ req } as never),
      router.connect({ req, params } as never),
      router.probe({ req, params, body: {} } as never),
      router.picker({ req } as never),
      router.read({ req, params, body: { fileId: 'f', name: 'n' } } as never),
      router.disconnect({ req, params } as never),
    ]);

    expect(results.map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(getConnection).not.toHaveBeenCalled();
    expect(createConnectLink).not.toHaveBeenCalled();
    expect(deleteConnection).not.toHaveBeenCalled();
    expect(retrieveConnectFile).not.toHaveBeenCalled();
  });
});

describe('status', () => {
  it('zeigt Google trotz HIDDEN_NANGO_PROVIDERS und nur Google/Microsoft', async () => {
    const router = await loadRouter();
    const res = await router.status({ req } as never);

    expect(res.status).toBe(200);
    expect(listConnections).toHaveBeenCalledWith('admin-1', { includeHidden: true });
    const body = connectorTestStatusResponseSchema.parse(res.body);
    expect(body.providers.map((p) => [p.provider, p.connected])).toEqual([
      ['google', true],
      ['microsoft', false],
    ]);
    expect(body.pickerConfigured).toBe(true);
  });
});

describe('picker', () => {
  it('meldet fehlende Picker-Konfiguration als 404, ohne einen Token herauszugeben', async () => {
    env.GOOGLE_PICKER_API_KEY = undefined;
    const router = await loadRouter();
    const res = await router.picker({ req } as never);

    expect(res.status).toBe(404);
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('gibt den Token der eigenen Verbindung mit Key und App-ID aus', async () => {
    const router = await loadRouter();
    const res = await router.picker({ req } as never);

    expect(getConnection).toHaveBeenCalledWith('admin-1', 'google');
    expect(res).toEqual({
      status: 200,
      body: { success: true, accessToken: 'tok-1', apiKey: 'picker-key', appId: '531200095410' },
    });
  });
});

describe('probe', () => {
  it('reicht HTTP-Status und Antwort des Anbieters als Befund durch', async () => {
    listFiles.mockRejectedValue(
      new AxiosError('Request failed with status code 403', 'ERR_BAD_REQUEST', undefined, null, {
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { error: { message: 'Insufficient Permission' } },
      })
    );
    const router = await loadRouter();
    const res = await router.probe({ req, params: { provider: 'google' }, body: {} } as never);

    expect(res.status).toBe(200);
    const body = connectorTestProbeResponseSchema.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('HTTP 403');
    expect(body.error).toContain('Insufficient Permission');
  });

  it('bildet Microsoft-Ordner und -Dateien auf eine Liste ab', async () => {
    listDriveItems.mockResolvedValue({
      items: [
        { id: 'd1', name: 'Ordner', size: 0, lastModifiedDateTime: '', folder: { childCount: 2 } },
        {
          id: 'f1',
          name: 'a.docx',
          size: 10,
          lastModifiedDateTime: '',
          file: {
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
        },
      ],
      nextLink: null,
    });
    const router = await loadRouter();
    const res = await router.probe({
      req,
      params: { provider: 'microsoft' },
      body: { folderId: 'root-x' },
    } as never);

    expect(listDriveItems).toHaveBeenCalledWith('tok-1', 'root-x');
    const body = connectorTestProbeResponseSchema.parse(res.body);
    expect(body.files.map((f) => [f.id, f.isFolder])).toEqual([
      ['d1', true],
      ['f1', false],
    ]);
  });
});

describe('read', () => {
  it('liest über retrieveConnectFile mit der eigenen Kennung', async () => {
    retrieveConnectFile.mockResolvedValue({
      results: [{ content: 'Erster Chunk' }, { content: 'Zweiter Chunk' }],
    });
    const router = await loadRouter();
    const res = await router.read({
      req,
      params: { provider: 'google' },
      body: { fileId: 'doc-1', name: 'Antrag', mimeType: 'application/vnd.google-apps.document' },
    } as never);

    const [src, , userId] = retrieveConnectFile.mock.calls[0] as [
      { connect: unknown },
      number,
      string,
    ];
    expect(userId).toBe('admin-1');
    expect(src.connect).toEqual({
      provider: 'google',
      fileId: 'doc-1',
      name: 'Antrag',
      mimeType: 'application/vnd.google-apps.document',
    });
    const body = connectorTestReadResponseSchema.parse(res.body);
    expect(body).toMatchObject({ ok: true, chunkCount: 2, preview: 'Erster Chunk', reauth: false });
  });

  it('zeigt einen abgelaufenen Zugang als reauth, nicht als Erfolg', async () => {
    retrieveConnectFile.mockResolvedValue({
      results: [],
      error: { message: 'Verbindung zu google nicht abrufbar: …', reauth: true },
    });
    const router = await loadRouter();
    const res = await router.read({
      req,
      params: { provider: 'google' },
      body: { fileId: 'doc-1', name: 'Antrag' },
    } as never);

    const body = connectorTestReadResponseSchema.parse(res.body);
    expect(body).toMatchObject({ ok: false, reauth: true, chunkCount: 0 });
  });
});
