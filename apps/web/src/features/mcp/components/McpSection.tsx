/**
 * "Konnektoren" surface (EXPERIMENTAL) — connect external MCP servers and use
 * them in chat via per-server mentions (@notion, @brevo, …). A curated directory
 * of hand-picked, remote-hosted servers plus a custom-server form. Auth is
 * `none`, `bearer` (token dialog) or `oauth` (PKCE/DCR popup).
 */
import { mcpBrandColor } from '@gruenerator/shared/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Switch,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { FiServer, FiSearch, FiCheck, FiRefreshCw } from 'react-icons/fi';
import {
  SiNotion,
  SiCoda,
  SiHubspot,
  SiBrevo,
  SiStatista,
  SiZapier,
  SiGooglemaps,
  SiTypeform,
  SiZoom,
  SiTodoist,
  SiMiro,
  SiIfttt,
  SiBookingdotcom,
  SiExpedia,
  SiTrivago,
} from 'react-icons/si';

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
  deleteMcpServer,
  fetchMcpServers,
  startMcpOAuth,
  testMcpServer,
  McpOAuthStartError,
  type McpAuthType,
  type McpOAuthErrorCode,
  type McpRegistryEntry,
  type McpServerSummary,
} from '../lib/mcpApi';
import { openOAuthPopup, waitForOAuthPopup } from '../lib/mcpOAuthPopup';

import type { IconType } from 'react-icons';

import { cn } from '@/utils/cn';

interface RunOAuthResult {
  status: 'success' | 'error' | 'dismissed' | 'no_auth_required';
  serverId?: string;
  error?: string;
  code?: McpOAuthErrorCode;
  /** True when oauthStart itself failed (before any provider login) — the
   * caller may roll back a server it just created for this attempt. */
  startFailed?: boolean;
}

/**
 * Drive the OAuth popup. The popup MUST be opened synchronously (first line,
 * before any await) or the browser blocks it; `resolveServerId` then creates or
 * looks up the server before we navigate the popup to the provider. Servers
 * that turn out to need no auth at all resolve as `no_auth_required` (the
 * backend already flipped them to authType 'none').
 */
async function runOAuth(resolveServerId: () => Promise<string>): Promise<RunOAuthResult> {
  const popup = openOAuthPopup();
  if (!popup) return { status: 'error', error: 'Popup wurde blockiert' };
  try {
    const serverId = await resolveServerId();
    const start = await startMcpOAuth(serverId);
    if (start.status === 'no_auth_required') {
      popup.close();
      return { status: 'no_auth_required' };
    }
    popup.location.href = start.authorizationUrl;
    return await waitForOAuthPopup(popup, async () => {
      const servers = await fetchMcpServers();
      const s = servers.find((x) => x.id === serverId);
      return !!s && (s.authType !== 'oauth' || s.hasToken);
    });
  } catch (e) {
    popup.close();
    // waitForOAuthPopup never rejects, so everything caught here failed before
    // the provider login (create/start phase).
    return {
      status: 'error',
      error: e instanceof Error ? e.message : 'Fehler',
      startFailed: true,
      ...(e instanceof McpOAuthStartError && e.code ? { code: e.code } : {}),
    };
  }
}

// ── Presentation helpers ─────────────────────────────────────────────────────

// Real vendor logos where Simple Icons ships one; keyword-matched so it works on
// both a title ("Notion") and a connected server's host ("mcp.notion.com"). Any
// service without a match keeps the coloured-monogram fallback below.
const BRAND_ICONS: ReadonlyArray<readonly [RegExp, IconType]> = [
  [/notion/i, SiNotion],
  [/coda/i, SiCoda],
  [/hubspot/i, SiHubspot],
  [/brevo/i, SiBrevo],
  [/statista/i, SiStatista],
  [/zapier/i, SiZapier],
  [/google\s*maps|mapstools|maps\.google/i, SiGooglemaps],
  [/typeform/i, SiTypeform],
  [/zoom/i, SiZoom],
  [/todoist/i, SiTodoist],
  [/miro/i, SiMiro],
  [/ifttt/i, SiIfttt],
  [/booking/i, SiBookingdotcom],
  [/expedia/i, SiExpedia],
  [/trivago/i, SiTrivago],
];

