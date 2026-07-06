import { useQueryClient } from '@tanstack/react-query';
import { memo, useEffect, useState } from 'react';
import { FiServer } from 'react-icons/fi';

import {
  useMcpServers,
  useCreateMcpServer,
  useDeleteMcpServer,
  useUpdateMcpServer,
  useTestMcpServer,
  useMcpRegistry,
  mcpKeys,
} from '../hooks/useMcpServers';
import {
  createMcpServer,
  startMcpOAuth,
  type McpAuthType,
  type McpRegistryEntry,
  type McpServerSummary,
} from '../lib/mcpApi';
import { openOAuthPopup, waitForOAuthPopup, type McpOAuthResult } from '../lib/mcpOAuthPopup';

import { cn } from '@/utils/cn';

/**
 * Drive the OAuth popup. The popup MUST be opened synchronously (first line,
 * before any await) or the browser blocks it; `resolveServerId` then creates or
 * looks up the server before we navigate the popup to the provider.
 */
async function runOAuth(resolveServerId: () => Promise<string>): Promise<McpOAuthResult> {
  const popup = openOAuthPopup();
  if (!popup) return { status: 'error', error: 'Popup wurde blockiert' };
  try {
    const serverId = await resolveServerId();
    popup.location.href = await startMcpOAuth(serverId);
    return await waitForOAuthPopup(popup);
  } catch (e) {
    popup.close();
    return { status: 'error', error: e instanceof Error ? e.message : 'Fehler' };
  }
}

interface McpSectionProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

interface McpPrefill {
  name: string;
  url: string;
}

const inputClass =
  'w-full px-md py-sm rounded-lg border border-grey-300 dark:border-grey-700 bg-background-pure text-sm text-foreground';

