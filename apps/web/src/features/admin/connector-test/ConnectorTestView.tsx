import {
  type ConnectorTestFile,
  type ConnectorTestProvider,
  type ConnectorTestReadResponse,
  type ConnectorTestStatusResponse,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { Button, Skeleton } from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { pickGoogleFiles } from './googlePicker';

const STATUS_KEY = ['connector-test-status'];

type Provider = ConnectorTestStatusResponse['providers'][number];

/**
 * Alles ausser 200 wird zum Fehler mit der Server-Meldung. Der Cast ist die
 * Grenzstelle: TS verengt einen generischen Union-Parameter nicht über `status`.
 */
function unwrap<R extends { status: number; body: unknown }>(
  result: R
): Extract<R, { status: 200 }>['body'] {
  if (result.status === 200) return result.body as Extract<R, { status: 200 }>['body'];
  const body = result.body as { message?: string } | null;
  throw new Error(body?.message ?? `HTTP ${result.status}`);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Öffnet das Popup synchron im Klick (sonst blockt der Browser es), holt dann den
 * Connect-Link und wartet, bis das Fenster zu ist.
 */
async function connectInPopup(provider: ConnectorTestProvider): Promise<void> {
  const popup = window.open('', '_blank', 'width=600,height=720');
  if (!popup) throw new Error('Popup wurde blockiert.');
  try {
    const { connectLink } = unwrap(
      await getContractsClient().connectorTest.connect({ params: { provider } })
    );
    popup.location.href = connectLink;
  } catch (err) {
    popup.close();
    throw err;
  }
  await new Promise<void>((resolve) => {
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        resolve();
      }
    }, 500);
  });
}

function Result({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div
      className={`rounded-md border p-sm text-sm ${
        ok
          ? 'border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300'
          : 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'
      }`}
    >
      {children}
    </div>
  );
}

function ReadResult({ result }: { result: ConnectorTestReadResponse }) {
  return (
    <Result ok={result.ok}>
      <p className="m-0 font-medium">
        {result.ok ? `Gelesen: ${result.chunkCount} Chunk(s)` : 'Lesen fehlgeschlagen'}
        {result.reauth && ' — Verbindung muss erneuert werden'}
      </p>
      {result.error && <p className="m-0 mt-xs break-words font-mono text-xs">{result.error}</p>}
      {result.preview && (
        <pre className="mt-sm max-h-80 overflow-auto whitespace-pre-wrap rounded bg-background p-sm font-mono text-xs text-foreground">
          {result.preview}
        </pre>
      )}
    </Result>
  );
}

function FileRow({
  file,
  onOpenFolder,
  onRead,
  reading,
}: {
  file: ConnectorTestFile;
  onOpenFolder: (id: string) => void;
  onRead: (file: ConnectorTestFile) => void;
  reading: boolean;
}) {
  return (
    <li className="flex items-center gap-sm border-b border-grey-100 py-xs last:border-b-0 dark:border-grey-800">
      <span aria-hidden>{file.isFolder ? '📁' : '📄'}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
      {file.mimeType && (
        <span className="hidden truncate font-mono text-xs text-grey-500 sm:inline">
          {file.mimeType}
        </span>
      )}
      {file.isFolder ? (
        <Button variant="outline" size="sm" onClick={() => onOpenFolder(file.id)}>
          Öffnen
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled={reading} onClick={() => onRead(file)}>
          Lesen
        </Button>
      )}
    </li>
  );
}