function brandIcon(label: string): IconType | null {
  for (const [re, Icon] of BRAND_ICONS) if (re.test(label)) return Icon;
  return null;
}

const McpLogo = memo(({ title, size = 50 }: { title: string; size?: number }) => {
  const Icon = brandIcon(title);
  return (
    <div
      className="flex-none flex items-center justify-center rounded-xl text-white font-bold select-none"
      style={{ background: mcpBrandColor(title), width: size, height: size, fontSize: size * 0.44 }}
      aria-hidden
    >
      {Icon ? <Icon size={size * 0.5} /> : title.charAt(0).toUpperCase()}
    </div>
  );
});
McpLogo.displayName = 'McpLogo';

const inputClass =
  'w-full px-md py-sm rounded-xl border border-grey-200 dark:border-grey-700 bg-background-pure text-sm text-foreground focus:border-primary-400 focus:outline-none transition-colors';

const connectBtnClass =
  'text-xs font-semibold px-md py-1.5 rounded-lg border border-primary text-primary-700 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-950/30 transition-colors cursor-pointer';

const chipClass =
  'inline-flex items-center px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 border border-primary-100 dark:bg-primary-950/30 dark:text-primary-300 dark:border-primary-800 text-[11px] font-medium';

const okTextClass = 'text-primary-700 dark:text-primary-400';

const secondaryBtnClass =
  'px-lg py-sm rounded-xl font-medium text-sm cursor-pointer bg-transparent border border-grey-300 text-foreground hover:bg-grey-50 dark:border-grey-600 dark:hover:bg-grey-800 transition-colors';