const McpAddForm = memo(
  ({ onSuccess, onError, prefill }: McpSectionProps & { prefill: McpPrefill | null }) => {
    const create = useCreateMcpServer();
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [authType, setAuthType] = useState<McpAuthType>('none');
    const [token, setToken] = useState('');
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const redirectUri = `${window.location.origin}/api/mcp/auth/callback`;

    // A pick from the discover list fills the form so the user only confirms.
    useEffect(() => {
      if (prefill) {
        setName(prefill.name);
        setUrl(prefill.url);
      }
    }, [prefill]);

    const submit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !url.trim()) return;
      create.mutate(
        {
          name: name.trim(),
          url: url.trim(),
          authType,
          token: authType === 'bearer' ? token.trim() || null : null,
          oauthClientId: authType === 'oauth' ? clientId.trim() || null : null,
          oauthClientSecret: authType === 'oauth' ? clientSecret.trim() || null : null,
        },
        {
          onSuccess: () => {
            setName('');
            setUrl('');
            setAuthType('none');
            setToken('');
            setClientId('');
            setClientSecret('');
            onSuccess(
              authType === 'oauth'
                ? 'Hinzugefügt — jetzt „Autorisieren" klicken.'
                : 'MCP-Server hinzugefügt'
            );
          },
          onError: (err) => onError(err instanceof Error ? err.message : 'Fehler'),
        }
      );
    };

    return (
      <form onSubmit={submit} className="flex flex-col gap-sm">
        <input
          className={inputClass}
          placeholder="Name (z.B. Linear)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="Server-URL (https://…/mcp)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="flex gap-sm">
          <select
            className={cn(inputClass, 'w-auto')}
            value={authType}
            onChange={(e) => setAuthType(e.target.value as McpAuthType)}
          >
            <option value="none">Keine Auth</option>
            <option value="bearer">Bearer-Token</option>
            <option value="oauth">OAuth</option>
          </select>
          {authType === 'bearer' && (
            <input
              className={inputClass}
              type="password"
              placeholder="Token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          )}
        </div>
        {authType === 'oauth' && (
          <div className="flex flex-col gap-xs">
            <p className="text-xs text-grey-400">
              Meist genügt „Autorisieren“ (dynamische Registrierung). Für Anbieter ohne DCR (z.B.
              Canva) eine App mit dieser Redirect-URI anlegen und Client-ID/Secret eintragen:
            </p>
            <code className="text-xs bg-grey-100 dark:bg-grey-800 px-sm py-0.5 rounded break-all">
              {redirectUri}
            </code>
            <div className="flex gap-sm">
              <input
                className={inputClass}
                placeholder="Client-ID (optional)"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
              <input
                className={inputClass}
                type="password"
                placeholder="Client-Secret (optional)"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>
          </div>
        )}
        <button
          type="submit"
          disabled={create.isPending || !name.trim() || !url.trim()}
          className={cn(
            'self-start px-lg py-sm rounded-lg font-medium text-sm cursor-pointer transition-all',
            'bg-none border border-grey-300 text-foreground hover:bg-grey-50 hover:border-grey-400',
            'disabled:opacity-50'
          )}
        >
          {create.isPending ? 'Füge hinzu…' : 'MCP-Server hinzufügen'}
        </button>
      </form>
    );
  }
);
McpAddForm.displayName = 'McpAddForm';

const McpServerRow = memo(
  ({ server, onSuccess, onError }: { server: McpServerSummary } & McpSectionProps) => {
    const del = useDeleteMcpServer();
    const update = useUpdateMcpServer();
    const test = useTestMcpServer();
    const queryClient = useQueryClient();
    const [testMsg, setTestMsg] = useState<string | null>(null);

    const needsAuth = server.authType === 'oauth' && !server.hasToken;
    const authorize = () => {
      void runOAuth(async () => server.id).then((result) => {
        void queryClient.invalidateQueries({ queryKey: mcpKeys.list() });
        if (result.status === 'success') onSuccess(`${server.name} verbunden`);
        else if (result.status === 'error') onError(result.error || 'OAuth fehlgeschlagen');
      });
    };

    const runTest = () => {
      setTestMsg('Teste…');
      test.mutate(server.id, {
        onSuccess: (r) =>
          setTestMsg(
            r.ok
              ? `✓ ${r.toolCount} Tool(s): ${r.toolNames.slice(0, 5).join(', ')}`
              : `✗ ${r.error ?? 'Verbindung fehlgeschlagen'}`
          ),
        onError: (err) => setTestMsg(`✗ ${err instanceof Error ? err.message : 'Fehler'}`),
      });
    };

    return (
      <div className="flex flex-col gap-xs p-md rounded-lg border border-grey-200 dark:border-grey-700 bg-background-pure">
        <div className="flex items-center justify-between gap-sm">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-foreground-heading truncate">
              {server.name}
            </span>
            <span className="text-xs text-grey-400 truncate">{server.url}</span>
          </div>
          <div className="flex items-center gap-md shrink-0">
            <label className="flex items-center gap-xs text-xs text-grey-500 cursor-pointer">
              <input
                type="checkbox"
                checked={server.enabled}
                onChange={(e) =>
                  update.mutate(
                    { id: server.id, patch: { enabled: e.target.checked } },
                    { onError: (err) => onError(err instanceof Error ? err.message : 'Fehler') }
                  )
                }
              />
              Aktiv
            </label>
            {needsAuth && (
              <button
                type="button"
                onClick={authorize}
                className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors bg-transparent border-none cursor-pointer"
              >
                Autorisieren
              </button>
            )}
            <button
              type="button"
              onClick={runTest}
              disabled={test.isPending}
              className="text-xs text-grey-400 hover:text-foreground transition-colors bg-transparent border-none cursor-pointer"
            >
              Testen
            </button>
            <button
              type="button"
              onClick={() =>
                del.mutate(server.id, {
                  onSuccess: () => onSuccess('MCP-Server entfernt'),
                  onError: (err) => onError(err instanceof Error ? err.message : 'Fehler'),
                })
              }
              disabled={del.isPending}
              className="text-xs text-grey-400 hover:text-[var(--error-red)] transition-colors bg-transparent border-none cursor-pointer"
            >
              Entfernen
            </button>
          </div>
        </div>
        {testMsg && <span className="text-xs text-grey-500">{testMsg}</span>}
      </div>
    );
  }
);
McpServerRow.displayName = 'McpServerRow';

const authBadge: Record<McpRegistryEntry['authHint'], string | null> = {
  none: null,
  bearer: 'Token',
  oauth: 'OAuth',
  unknown: null,
};

const McpRegistryCard = memo(
  ({ entry, onPick }: { entry: McpRegistryEntry; onPick: (e: McpRegistryEntry) => void }) => {
    const badge = authBadge[entry.authHint];
    return (
      <button
        type="button"
        onClick={() => onPick(entry)}
        className={cn(
          'flex flex-col gap-0.5 items-start text-left p-md rounded-lg border cursor-pointer transition-all',
          'border-grey-200 dark:border-grey-700 bg-background-pure hover:border-primary-400'
        )}
      >
        <div className="flex items-center gap-sm w-full">
          <span className="text-sm font-medium text-foreground-heading truncate">
            {entry.title}
          </span>
          {entry.recommended && (
            <span className="text-[10px] bg-primary-100 text-primary-700 px-xs py-0.5 rounded-full">
              Empfohlen
            </span>
          )}
          {badge && (
            <span className="text-[10px] bg-grey-100 dark:bg-grey-800 text-grey-500 px-xs py-0.5 rounded-full ml-auto">
              {badge}
            </span>
          )}
        </div>
        {entry.description && (
          <span className="text-xs text-grey-400 line-clamp-2">{entry.description}</span>
        )}
      </button>
    );
  }
);
McpRegistryCard.displayName = 'McpRegistryCard';

const McpDiscover = memo(({ onPick }: { onPick: (e: McpRegistryEntry) => void }) => {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useMcpRegistry(search);
  const servers = data?.recommended ?? [];

  return (
    <div className="flex flex-col gap-sm mb-md">
      <span className="text-xs font-medium text-grey-500 uppercase tracking-wide">
        Offizielle Server verbinden
      </span>
      <input
        className={inputClass}
        placeholder="Server suchen (z.B. Canva, Notion, GitHub)…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {isLoading && <p className="text-sm text-grey-400 text-center py-sm">Lade…</p>}
      {!isLoading && servers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
          {servers.map((entry) => (
            <McpRegistryCard key={entry.url} entry={entry} onPick={onPick} />
          ))}
        </div>
      )}
      {!isLoading && search && servers.length === 0 && (
        <p className="text-xs text-grey-400 py-sm">Kein Server gefunden.</p>
      )}
    </div>
  );
});
McpDiscover.displayName = 'McpDiscover';

