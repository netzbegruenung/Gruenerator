/**
 * Unified "Connectoren" surface (EXPERIMENTAL).
 *
 * One page for two connection architectures:
 *  - MCP servers (this feature) — external MCP endpoints, generic tool-loop.
 *  - Nango connections — OAuth'd cloud accounts (Google/Microsoft/Jira/Confluence)
 *    used by the `connect` chat intent for document retrieval.
 * Both are hand-picked to work out of the box with no complex app registration.
 */
import { Switch } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiServer, FiSearch, FiLock, FiCheck, FiLoader } from 'react-icons/fi';

import {
  useConnectionStatus,
  useCreateSessionToken,
  useDisconnectProvider,
  useTestConnection,
} from '../../connections/hooks/useConnections';
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

import type { ConnectionStatus } from '../../connections/lib/connectionsApi';

import { cn } from '@/utils/cn';

// Nango is disabled until its secret key handling on beta/prod is fixed
// (server 401s with unknown_account); the panel is MCP-only for now.
const NANGO_ENABLED = false;
const NANGO_PUBLIC_URL =
  (import.meta.env.VITE_NANGO_PUBLIC_URL as string | undefined) ?? 'https://nango.gruenerator.eu';
const NANGO_CATEGORY = 'Dateien & Cloud';
const CONNECTIONS_KEY = ['connections', 'status'] as const;

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

// ── Presentation helpers ─────────────────────────────────────────────────────

const BRAND: Record<string, string> = {
  Notion: '#0F0F0F',
  Coda: '#F46A54',
  'monday.com': '#FF3D57',
  Jamie: '#6366F1',
  Sally: '#4F46E5',
  HubSpot: '#FF7A59',
  Attio: '#1A1A1A',
  Statista: '#1F7BB6',
  SISTRIX: '#E5195F',
  Wix: '#116DFF',
  Webflow: '#146EF5',
  Zapier: '#FF4A00',
  'Google Maps': '#4285F4',
  'Google Workspace': '#4285F4',
  'Microsoft 365': '#0078D4',
  Jira: '#0052CC',
  Confluence: '#172B4D',
};