const dotOnClass =
  'bg-primary shadow-[0_0_0_3px_var(--color-primary-100)] dark:shadow-[0_0_0_3px_var(--color-primary-950)]';

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
        <span key={t} className={chipClass}>
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
    // Manual adds are always tokenless; OAuth is only reached via a prefill from
    // the directory (providers that need pre-registration).
    const [authType, setAuthType] = useState<McpAuthType>('none');
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [setupUrl, setSetupUrl] = useState<string | null>(null);
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

    const submit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !url.trim()) return;
      create.mutate(
        {
          name: name.trim(),
          url: url.trim(),
          authType,
          token: null,
          oauthClientId: authType === 'oauth' ? clientId.trim() || null : null,
          oauthClientSecret: authType === 'oauth' ? clientSecret.trim() || null : null,
        },
        {
          onSuccess: () => {
            setName('');
            setUrl('');
            setAuthType('none');
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
                    className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline"
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
          className={cn(secondaryBtnClass, 'self-start disabled:opacity-50')}
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
    const dotClass = needsAuth ? 'bg-amber-500' : server.enabled ? dotOnClass : 'bg-grey-400';

    const authorize = () => {
      void runOAuth(async () => server.id).then((result) => {
        void queryClient.invalidateQueries({ queryKey: mcpKeys.list() });
        if (result.status === 'success') onSuccess(`${server.name} verbunden`);
        else if (result.status === 'no_auth_required')
          onSuccess(`${server.name} verbunden — der Server benötigt keine Anmeldung`);
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
                  <span
                    className={cn(needsAuth ? 'text-amber-600 dark:text-amber-400' : okTextClass)}
                  >
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
              <button type="button" onClick={authorize} className={connectBtnClass}>
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
                  onSuccess: () => onSuccess('Konnektor entfernt'),
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
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-semibold',
                  okTextClass
                )}
              >
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

// ── Available cards ──────────────────────────────────────────────────────────

// Compact one-line card: logo + name + connect. No auth badge, description or
// category (the section heading already carries the category).
const CardShell = memo(
  ({
    title,
    connecting,
    onConnect,
  }: {
    title: string;
    connecting: boolean;
    onConnect: () => void;
  }) => (
    <div className="flex items-center gap-sm rounded-xl border border-grey-200 bg-background-pure p-sm transition-colors hover:border-primary-300 dark:border-grey-700">
      <McpLogo title={title} size={30} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground-heading">
        {title}
      </span>
      {connecting ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary dark:text-primary-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-200 border-t-primary dark:border-primary-800" />
          Verbinden …
        </span>
      ) : (
        <button type="button" onClick={onConnect} className={connectBtnClass}>
          Verbinden
        </button>
      )}
    </div>
  )
);
CardShell.displayName = 'CardShell';

// ── Bearer connect dialog ────────────────────────────────────────────────────

/**
 * One-step connect for token-based servers: paste the token, we create the
 * server AND verify it live. A failing token deletes the half-created server
 * again, so retries stay idempotent and the connected list stays clean.
 */
const BearerConnectDialog = ({
  entry,
  onClose,
  onConnected,
}: {
  entry: McpRegistryEntry;
  onClose: () => void;
  onConnected: (toolCount: number) => void;
}) => {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tools, setTools] = useState<string[] | null>(null);

  const websiteHost = useMemo(() => {
    if (!entry.websiteUrl) return null;
    try {
      return new URL(entry.websiteUrl).host;
    } catch {
      return null;
    }
  }, [entry.websiteUrl]);

  const connect = async () => {
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    let serverId: string | null = null;
    try {
      const server = await createMcpServer({
        name: entry.title,
        url: entry.url,
        authType: 'bearer',
        token: token.trim(),
      });
      serverId = server.id;
      const result = await testMcpServer(server.id);
      if (!result.ok) throw new Error(result.error || 'Verbindung fehlgeschlagen');
      setTools(result.toolNames);
      onConnected(result.toolCount);
    } catch (e) {
      if (serverId) await deleteMcpServer(serverId).catch(() => {});
      setError(e instanceof Error ? e.message : 'Verbindung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-md">
            <McpLogo title={entry.title} size={44} />
            <div className="flex flex-col gap-1 text-left">
              <DialogTitle>{entry.title} verbinden</DialogTitle>
              <DialogDescription>{entry.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {tools ? (
          <div className="flex flex-col gap-sm">
            <span
              className={cn('inline-flex items-center gap-1.5 text-sm font-semibold', okTextClass)}
            >
              <FiCheck className="w-4 h-4" />
              Verbunden — {tools.length} Tools verfügbar
            </span>
            <ToolChips tools={tools} max={10} />
          </div>
        ) : (
          <div className="flex flex-col gap-sm">
            <p className="text-sm text-grey-500 leading-relaxed m-0">
              Füge deinen API-Token ein — er wird verschlüsselt gespeichert und nur für deine
              Anfragen genutzt.
              {websiteHost && (
                <>
                  {' '}
                  Du findest ihn in deinem Konto auf{' '}
                  <a
                    href={entry.websiteUrl ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline"
                  >
                    {websiteHost}
                  </a>
                  .
                </>
              )}
            </p>
            <input
              className={inputClass}
              type="password"
              placeholder="API-Token einfügen"
              value={token}
              autoFocus
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void connect();
              }}
            />
            {error && <span className="text-xs text-[var(--error-red)]">✗ {error}</span>}
          </div>
        )}

        <DialogFooter>
          {tools ? (
            <button
              type="button"
              onClick={onClose}
              className="px-lg py-sm rounded-xl font-medium text-sm cursor-pointer bg-primary text-white hover:bg-primary-600 transition-colors border-none"
            >
              Fertig
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} className={secondaryBtnClass}>
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void connect()}
                disabled={busy || !token.trim()}
                className="inline-flex items-center gap-2 px-lg py-sm rounded-xl font-medium text-sm cursor-pointer bg-primary text-white hover:bg-primary-600 transition-colors border-none disabled:opacity-50"
              >
                {busy && (
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                )}
                {busy ? 'Verbinde…' : 'Verbinden'}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Section ──────────────────────────────────────────────────────────────────

interface AvailableItem {
  key: string;
  category: string | undefined;
  entry: McpRegistryEntry;
}

// The registry ships ~12 fine-grained categories; we fold them into a few broad
// buckets. Anything unmapped (or a bucket with too few entries) lands in "Sonstige".
const OTHER_CATEGORY = 'Sonstige';
const MIN_PER_CATEGORY = 4;
const CATEGORY_MERGE: Record<string, string> = {
  Produktivität: 'Produktivität',
  Dokumente: 'Produktivität',
  Formulare: 'Produktivität',
  Automatisierung: 'Produktivität',
  'CRM & Marketing': 'Marketing & Vertrieb',
  'Social Media': 'Marketing & Vertrieb',
  'Analyse & SEO': 'Marketing & Vertrieb',
  Finanzen: 'Marketing & Vertrieb',
  Kommunikation: 'Kommunikation',
  'Recht & Compliance': 'Recht & Finanzen',
  Reisen: 'Reisen & Karten',
  Karten: 'Reisen & Karten',
};
// Display order for the merged pills/sections; "Sonstige" always sorts last.
const MERGED_CATEGORY_ORDER = [
  'Produktivität',
  'Marketing & Vertrieb',
  'Kommunikation',
  'Recht & Finanzen',
  'Reisen & Karten',
];
const UNCATEGORISED = OTHER_CATEGORY;

const mergeCategory = (raw: string | undefined): string =>
  (raw && CATEGORY_MERGE[raw]) || OTHER_CATEGORY;

function orderCategories(present: Iterable<string>): string[] {
  const set = new Set(present);
  const known = MERGED_CATEGORY_ORDER.filter((c) => set.has(c));
  const extra = [...set]
    .filter((c) => c !== OTHER_CATEGORY && !MERGED_CATEGORY_ORDER.includes(c))
    .sort();
  return [...known, ...extra, ...(set.has(OTHER_CATEGORY) ? [OTHER_CATEGORY] : [])];
}

const McpSection = memo(({ onSuccess, onError }: McpSectionProps) => {
  const { data: servers = [], isLoading, isFetching } = useMcpServers();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('Alle');
  const [connecting, setConnecting] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<McpPrefill | null>(null);
  const [bearerEntry, setBearerEntry] = useState<McpRegistryEntry | null>(null);
  const addFormRef = useRef<HTMLDivElement>(null);
  // Debounced so typing doesn't hit the external MCP registry on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  const { data: registry, isLoading: registryLoading } = useMcpRegistry(debouncedSearch);
  const queryClient = useQueryClient();

  const refreshMcp = () => void queryClient.invalidateQueries({ queryKey: mcpKeys.list() });

  const connectedUrls = useMemo(() => new Set(servers.map((s) => s.url)), [servers]);

  const available = useMemo<AvailableItem[]>(() => {
    const merged = (registry?.recommended ?? [])
      .filter((e) => !connectedUrls.has(e.url))
      .map((entry) => ({ key: entry.url, category: mergeCategory(entry.category), entry }));
    // Collapse buckets below the minimum into "Sonstige" so no pill is near-empty.
    const counts = new Map<string, number>();
    for (const it of merged) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
    return merged.map((it) =>
      (counts.get(it.category) ?? 0) < MIN_PER_CATEGORY ? { ...it, category: OTHER_CATEGORY } : it
    );
  }, [registry, connectedUrls]);

  const cats = useMemo(() => {
    const present: string[] = [];
    for (const it of available) if (it.category) present.push(it.category);
    return ['Alle', ...orderCategories(present)];
  }, [available]);
  const filtered = cat === 'Alle' ? available : available.filter((it) => it.category === cat);
  // On "Alle", group into ordered category sections; a specific pick stays flat.
  const groups = useMemo(() => {
    if (cat !== 'Alle') return null;
    const byCat = new Map<string, AvailableItem[]>();
    for (const it of available) {
      const c = it.category ?? UNCATEGORISED;
      (byCat.get(c) ?? byCat.set(c, []).get(c)!).push(it);
    }
    const order = [...orderCategories(byCat.keys()), UNCATEGORISED];
    return [...byCat.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [available, cat]);
  // "Server suchen": remote servers found in the open MCP registry for this
  // search term (backend-populated), minus anything already connected/curated.
  const externalServers = useMemo(
    () => (registry?.servers ?? []).filter((e) => !connectedUrls.has(e.url)),
    [registry, connectedUrls]
  );
  // OAuth servers without a token aren't usable yet — listing them under
  // "Verbunden" would suggest they work. They get their own action section.
  const authPending = servers.filter((s) => s.authType === 'oauth' && !s.hasToken);
  const connected = servers.filter((s) => !(s.authType === 'oauth' && !s.hasToken));
  const activeCount = connected.filter((s) => s.enabled).length;

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
      let createdId: string | null = null;
      void runOAuth(async () => {
        const server = await createMcpServer({
          name: entry.title,
          url: entry.url,
          authType: 'oauth',
        });
        createdId = server.id;
        return server.id;
      }).then(async (result) => {
        setConnecting(null);
        if (result.status === 'error' && result.startFailed && createdId) {
          // OAuth never even started — roll the just-created server back so no
          // zombie "Nicht autorisiert" row remains and the card stays available.
          await deleteMcpServer(createdId).catch(() => {});
        }
        refreshMcp();
        if (result.status === 'success') onSuccess(`${entry.title} verbunden`);
        else if (result.status === 'no_auth_required')
          onSuccess(`${entry.title} verbunden — der Server benötigt keine Anmeldung`);
        else if (result.status === 'error') {
          if (result.code === 'dcr_rejected') {
            // Provider refuses automatic registration → guide the user into the
            // manual app-registration form instead of leaving them at a banner.
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
          }
          onError(result.error || 'OAuth fehlgeschlagen');
        }
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
    // bearer / unknown → one-step token dialog right on the card.
    setBearerEntry(entry);
  };

  // Registry hits have no declared auth — prefill the add-form so the user picks
  // the auth type (and can eyeball the URL) instead of us guessing bearer/OAuth.
  const handlePickExternal = (entry: McpRegistryEntry) => {
    setPrefill({ name: entry.title, url: entry.url, authType: 'none' });
    requestAnimationFrame(() =>
      addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  };

  const hasConnected = connected.length > 0;

  return (
    <div className="mt-xl">
      {/* Header */}
      <div className="flex items-center gap-md">
        <div className="w-[52px] h-[52px] flex-none rounded-[14px] bg-primary-50 border border-primary-100 dark:bg-primary-950/30 dark:border-primary-800 flex items-center justify-center text-primary dark:text-primary-400">
          <FiServer className="w-6 h-6" />
        </div>
        <div className="flex items-center gap-sm flex-wrap">
          <h2 className="text-2xl font-semibold text-foreground-heading m-0 tracking-tight">
            Konnektoren
          </h2>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-50 text-secondary-700 border-secondary-100 dark:bg-secondary-900/30 dark:text-secondary-300 dark:border-secondary-600 text-xs font-semibold border">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary-500" />
            Experimentell
          </span>
        </div>
        <button
          type="button"
          onClick={refreshMcp}
          disabled={isFetching}
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-grey-500 hover:text-foreground transition-colors bg-transparent border-none cursor-pointer disabled:opacity-50"
        >
          <FiRefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
          Aktualisieren
        </button>
      </div>
      <p className="mt-sm max-w-xl text-sm text-grey-500 leading-relaxed">
        Verbinde externe Dienste und nutze sie direkt im Chat – jeder verbundene Server ist per
        eigenem Mention ansprechbar, z. B.{' '}
        <span className="text-foreground font-semibold">@notion</span> oder{' '}
        <span className="text-foreground font-semibold">@brevo</span>. Ein Klick startet die
        Verbindung.
      </p>

      {isLoading && <p className="text-sm text-grey-400 text-center py-md">Lade…</p>}

      {/* OAuth servers still waiting for their authorization — kept out of
          "Verbunden" so a pending server never looks usable. */}
      {authPending.length > 0 && (
        <div className="mt-xl">
          <div className="flex items-baseline gap-sm mb-sm">
            <h3 className="m-0 text-xs font-bold tracking-widest uppercase text-amber-600 dark:text-amber-400">
              Autorisierung erforderlich
            </h3>
            <span className="text-xs text-grey-400">noch nicht nutzbar</span>
          </div>
          <div className="flex flex-col gap-sm">
            {authPending.map((server) => (
              <McpServerRow
                key={server.id}
                server={server}
                onSuccess={onSuccess}
                onError={onError}
              />
            ))}
          </div>
        </div>
      )}

      {/* Connected — only shown once at least one server is connected; an empty
          state here would just be noise. */}
      {hasConnected && (
        <div className="mt-xl">
          <div className="flex items-baseline gap-sm mb-sm">
            <h3 className="m-0 text-xs font-bold tracking-widest uppercase text-grey-500">
              Verbunden
            </h3>
            <span className="text-xs text-grey-400">{activeCount} aktiv</span>
          </div>
          <div className="flex flex-col gap-sm">
            {connected.map((server) => (
              <McpServerRow
                key={server.id}
                server={server}
                onSuccess={onSuccess}
                onError={onError}
              />
            ))}
          </div>
        </div>
      )}

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
            placeholder="Server suchen …"
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

        {!registryLoading &&
          filtered.length > 0 &&
          (cat === 'Alle' && groups ? (
            <div className="flex flex-col gap-lg">
              {groups.map(([c, items]) => (
                <div key={c}>
                  <h4 className="m-0 mb-sm text-xs font-bold tracking-widest uppercase text-grey-500">
                    {c}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                    {items.map((it) => (
                      <CardShell
                        key={it.key}
                        title={it.entry.title}
                        connecting={connecting === it.entry.url}
                        onConnect={() => handlePickMcp(it.entry)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
              {filtered.map((it) => (
                <CardShell
                  key={it.key}
                  title={it.entry.title}
                  connecting={connecting === it.entry.url}
                  onConnect={() => handlePickMcp(it.entry)}
                />
              ))}
            </div>
          ))}

        {/* Server suchen — remote hits from the open MCP registry */}
        {!registryLoading && externalServers.length > 0 && (
          <div className="mt-lg">
            <div className="flex items-baseline gap-sm mb-sm">
              <h4 className="m-0 text-xs font-bold tracking-widest uppercase text-grey-500">
                Weitere Server im offenen Register
              </h4>
              <span className="text-xs text-grey-400">{externalServers.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
              {externalServers.map((entry) => (
                <CardShell
                  key={entry.url}
                  title={entry.title}
                  connecting={connecting === entry.url}
                  onConnect={() => handlePickExternal(entry)}
                />
              ))}
            </div>
            {registry?.nextCursor && (
              <p className="mt-sm text-xs text-grey-400">
                Weitere Treffer vorhanden – verfeinere die Suche für passendere Ergebnisse.
              </p>
            )}
          </div>
        )}

        {!registryLoading && filtered.length === 0 && externalServers.length === 0 && (
          <div className="border border-dashed border-grey-300 dark:border-grey-700 rounded-2xl p-lg text-center bg-background-pure">
            <div className="text-sm font-semibold text-foreground">Kein Dienst gefunden</div>
            <div className="mt-1 text-xs text-grey-500">
              {debouncedSearch
                ? 'Auch im offenen MCP-Register nichts gefunden. Passe die Suche an.'
                : 'Passe die Suche an oder wähle eine andere Kategorie.'}
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

      {bearerEntry && (
        <BearerConnectDialog
          entry={bearerEntry}
          onClose={() => {
            setBearerEntry(null);
            refreshMcp();
          }}
          onConnected={(toolCount) => {
            refreshMcp();
            onSuccess(`${bearerEntry.title} verbunden — ${toolCount} Tools verfügbar`);
          }}
        />
      )}
    </div>
  );
});
McpSection.displayName = 'McpSection';

export default McpSection;