const McpSection = memo(({ onSuccess, onError }: McpSectionProps) => {
  const { data: servers = [], isLoading } = useMcpServers();
  const [prefill, setPrefill] = useState<McpPrefill | null>(null);
  const queryClient = useQueryClient();

  const refresh = () => void queryClient.invalidateQueries({ queryKey: mcpKeys.list() });

  const handlePick = (entry: McpRegistryEntry) => {
    if (entry.authHint === 'oauth') {
      // Popup opens synchronously inside runOAuth; create the server, then auth.
      void runOAuth(async () => {
        const server = await createMcpServer({
          name: entry.title,
          url: entry.url,
          authType: 'oauth',
        });
        return server.id;
      }).then((result) => {
        refresh();
        if (result.status === 'success') onSuccess(`${entry.title} verbunden`);
        else if (result.status === 'error') onError(result.error || 'OAuth fehlgeschlagen');
      });
      return;
    }
    if (entry.authHint === 'none') {
      createMcpServer({ name: entry.title, url: entry.url, authType: 'none' })
        .then(() => {
          refresh();
          onSuccess(`${entry.title} verbunden`);
        })
        .catch((e) => onError(e instanceof Error ? e.message : 'Fehler'));
      return;
    }
    // bearer / unknown → prefill the form so the user pastes a token. New object
    // identity each pick so the form's effect re-fires even for the same server.
    setPrefill({ name: entry.title, url: entry.url });
  };

  return (
    <div className="mt-xl">
      <div className="flex items-center gap-sm mb-xs">
        <FiServer className="w-6 h-6 text-foreground-heading" />
        <h2 className="text-xl font-semibold text-foreground-heading m-0">MCP-Server</h2>
        <span className="text-xs bg-secondary-100 text-secondary-700 px-sm py-0.5 rounded-full font-medium">
          Experimentell
        </span>
      </div>
      <p className="text-xs text-grey-400 mb-md">
        Verbinde externe Tools (MCP-Server). Im Chat mit „@mcp“ nutzbar. Klick auf einen Dienst
        startet die Verbindung (OAuth, Token oder ohne Auth).
      </p>

      {isLoading && <p className="text-sm text-grey-400 text-center py-sm">Lade…</p>}

      {!isLoading && servers.length > 0 && (
        <div className="flex flex-col gap-sm mb-md">
          {servers.map((server) => (
            <McpServerRow key={server.id} server={server} onSuccess={onSuccess} onError={onError} />
          ))}
        </div>
      )}

      <McpDiscover onPick={handlePick} />

      <McpAddForm onSuccess={onSuccess} onError={onError} prefill={prefill} />
    </div>
  );
});
McpSection.displayName = 'McpSection';

export default McpSection;