function brandColor(title: string): string {
  const hit = BRAND[title];
  if (hit) return hit;
  let h = 0;
  for (let i = 0; i < title.length; i++) h = title.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${((h % 360) + 360) % 360} 52% 45%)`;
}

const McpLogo = memo(({ title, size = 50 }: { title: string; size?: number }) => (
  <div
    className="flex-none flex items-center justify-center rounded-xl text-white font-bold select-none"
    style={{ background: brandColor(title), width: size, height: size, fontSize: size * 0.44 }}
    aria-hidden
  >
    {title.charAt(0).toUpperCase()}
  </div>
));
McpLogo.displayName = 'McpLogo';

const authLabel: Record<McpRegistryEntry['authHint'], string> = {
  none: 'Ohne Auth',
  bearer: 'Token',
  oauth: 'OAuth',
  unknown: '—',
};

const inputClass =
  'w-full px-md py-sm rounded-xl border border-grey-200 dark:border-grey-700 bg-background-pure text-sm text-foreground focus:border-primary-400 focus:outline-none transition-colors';

const authBadgeClass =
  'flex-none inline-flex items-center gap-1 px-2 py-1 rounded-full bg-grey-100 dark:bg-grey-800 text-grey-500 text-[11px] font-semibold border border-grey-200 dark:border-grey-700';

const connectBtnClass =
  'text-xs font-semibold px-md py-1.5 rounded-lg border border-primary text-primary-700 hover:bg-primary-50 transition-colors cursor-pointer';

/** A healthy (green) row border once the connector's test passed. */
const rowBorder = (healthy: boolean) =>
  healthy ? 'border-primary-400 dark:border-primary-600' : 'border-grey-200 dark:border-grey-700';

const ToolChips = memo(({ tools, max = 16 }: { tools: string[]; max?: number }) => {
  if (tools.length === 0) return null;
  const shown = tools.slice(0, max);
  const rest = tools.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((t) => (
        <span
          key={t}
          className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 text-[11px] font-medium border border-primary-100"
        >
          {t}
        </span>
      ))}
      {rest > 0 && <span className="text-[11px] text-grey-400 self-center">+{rest} weitere</span>}
    </div>
  );
});
ToolChips.displayName = 'ToolChips';

// ── Add-form ─────────────────────────────────────────────────────────────────

interface McpSectionProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

interface McpPrefill {
  name: string;
  url: string;
  authType: McpAuthType;
  /** DCR-less OAuth provider: show the app-registration guidance + setup link. */
  manual?: boolean;
  setupUrl?: string | null;
}

const McpAddForm = memo(
  ({ onSuccess, onError, prefill }: McpSectionProps & { prefill: McpPrefill | null }) => {
    const create = useCreateMcpServer();
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [authType, setAuthType] = useState<McpAuthType>('none');
    const [token, setToken] = useState('');
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [setupUrl, setSetupUrl] = useState<string | null>(null);
    const tokenRef = useRef<HTMLInputElement>(null);
    const redirectUri = `${window.location.origin}/api/mcp/auth/callback`;

    // A pick from the discover list fills the form so the user only confirms.
    useEffect(() => {
      if (prefill) {
        setName(prefill.name);
        setUrl(prefill.url);
        setAuthType(prefill.authType);
        setSetupUrl(prefill.setupUrl ?? null);
      }
    }, [prefill]);

    // Runs after the render in which the token input exists.
    useEffect(() => {
      if (prefill?.authType === 'bearer' && authType === 'bearer') {
        tokenRef.current?.focus({ preventScroll: true });
      }
    }, [prefill, authType]);

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
            setSetupUrl(null);
            onSuccess(
              authType === 'oauth'
                ? 'Hinzugefügt — jetzt „Autorisieren“ klicken.'
                : 'MCP-Server hinzugefügt'
            );
          },
          onError: (err) => onError(err instanceof Error ? err.message : 'Fehler'),
        }
      );
    };

    return (
      <form onSubmit={submit} className="flex flex-col gap-sm">
        <div className="flex flex-col sm:flex-row gap-sm">
          <input
            className={inputClass}
            placeholder="Name (z. B. Linear)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Server-URL (https://…/mcp)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-sm">
          <select
            className={cn(inputClass, 'sm:w-auto')}
            value={authType}
            onChange={(e) => setAuthType(e.target.value as McpAuthType)}
          >
            <option value="none">Keine Auth</option>
            <option value="bearer">Bearer-Token</option>
            <option value="oauth">OAuth</option>
          </select>
          {authType === 'bearer' && (
            <input
              ref={tokenRef}
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
            <p className="text-xs text-grey-500 leading-relaxed">
              {setupUrl ? (
                <>
                  Dieser Anbieter erfordert eine eigene App. 1) Im{' '}
                  <a
                    href={setupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700 underline"
                  >
                    Entwickler-Portal
                  </a>{' '}
                  eine App anlegen, 2) untenstehende Redirect-URI dort eintragen, 3) Client-ID +
                  Secret hier einfügen und speichern, dann „Autorisieren“.
                </>
              ) : (
                'Meist genügt „Autorisieren“ (dynamische Registrierung). Für Anbieter ohne DCR eine App mit dieser Redirect-URI anlegen und Client-ID/Secret eintragen:'
              )}
            </p>
            <code className="text-xs bg-grey-100 dark:bg-grey-800 px-sm py-1 rounded-lg break-all">
              {redirectUri}
            </code>
            <div className="flex flex-col sm:flex-row gap-sm">
              <input
                className={inputClass}
                placeholder={setupUrl ? 'Client-ID' : 'Client-ID (optional)'}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
              <input
                className={inputClass}
                type="password"
                placeholder={setupUrl ? 'Client-Secret' : 'Client-Secret (optional)'}
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
            'self-start px-lg py-sm rounded-xl font-medium text-sm cursor-pointer transition-all',
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

// ── Connected MCP server row ─────────────────────────────────────────────────

const McpServerRow = memo(
  ({ server, onSuccess, onError }: { server: McpServerSummary } & McpSectionProps) => {
    const del = useDeleteMcpServer();
    const update = useUpdateMcpServer();
    const test = useTestMcpServer();
    const queryClient = useQueryClient();
    const [testResult, setTestResult] = useState<{
      ok: boolean;
      tools: string[];
      error: string | null;
    } | null>(null);

    const needsAuth = server.authType === 'oauth' && !server.hasToken;
    const statusLabel = needsAuth ? 'Nicht autorisiert' : server.enabled ? 'Verbunden' : 'Pausiert';
    const dotClass = needsAuth
      ? 'bg-amber-500'
      : server.enabled
        ? 'bg-primary shadow-[0_0_0_3px_var(--color-primary-100)]'
        : 'bg-grey-400';

    const authorize = () => {
      void runOAuth(async () => server.id).then((result) => {
        void queryClient.invalidateQueries({ queryKey: mcpKeys.list() });
        if (result.status === 'success') onSuccess(`${server.name} verbunden`);
        else if (result.status === 'error') onError(result.error || 'OAuth fehlgeschlagen');
      });
    };

    const runTest = () => {
      test.mutate(server.id, {
        onSuccess: (r) =>
          setTestResult({
            ok: r.ok,
            tools: r.toolNames,
            error: r.ok ? null : (r.error ?? 'Verbindung fehlgeschlagen'),
          }),
        onError: (err) =>
          setTestResult({
            ok: false,
            tools: [],
            error: err instanceof Error ? err.message : 'Fehler',
          }),
      });
    };

    const healthy = testResult?.ok === true;

    return (
      <div
        className={cn(
          'flex flex-col gap-sm bg-background-pure border rounded-2xl p-md sm:px-lg shadow-sm transition-colors',
          rowBorder(healthy)
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-md">
          <div className="flex items-center gap-md min-w-0 flex-1">
            <McpLogo title={server.name} size={48} />
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-sm flex-wrap">
                <span className="text-base font-bold text-foreground-heading truncate">
                  {server.name}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-grey-500">
                  <span className={cn('w-1.5 h-1.5 rounded-full', dotClass)} />
                  <span className={cn(needsAuth ? 'text-amber-600' : 'text-primary-700')}>
                    {statusLabel}
                  </span>
                </span>
              </div>
              <span className="text-xs text-grey-400 font-mono truncate">{server.url}</span>
            </div>
          </div>
          <div className="flex items-center gap-md flex-wrap sm:flex-none sm:justify-end">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
              <Switch
                checked={server.enabled}
                onCheckedChange={(checked) =>
                  update.mutate(
                    { id: server.id, patch: { enabled: checked } },
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
                className="text-xs font-semibold px-sm py-1.5 rounded-lg border border-primary text-primary-700 hover:bg-primary-50 transition-colors cursor-pointer"
              >
                Autorisieren
              </button>
            )}
            <button
              type="button"
              onClick={runTest}
              disabled={test.isPending}
              className="text-xs font-medium text-grey-500 hover:text-foreground transition-colors bg-transparent border-none cursor-pointer disabled:opacity-50"
            >
              {test.isPending ? 'Teste…' : 'Testen'}
            </button>
            <button
              type="button"
              onClick={() =>
                del.mutate(server.id, {
                  onSuccess: () => onSuccess('Connector entfernt'),
                  onError: (err) => onError(err instanceof Error ? err.message : 'Fehler'),
                })
              }
              disabled={del.isPending}
              className="text-xs font-medium text-grey-400 hover:text-[var(--error-red)] transition-colors bg-transparent border-none cursor-pointer disabled:opacity-50"
            >
              Entfernen
            </button>
          </div>
        </div>
        {testResult &&
          (testResult.ok ? (
            <div className="flex flex-col gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                <FiCheck className="w-3.5 h-3.5" />
                {testResult.tools.length} Tools verfügbar
              </span>
              <ToolChips tools={testResult.tools} />
            </div>
          ) : (
            <span className="text-xs text-grey-500">✗ {testResult.error}</span>
          ))}
      </div>
    );
  }
);
McpServerRow.displayName = 'McpServerRow';

// ── Connected Nango account row ──────────────────────────────────────────────

const NangoRow = memo(
  ({
    provider,
    onDisconnect,
    isDisconnecting,
    onError,
  }: {
    provider: ConnectionStatus;
    onDisconnect: (key: string) => void;
    isDisconnecting: boolean;
    onError: (message: string) => void;
  }) => {
    const test = useTestConnection();
    const [testResult, setTestResult] = useState<{
      ok: boolean;
      tools: string[];
      error: string | null;
    } | null>(null);

    const runTest = () => {
      test.mutate(provider.provider, {
        onSuccess: (r) => setTestResult({ ok: r.ok, tools: r.tools, error: r.ok ? null : r.error }),
        onError: (err) => {
          const msg = err instanceof Error ? err.message : 'Fehler';
          setTestResult({ ok: false, tools: [], error: msg });
          onError(msg);
        },
      });
    };

    const healthy = testResult?.ok === true;

    return (
      <div
        className={cn(
          'flex flex-col gap-sm bg-background-pure border rounded-2xl p-md sm:px-lg shadow-sm transition-colors',
          rowBorder(healthy)
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-md">
          <div className="flex items-center gap-md min-w-0 flex-1">
            <McpLogo title={provider.label} size={48} />
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-sm flex-wrap">
                <span className="text-base font-bold text-foreground-heading truncate">
                  {provider.label}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_0_3px_var(--color-primary-100)]" />
                  Verbunden
                </span>
              </div>
              <span className="text-xs text-grey-400 truncate">{provider.services.join(', ')}</span>
            </div>
          </div>
          <div className="flex items-center gap-md flex-wrap sm:flex-none sm:justify-end">
            <button
              type="button"
              onClick={runTest}
              disabled={test.isPending}
              className="text-xs font-medium text-grey-500 hover:text-foreground transition-colors bg-transparent border-none cursor-pointer disabled:opacity-50"
            >
              {test.isPending ? 'Teste…' : 'Testen'}
            </button>
            <button
              type="button"
              onClick={() => onDisconnect(provider.provider)}
              disabled={isDisconnecting}
              className="text-xs font-medium text-grey-400 hover:text-[var(--error-red)] transition-colors bg-transparent border-none cursor-pointer disabled:opacity-50"
            >
              {isDisconnecting ? <FiLoader className="animate-spin w-3.5 h-3.5" /> : 'Trennen'}
            </button>
          </div>
        </div>
        {testResult &&
          (testResult.ok ? (
            <div className="flex flex-col gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                <FiCheck className="w-3.5 h-3.5" />
                Verbindung aktiv — nutzbar im Chat
              </span>
              <ToolChips tools={testResult.tools} />
            </div>
          ) : (
            <span className="text-xs text-grey-500">✗ {testResult.error}</span>
          ))}
      </div>
    );
  }
);
NangoRow.displayName = 'NangoRow';

// ── Available cards ──────────────────────────────────────────────────────────

const CardShell = memo(
  ({
    title,
    description,
    badge,
    recommended,
    category,
    connecting,
    onConnect,
  }: {
    title: string;
    description: string | null | undefined;
    badge: string;
    recommended: boolean;
    category: string | undefined;
    connecting: boolean;
    onConnect: () => void;
  }) => (
    <div className="flex flex-col bg-background-pure border border-grey-200 dark:border-grey-700 rounded-2xl p-md transition-all hover:shadow-lg hover:border-primary-300 hover:-translate-y-0.5">
      <div className="flex items-start gap-md">
        <McpLogo title={title} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-sm flex-wrap">
            <span className="text-[15px] font-bold text-foreground-heading truncate">{title}</span>
            {recommended && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-[11px] font-semibold border border-primary-100">
                Empfohlen
              </span>
            )}
          </div>
          {description && (
            <p className="mt-1.5 text-xs leading-relaxed text-grey-500 line-clamp-2">
              {description}
            </p>
          )}
        </div>
        <span className={authBadgeClass}>
          <FiLock className="w-2.5 h-2.5" />
          {badge}
        </span>
      </div>
      <div className="flex items-center justify-between gap-sm mt-md">
        <span className="text-[11px] text-grey-400 font-medium">{category}</span>
        {connecting ? (
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-primary">
            <span className="w-3.5 h-3.5 border-2 border-primary-200 border-t-primary rounded-full animate-spin" />
            Verbindung wird hergestellt …
          </span>
        ) : (
          <button type="button" onClick={onConnect} className={connectBtnClass}>
            Verbinden
          </button>
        )}
      </div>
    </div>
  )
);
CardShell.displayName = 'CardShell';

// ── Unified section ──────────────────────────────────────────────────────────

type AvailableItem =
  | { kind: 'mcp'; key: string; category: string | undefined; entry: McpRegistryEntry }
  | { kind: 'nango'; key: string; category: string; provider: ConnectionStatus };

const McpSection = memo(({ onSuccess, onError }: McpSectionProps) => {
  const { data: servers = [], isLoading } = useMcpServers();
  const { data: nangoProviders = [] } = useConnectionStatus(NANGO_ENABLED);
  const createToken = useCreateSessionToken();
  const disconnect = useDisconnectProvider();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('Alle');
  const [connecting, setConnecting] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<McpPrefill | null>(null);
  const addFormRef = useRef<HTMLDivElement>(null);
  const { data: registry, isLoading: registryLoading } = useMcpRegistry(search);
  const queryClient = useQueryClient();

  const refreshMcp = () => void queryClient.invalidateQueries({ queryKey: mcpKeys.list() });
  const refreshNango = () => void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });

  const connectedUrls = useMemo(() => new Set(servers.map((s) => s.url)), [servers]);
  const connectedNango = nangoProviders.filter((p) => p.connected);

  const q = search.trim().toLowerCase();
  const available = useMemo<AvailableItem[]>(() => {
    const mcp: AvailableItem[] = (registry?.recommended ?? [])
      .filter((e) => !connectedUrls.has(e.url))
      .map((entry) => ({ kind: 'mcp', key: entry.url, category: entry.category, entry }));
    const nango: AvailableItem[] = nangoProviders
      .filter((p) => !p.connected)
      .filter(
        (p) =>
          !q ||
          p.label.toLowerCase().includes(q) ||
          p.services.join(' ').toLowerCase().includes(q) ||
          NANGO_CATEGORY.toLowerCase().includes(q)
      )
      .map((provider) => ({
        kind: 'nango',
        key: `nango:${provider.provider}`,
        category: NANGO_CATEGORY,
        provider,
      }));
    return [...mcp, ...nango];
  }, [registry, connectedUrls, nangoProviders, q]);

  const cats = useMemo(() => {
    const set = new Set<string>();
    for (const it of available) if (it.category) set.add(it.category);
    return ['Alle', ...Array.from(set)];
  }, [available]);
  const filtered = cat === 'Alle' ? available : available.filter((it) => it.category === cat);
  const activeCount = servers.filter((s) => s.enabled).length + connectedNango.length;

  const handlePickMcp = (entry: McpRegistryEntry) => {
    if (entry.authHint === 'oauth') {
      // Providers that reject DCR need a pre-registered client → route to the
      // form (redirect URI + setup link + Client-ID/Secret), not auto-OAuth.
      if (entry.requiresManualRegistration) {
        setPrefill({
          name: entry.title,
          url: entry.url,
          authType: 'oauth',
          manual: true,
          setupUrl: entry.setupUrl,
        });
        requestAnimationFrame(() =>
          addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        );
        return;
      }
      // Popup opens synchronously inside runOAuth; create the server, then auth.
      setConnecting(entry.url);
      void runOAuth(async () => {
        const server = await createMcpServer({
          name: entry.title,
          url: entry.url,
          authType: 'oauth',
        });
        return server.id;
      }).then((result) => {
        setConnecting(null);
        refreshMcp();
        if (result.status === 'success') onSuccess(`${entry.title} verbunden`);
        else if (result.status === 'error') onError(result.error || 'OAuth fehlgeschlagen');
      });
      return;
    }
    if (entry.authHint === 'none') {
      createMcpServer({ name: entry.title, url: entry.url, authType: 'none' })
        .then(() => {
          refreshMcp();
          onSuccess(`${entry.title} verbunden`);
        })
        .catch((e) => onError(e instanceof Error ? e.message : 'Fehler'));
      return;
    }
    // bearer / unknown → prefill the form so the user pastes a token. New object
    // identity each pick so the form's effect re-fires even for the same server.
    setPrefill({ name: entry.title, url: entry.url, authType: 'bearer' });
    requestAnimationFrame(() =>
      addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  };

  const handleConnectNango = useCallback(
    async (providerKey: string) => {
      try {
        setConnecting(`nango:${providerKey}`);
        const token = await createToken.mutateAsync();
        const connectUrl = `${NANGO_PUBLIC_URL}/oauth/connect/${providerKey}?connect_session_token=${encodeURIComponent(token)}`;
        const popup = window.open(connectUrl, '_blank', 'width=600,height=700');
        if (popup) {
          const interval = setInterval(() => {
            if (popup.closed) {
              clearInterval(interval);
              setConnecting(null);
              refreshNango();
            }
          }, 1000);
        } else {
          setConnecting(null);
        }
        onSuccess('OAuth-Flow gestartet');
      } catch {
        setConnecting(null);
        onError('Verbindung konnte nicht gestartet werden');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [createToken]
  );

  const handleDisconnectNango = useCallback(
    async (providerKey: string) => {
      try {
        await disconnect.mutateAsync(providerKey);
        onSuccess('Verbindung getrennt');
      } catch {
        onError('Verbindung konnte nicht getrennt werden');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disconnect]
  );

  const hasConnected = servers.length > 0 || connectedNango.length > 0;

  return (
    <div className="mt-xl">
      {/* Header */}
      <div className="flex items-center gap-md">
        <div className="w-[52px] h-[52px] flex-none rounded-[14px] bg-primary-50 border border-primary-100 flex items-center justify-center text-primary">
          <FiServer className="w-6 h-6" />
        </div>
        <div className="flex items-center gap-sm flex-wrap">
          <h2 className="text-2xl font-semibold text-foreground-heading m-0 tracking-tight">
            Connectoren
          </h2>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-50 text-secondary-700 text-xs font-semibold border border-secondary-100">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary-500" />
            Experimentell
          </span>
        </div>
      </div>
      <p className="mt-sm max-w-xl text-sm text-grey-500 leading-relaxed">
        Verbinde externe Tools und Konten und nutze sie direkt im Chat – MCP-Server per{' '}
        <span className="text-foreground font-semibold">@mcp</span>, verbundene Konten über den
        Datei-Kontext. Ein Klick startet die Verbindung.
      </p>

      {isLoading && <p className="text-sm text-grey-400 text-center py-md">Lade…</p>}

      {/* Connected */}
      <div className="mt-xl">
        <div className="flex items-baseline gap-sm mb-sm">
          <h3 className="m-0 text-xs font-bold tracking-widest uppercase text-grey-500">
            Verbunden
          </h3>
          {hasConnected && <span className="text-xs text-grey-400">{activeCount} aktiv</span>}
        </div>
        {hasConnected ? (
          <div className="flex flex-col gap-sm">
            {servers.map((server) => (
              <McpServerRow
                key={server.id}
                server={server}
                onSuccess={onSuccess}
                onError={onError}
              />
            ))}
            {connectedNango.map((provider) => (
              <NangoRow
                key={provider.provider}
                provider={provider}
                onDisconnect={handleDisconnectNango}
                isDisconnecting={disconnect.isPending && disconnect.variables === provider.provider}
                onError={onError}
              />
            ))}
          </div>
        ) : (
          !isLoading && (
            <div className="border border-dashed border-grey-300 dark:border-grey-700 rounded-2xl p-lg text-center text-sm text-grey-500 bg-background-pure">
              Noch nichts verbunden. Wähle unten einen Dienst aus, um zu starten.
            </div>
          )
        )}
      </div>

      {/* Available */}
      <div className="mt-xl">
        <div className="flex items-baseline justify-between gap-sm mb-md flex-wrap">
          <h3 className="m-0 text-lg font-bold text-foreground-heading tracking-tight">
            Dienste verbinden
          </h3>
          <span className="text-xs text-grey-400">{available.length} verfügbar</span>
        </div>

        {/* Search */}
        <div className="relative mb-md">
          <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-grey-400 pointer-events-none" />
          <input
            className={cn(inputClass, 'h-12 pl-11')}
            placeholder="Dienst suchen (z. B. Notion, Google Drive, HubSpot) …"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Category pills */}
        {cats.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-md">
            {cats.map((c) => {
              const active = c === cat;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCat(c)}
                  className={cn(
                    'px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors border',
                    active
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-background-pure text-foreground border-grey-200 dark:border-grey-700 hover:border-primary-300'
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
        )}

        {registryLoading && <p className="text-sm text-grey-400 text-center py-md">Lade…</p>}

        {!registryLoading && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
            {filtered.map((it) =>
              it.kind === 'mcp' ? (
                <CardShell
                  key={it.key}
                  title={it.entry.title}
                  description={it.entry.description}
                  badge={authLabel[it.entry.authHint]}
                  recommended={it.entry.recommended}
                  category={it.category}
                  connecting={connecting === it.entry.url}
                  onConnect={() => handlePickMcp(it.entry)}
                />
              ) : (
                <CardShell
                  key={it.key}
                  title={it.provider.label}
                  description={it.provider.services.join(', ')}
                  badge="Konto"
                  recommended={false}
                  category={it.category}
                  connecting={connecting === it.key}
                  onConnect={() => void handleConnectNango(it.provider.provider)}
                />
              )
            )}
          </div>
        )}

        {!registryLoading && filtered.length === 0 && (
          <div className="border border-dashed border-grey-300 dark:border-grey-700 rounded-2xl p-lg text-center bg-background-pure">
            <div className="text-sm font-semibold text-foreground">Kein Dienst gefunden</div>
            <div className="mt-1 text-xs text-grey-500">
              Passe die Suche an oder wähle eine andere Kategorie.
            </div>
          </div>
        )}
      </div>

      {/* Custom MCP server */}
      <div ref={addFormRef} className="mt-xl scroll-mt-24">
        <h3 className="m-0 mb-sm text-xs font-bold tracking-widest uppercase text-grey-500">
          {prefill ? `${prefill.name} verbinden` : 'Eigenen MCP-Server hinzufügen'}
        </h3>
        <McpAddForm onSuccess={onSuccess} onError={onError} prefill={prefill} />
      </div>
    </div>
  );
});
McpSection.displayName = 'McpSection';

export default McpSection;