function ProviderCard({
  provider,
  pickerConfigured,
}: {
  provider: Provider;
  pickerConfigured: boolean;
}) {
  const queryClient = useQueryClient();
  const client = getContractsClient().connectorTest;
  const params = { provider: provider.provider };
  const [folderStack, setFolderStack] = useState<string[]>([]);
  const [pickedFiles, setPickedFiles] = useState<ConnectorTestFile[]>([]);
  const [readTarget, setReadTarget] = useState<string | null>(null);

  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: STATUS_KEY });

  const connect = useMutation({
    mutationFn: () => connectInPopup(provider.provider),
    onSettled: refreshStatus,
  });

  const probe = useMutation({
    mutationFn: async (folderId: string | null) =>
      unwrap(await client.probe({ params, body: { folderId } })),
  });

  const pick = useMutation({
    mutationFn: async () => {
      return pickGoogleFiles(unwrap(await client.picker()));
    },
    onSuccess: (files) => {
      if (files.length === 0) return;
      setPickedFiles(files.map((f) => ({ ...f, isFolder: false })));
    },
  });

  const read = useMutation({
    mutationFn: async (file: ConnectorTestFile) =>
      unwrap(
        await client.read({
          params,
          body: { fileId: file.id, name: file.name, mimeType: file.mimeType },
        })
      ),
  });

  const disconnect = useMutation({
    mutationFn: async () => unwrap(await client.disconnect({ params })),
    onSuccess: () => {
      setPickedFiles([]);
      setFolderStack([]);
      probe.reset();
      read.reset();
    },
    onSettled: refreshStatus,
  });

  const openFolder = (id: string) => {
    setFolderStack((stack) => [...stack, id]);
    probe.mutate(id);
  };

  const folderUp = () => {
    const next = folderStack.slice(0, -1);
    setFolderStack(next);
    probe.mutate(next.at(-1) ?? null);
  };

  const readFile = (file: ConnectorTestFile) => {
    setReadTarget(file.name);
    read.mutate(file);
  };

  const isGoogle = provider.provider === 'google';

  return (
    <section className="rounded-lg border border-grey-200 p-md dark:border-grey-700">
      <header className="mb-md flex flex-wrap items-center gap-sm">
        <h2 className="m-0 flex-1 text-xl font-semibold">{provider.label}</h2>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            provider.connected
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-grey-100 text-grey-700 dark:bg-grey-800 dark:text-grey-300'
          }`}
        >
          {provider.connected
            ? `verbunden${provider.connectedAt ? ` seit ${new Date(provider.connectedAt).toLocaleString('de-DE')}` : ''}`
            : 'nicht verbunden'}
        </span>
      </header>

      <div className="mb-md flex flex-wrap gap-sm">
        <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
          {connect.isPending
            ? 'Warte auf Popup…'
            : provider.connected
              ? 'Neu verbinden'
              : 'Verbinden'}
        </Button>
        <Button
          variant="outline"
          disabled={!provider.connected || probe.isPending}
          onClick={() => {
            setFolderStack([]);
            probe.mutate(null);
          }}
        >
          Token prüfen & Dateien listen
        </Button>
        {isGoogle && (
          <Button
            variant="outline"
            disabled={!provider.connected || !pickerConfigured || pick.isPending}
            onClick={() => pick.mutate()}
          >
            {pick.isPending ? 'Picker offen…' : 'Dateien im Google Picker wählen'}
          </Button>
        )}
        <Button
          variant="destructive"
          disabled={!provider.connected || disconnect.isPending}
          onClick={() => disconnect.mutate()}
        >
          Trennen
        </Button>
      </div>

      <div className="flex flex-col gap-sm">
        {connect.isError && <Result ok={false}>{errorText(connect.error)}</Result>}
        {disconnect.isError && <Result ok={false}>{errorText(disconnect.error)}</Result>}
        {pick.isError && <Result ok={false}>{errorText(pick.error)}</Result>}
        {probe.isError && <Result ok={false}>{errorText(probe.error)}</Result>}

        {probe.data && (
          <Result ok={probe.data.ok}>
            <p className="m-0 font-medium">
              {probe.data.ok
                ? `Token gültig — ${probe.data.files.length} Einträge`
                : 'Abruf fehlgeschlagen'}
            </p>
            {probe.data.error && (
              <p className="m-0 mt-xs break-words font-mono text-xs">{probe.data.error}</p>
            )}
            {isGoogle && probe.data.ok && (
              <p className="m-0 mt-xs text-xs">
                Mit <code>drive.file</code> erscheinen hier nur Dateien, die im Picker gewählt oder
                von der App angelegt wurden.
              </p>
            )}
          </Result>
        )}
        {probe.data?.ok && (
          <div>
            {folderStack.length > 0 && (
              <Button variant="ghost" size="sm" onClick={folderUp}>
                ← Zurück
              </Button>
            )}
            <ul className="m-0 list-none p-0">
              {probe.data.files.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  onOpenFolder={openFolder}
                  onRead={readFile}
                  reading={read.isPending}
                />
              ))}
            </ul>
          </div>
        )}

        {pickedFiles.length > 0 && (
          <div>
            <h3 className="m-0 mb-xs text-sm font-semibold">Im Picker gewählt</h3>
            <ul className="m-0 list-none p-0">
              {pickedFiles.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  onOpenFolder={openFolder}
                  onRead={readFile}
                  reading={read.isPending}
                />
              ))}
            </ul>
          </div>
        )}

        {read.isPending && <p className="m-0 text-sm text-grey-500">Lese „{readTarget}“…</p>}
        {read.isError && <Result ok={false}>{errorText(read.error)}</Result>}
        {read.data && !read.isPending && (
          <div>
            <h3 className="m-0 mb-xs text-sm font-semibold">
              „{readTarget}“ über @connect gelesen
            </h3>
            <ReadResult result={read.data} />
          </div>
        )}
      </div>
    </section>
  );
}

export function ConnectorTestView() {
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: async () => unwrap(await getContractsClient().connectorTest.status()),
  });

  if (status.isLoading) return <Skeleton className="h-40 w-full" />;
  if (status.isError) return <Result ok={false}>{errorText(status.error)}</Result>;
  if (!status.data) return null;

  return (
    <div className="flex flex-col gap-md">
      {!status.data.nangoConfigured && (
        <Result ok={false}>
          <code>NANGO_SECRET_KEY</code> ist in der API nicht gesetzt — nichts hier kann
          funktionieren.
        </Result>
      )}
      {!status.data.pickerConfigured && (
        <Result ok={false}>
          <code>GOOGLE_PICKER_API_KEY</code> / <code>GOOGLE_PICKER_APP_ID</code> fehlen in der API —
          der Google Picker bleibt aus.
        </Result>
      )}
      {status.data.providers.map((provider) => (
        <ProviderCard
          key={provider.provider}
          provider={provider}
          pickerConfigured={status.data.pickerConfigured}
        />
      ))}
    </div>
  );
}
