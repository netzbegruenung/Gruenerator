/**
 * "Konnektoren" surface (EXPERIMENTAL) — connect external MCP servers and use
 * them in chat via per-server mentions (@notion, @brevo, …). A curated directory
 * of hand-picked, remote-hosted servers plus a custom-server form. Auth is
 * `none`, `bearer` (token dialog) or `oauth` (PKCE/DCR popup).
 */
import { connectorBrandIcon } from '@gruenerator/chat/connectors';
import { type DriveProvider } from '@gruenerator/contracts';
import { mcpBrandColor } from '@gruenerator/shared/utils';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Switch,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { memo, type ReactNode, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { FiSearch, FiCheck, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';

import {
  useMcpServers,
  useCreateMcpServer,
  useDeleteMcpServer,
  useUpdateMcpServer,
  useTestMcpServer,
  useApproveMcpServerTools,
  useMcpRegistry,
  invalidateMcpServers,
} from '../hooks/useMcpServers';
import { useNangoConnector } from '../hooks/useNangoConnector';
import {
  connectRegistryConnector,
  createMcpServer,
  deleteMcpServer,
  fetchMcpServers,
  startMcpOAuth,
  testMcpServer,
  updateMcpServer,
  McpOAuthStartError,
  type McpAuthType,
  type McpServerTestResult,
  type McpOAuthErrorCode,
  type McpRegistryEntry,
  type McpServerSummary,
} from '../lib/mcpApi';
import { openOAuthPopup, waitForOAuthPopup } from '../lib/mcpOAuthPopup';
import { mcpToolScopeKey, setToolDecision } from '../lib/toolApprovalsApi';

import { McpToolStages } from './McpToolStages';

import {
  ROW_TEXT_INDENT,
  SettingsList,
  SettingsListRow,
} from '@/features/settings/components/SettingsListRow';
import SettingsSection from '@/features/settings/components/SettingsSection';
import { SettingsCardsSkeleton } from '@/features/settings/components/SettingsSkeleton';
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

// Vendor logos come from the same registry the composer chip draws from — this
// page and the chip once kept separate lists and drifted, so a service showed
// its logo here and a generic plug there. A service with no match keeps the
// coloured-monogram fallback below.
const McpLogo = memo(({ title, size = 50 }: { title: string; size?: number }) => {
  const Icon = connectorBrandIcon(title);
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

const chipClass =
  'inline-flex items-center px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 border border-primary-100 dark:bg-primary-950/30 dark:text-primary-300 dark:border-primary-800 text-[11px] font-medium';

const okTextClass = 'text-primary-700 dark:text-primary-400';

const secondaryBtnClass =
  'px-lg py-sm rounded-xl font-medium text-sm cursor-pointer bg-transparent border border-grey-300 text-foreground hover:bg-grey-50 dark:border-grey-600 dark:hover:bg-grey-800 transition-colors';

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

/** Die Detailfelder der Testantwort, die das UI anzeigt. */
type McpTestDetails = Pick<
  McpServerTestResult,
  'transport' | 'protocolVersion' | 'skippedTools' | 'truncatedTools' | 'hint'
>;

/**
 * Was beim Support-Fall „0 Tools" fehlte: der Handgriff zur Meldung und die
 * harten Fakten darunter (Transport, Protokollversion, verworfene Einträge).
 * Der Hinweis steht bewusst über den Fakten — er ist das, was zu tun ist.
 */
const McpTestDiagnostics = memo(({ result }: { result: McpTestDetails }) => {
  const facts: string[] = [];
  if (result.transport)
    facts.push(result.transport === 'sse' ? 'Transport: SSE' : 'Transport: HTTP');
  if (result.protocolVersion) facts.push(`Protokoll: ${result.protocolVersion}`);
  if (result.skippedTools) facts.push(`${result.skippedTools} unbrauchbare Einträge übersprungen`);
  if (result.truncatedTools) facts.push(`${result.truncatedTools} weitere Werkzeuge abgeschnitten`);
  if (!result.hint && facts.length === 0) return null;
  return (
    <>
      {result.hint && <span className="text-xs text-grey-500">{result.hint}</span>}
      {facts.length > 0 && <span className="text-[11px] text-grey-400">{facts.join(' · ')}</span>}
    </>
  );
});
McpTestDiagnostics.displayName = 'McpTestDiagnostics';

// ── Add-form ─────────────────────────────────────────────────────────────────

interface McpSectionProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  /** Rendered right after „Verbunden“ — or last when nothing is connected. */
  afterConnected?: ReactNode;
}

interface McpPrefill {
  name: string;
  url: string;
  authType: McpAuthType;
  /** DCR-less OAuth provider: show the app-registration guidance + setup link. */
  manual?: boolean;
  setupUrl?: string | null;
  /** Existing row that needs Client-ID/Secret — updated in place, not created. */
  serverId?: string | null;
}

const McpAddForm = memo(
  ({
    onSuccess,
    onError,
    prefill,
    redirectUri,
  }: McpSectionProps & {
    prefill: McpPrefill | null;
    /** What the backend registers (BASE_URL), not this tab's origin. */
    redirectUri: string | null;
  }) => {
    const create = useCreateMcpServer();
    const update = useUpdateMcpServer();
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    // Manual adds are always tokenless; OAuth is only reached via a prefill from
    // the directory (providers that need pre-registration).
    const [authType, setAuthType] = useState<McpAuthType>('none');
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [setupUrl, setSetupUrl] = useState<string | null>(null);
    const [serverId, setServerId] = useState<string | null>(null);

    // A pick from the discover list fills the form so the user only confirms.
    useEffect(() => {
      if (prefill) {
        // Fill the form as a reaction to a directory pick (prefill prop change),
        // not a render-derived value.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setName(prefill.name);
        setUrl(prefill.url);
        setAuthType(prefill.authType);
        setSetupUrl(prefill.setupUrl ?? null);
        setServerId(prefill.serverId ?? null);
      }
    }, [prefill]);

    const reset = () => {
      setName('');
      setUrl('');
      setAuthType('none');
      setClientId('');
      setClientSecret('');
      setSetupUrl(null);
      setServerId(null);
    };

    const submit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !url.trim()) return;
      if (serverId) {
        // The row exists (its AS moved, or it rejected DCR): store the client
        // on it — creating a second one would collide on the unique name.
        update.mutate(
          {
            id: serverId,
            patch: {
              authType: 'oauth',
              oauthClientId: clientId.trim() || null,
              oauthClientSecret: clientSecret.trim() || null,
            },
          },
          {
            onSuccess: () => {
              reset();
              onSuccess('Gespeichert — jetzt „Autorisieren“ klicken.');
            },
            onError: (err) => onError(err instanceof Error ? err.message : 'Fehler'),
          }
        );
        return;
      }
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
            reset();
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
          {/* Saving a client onto an existing row sends only the client — name
              and URL stay as they are, so they are not editable here. */}
          <input
            className={inputClass}
            aria-label="Name des Servers"
            placeholder="Name (z. B. Linear)"
            value={name}
            readOnly={serverId !== null}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className={inputClass}
            aria-label="Server-URL"
            placeholder="Server-URL (https://…/mcp)"
            value={url}
            readOnly={serverId !== null}
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
            {redirectUri ? (
              <code className="text-xs bg-grey-100 dark:bg-grey-800 px-sm py-1 rounded-lg break-all">
                {redirectUri}
              </code>
            ) : (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Die Redirect-URI ist gerade nicht verfügbar — bitte die Seite neu laden.
              </span>
            )}
            <div className="flex flex-col sm:flex-row gap-sm">
              <input
                className={inputClass}
                placeholder={setupUrl || serverId ? 'Client-ID' : 'Client-ID (optional)'}
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
          disabled={
            create.isPending ||
            update.isPending ||
            !name.trim() ||
            !url.trim() ||
            // Without a Client-ID the update would wipe the stored client.
            (serverId !== null && !clientId.trim())
          }
          className={cn(secondaryBtnClass, 'self-start disabled:opacity-50')}
        >
          {serverId
            ? update.isPending
              ? 'Speichere…'
              : 'Client speichern'
            : create.isPending
              ? 'Füge hinzu…'
              : 'MCP-Server hinzufügen'}
        </button>
      </form>
    );
  }
);
McpAddForm.displayName = 'McpAddForm';

// ── Connected MCP server row ─────────────────────────────────────────────────

const McpServerRow = memo(
  ({
    server,
    onSuccess,
    onError,
    onUseKey,
    onNeedsClient,
  }: {
    server: McpServerSummary;
    /** Opens the key dialog for a row still waiting for OAuth. */
    onUseKey?: (() => void) | null;
    /** The AS wants a hand-registered client for this row (dcr_rejected). */
    onNeedsClient?: (() => void) | null;
  } & McpSectionProps) => {
    const del = useDeleteMcpServer();
    const update = useUpdateMcpServer();
    const test = useTestMcpServer();
    const approve = useApproveMcpServerTools();
    const queryClient = useQueryClient();

    // Abschalten statt freigeben: die neuen bzw. geänderten Werkzeuge bekommen
    // „Aus", danach gilt der aktuelle Stand als freigegeben — der Rest des
    // Servers läuft wieder, die abgeschalteten bleiben aus dem Katalog.
    const rejectDrifted = async (): Promise<void> => {
      const drift = server.toolsDrift;
      if (!drift) return;
      try {
        for (const toolName of [...drift.changed, ...drift.added]) {
          await setToolDecision({
            scopeKey: mcpToolScopeKey(server.id, toolName),
            toolLabel: `${server.name} · ${toolName}`,
            decision: 'deny',
          });
        }
        await approve.mutateAsync(server.id);
        void queryClient.invalidateQueries({ queryKey: ['chat-tool-approvals'] });
        onSuccess(`Werkzeuge von ${server.name} abgeschaltet`);
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Fehler');
      }
    };
    const [testResult, setTestResult] = useState<
      ({ ok: boolean; tools: string[]; error: string | null } & McpTestDetails) | null
    >(null);

    // A known connector (Bahn, Wetter, Rateo, …) is a row like any other once
    // connected, but its endpoint lives in deploy env: no URL to show, no OAuth
    // to complete, nothing to rename. Switching and removing work as usual.
    const isManaged = server.registryKey != null || server.managed === true;
    const needsAuth = !isManaged && server.authType === 'oauth' && !server.hasToken;
    const statusLabel = needsAuth ? 'Nicht autorisiert' : server.enabled ? 'Verbunden' : 'Pausiert';

    const authorize = () => {
      void runOAuth(async () => server.id).then((result) => {
        invalidateMcpServers(queryClient);
        if (result.status === 'success') onSuccess(`${server.name} verbunden`);
        else if (result.status === 'no_auth_required')
          onSuccess(`${server.name} verbunden — der Server benötigt keine Anmeldung`);
        else if (result.status === 'error') {
          if (result.code === 'dcr_rejected') onNeedsClient?.();
          onError(result.error || 'OAuth fehlgeschlagen');
        }
      });
    };

    /** `quiet`: a good result shows through the refreshed tool list alone. */
    const runTest = (quiet = false) => {
      test.mutate(server.id, {
        onSuccess: (r) => {
          if (quiet && r.ok && r.toolNames.length > 0) return;
          setTestResult({
            ok: r.ok,
            tools: r.toolNames,
            // Bei null Werkzeugen trägt der Backend-Hinweis die Erklärung, auch
            // wenn der Verbindungsaufbau selbst geklappt hat.
            error: r.ok ? null : (r.error ?? 'Verbindung fehlgeschlagen'),
            transport: r.transport,
            protocolVersion: r.protocolVersion,
            skippedTools: r.skippedTools,
            truncatedTools: r.truncatedTools,
            hint: r.hint,
          });
        },
        onError: (err) =>
          setTestResult({
            ok: false,
            tools: [],
            error: err instanceof Error ? err.message : 'Fehler',
          }),
      });
    };

    // Den Werkzeug-Snapshot schreibt erst ein Verbindungsaufbau. Eine nutzbare
    // Zeile ohne ihn (frisch angelegt, gerade autorisiert oder eingeschaltet)
    // zeigte deshalb keine Werkzeuge, bis jemand „Testen" klickte — also testet
    // sie sich einmal selbst. Ein Fehler steht dann sofort hier, nicht erst im Chat.
    const needsFirstTest = !isManaged && !needsAuth && server.enabled && server.toolNames == null;
    const autoTested = useRef(false);
    const autoTest = useEffectEvent(() => runTest(true));
    useEffect(() => {
      if (!needsFirstTest || autoTested.current) return;
      autoTested.current = true;
      autoTest();
    }, [needsFirstTest]);

    return (
      <SettingsListRow
        mark={<McpLogo title={server.name} size={30} />}
        name={server.name}
        badge={{ label: statusLabel, tone: !needsAuth && server.enabled ? 'primary' : 'neutral' }}
        meta={
          isManaged ? server.description : <span className="font-mono text-xs">{server.url}</span>
        }
        actions={
          <>
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
              <Button type="button" variant="outline" size="sm" onClick={authorize}>
                Autorisieren
              </Button>
            )}
            {needsAuth && onUseKey && (
              <Button type="button" variant="ghost" size="sm" onClick={onUseKey}>
                Stattdessen API-Key
              </Button>
            )}
            {!isManaged && !needsAuth && server.authType === 'oauth' && (
              <Button type="button" variant="ghost" size="sm" onClick={authorize}>
                Neu verbinden
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => runTest()}
              disabled={test.isPending}
            >
              {test.isPending ? 'Teste…' : 'Testen'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                del.mutate(server.id, {
                  onSuccess: () => onSuccess('Konnektor entfernt'),
                  onError: (err) => onError(err instanceof Error ? err.message : 'Fehler'),
                })
              }
              disabled={del.isPending}
              className="hover:text-[var(--error-red)]"
            >
              Entfernen
            </Button>
          </>
        }
      >
        <div className={cn('flex flex-col gap-sm empty:hidden', ROW_TEXT_INDENT)}>
          {server.toolsDrift && (
            <div className="flex flex-col gap-1.5" role="status">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <FiAlertCircle className="w-3.5 h-3.5" />
                {server.toolsDrift.changed.length > 0
                  ? 'Werkzeug-Beschreibungen geändert — dieser Konnektor ist bis zur Freigabe gesperrt'
                  : 'Neue Werkzeuge seit der Freigabe — sie bleiben bis zur Freigabe ungenutzt'}
              </span>
              {server.toolsDrift.changed.length > 0 && (
                <>
                  <span className="text-xs text-grey-500">Geändert:</span>
                  <ToolChips tools={server.toolsDrift.changed} />
                </>
              )}
              {server.toolsDrift.added.length > 0 && (
                <>
                  <span className="text-xs text-grey-500">Neu:</span>
                  <ToolChips tools={server.toolsDrift.added} />
                </>
              )}
              <div className="flex flex-wrap items-center gap-md">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    approve.mutate(server.id, {
                      onSuccess: () => onSuccess(`Werkzeuge von ${server.name} freigegeben`),
                      onError: (err) => onError(err instanceof Error ? err.message : 'Fehler'),
                    })
                  }
                  disabled={approve.isPending}
                >
                  {approve.isPending ? 'Gebe frei…' : 'Werkzeuge freigeben'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void rejectDrifted()}
                  disabled={approve.isPending}
                >
                  Diese Werkzeuge abschalten
                </Button>
              </div>
            </div>
          )}
          {!isManaged && server.toolNames && (
            <McpToolStages
              serverId={server.id}
              serverName={server.name}
              toolNames={server.toolNames}
              newTools={server.toolsDrift?.added ?? []}
              onError={onError}
            />
          )}
          {testResult &&
            (testResult.ok ? (
              <div className="flex flex-col gap-1.5">
                {/* Ein erreichbarer Server ohne Werkzeuge ist kein Erfolg — grün mit
                  „0 Tools verfügbar" hat genau diesen Fall als in Ordnung gemeldet. */}
                {testResult.tools.length === 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    <FiAlertCircle className="w-3.5 h-3.5" />
                    Verbunden, aber der Server meldet keine Werkzeuge
                  </span>
                ) : (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs font-semibold',
                      okTextClass
                    )}
                  >
                    <FiCheck className="w-3.5 h-3.5" />
                    {testResult.tools.length} Tools verfügbar
                  </span>
                )}
                <ToolChips tools={testResult.tools} />
                <McpTestDiagnostics result={testResult} />
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-grey-500">✗ {testResult.error}</span>
                <McpTestDiagnostics result={testResult} />
              </div>
            ))}
        </div>
      </SettingsListRow>
    );
  }
);
McpServerRow.displayName = 'McpServerRow';

// ── Available rows ──────────────────────────────────────────────────────────

// Compact one-line row: logo + name + connect. No auth badge, description or
// category (the section heading already carries the category).
const CardShell = memo(
  ({
    title,
    connecting,
    onConnect,
    onUseKey,
    onDisconnect,
    experimental = false,
  }: {
    title: string;
    /** Open to everyone but not yet settled — says so next to the name. */
    experimental?: boolean;
    connecting: boolean;
    onConnect: () => void;
    /** Provider also takes an API key — offered next to the one-click login. */
    onUseKey?: (() => void) | null;
    /**
     * Set for a connection that stays a card once connected (Microsoft 365 and
     * Google Workspace are no MCP rows, so they have no place under „Verbunden").
     */
    onDisconnect?: (() => void) | null;
  }) => (
    <SettingsListRow
      mark={<McpLogo title={title} size={30} />}
      name={title}
      badge={experimental ? { label: 'Experimentell', tone: 'neutral' } : undefined}
      actions={
        <>
          {onUseKey && !connecting && (
            <Button type="button" variant="ghost" size="sm" onClick={onUseKey}>
              oder API-Key
            </Button>
          )}
          {onDisconnect ? (
            <>
              <span
                className={cn('inline-flex items-center gap-1 text-xs font-semibold', okTextClass)}
              >
                <FiCheck className="w-3.5 h-3.5" />
                Verbunden
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={onDisconnect}>
                Trennen
              </Button>
            </>
          ) : connecting ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary dark:text-primary-400">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-200 border-t-primary dark:border-primary-800" />
              Verbinden …
            </span>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={onConnect}>
              Verbinden
            </Button>
          )}
        </>
      }
    />
  )
);
CardShell.displayName = 'CardShell';

// ── Bearer connect dialog ────────────────────────────────────────────────────

const takesKey = (entry: McpRegistryEntry) => entry.authOptions?.includes('bearer') === true;

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

/**
 * One-step connect for token-based servers: paste the token, we create the
 * server AND verify it live. A failing token deletes the half-created server
 * again, so retries stay idempotent and the connected list stays clean.
 */
const BearerConnectDialog = ({
  entry,
  pendingOAuthId,
  onClose,
  onConnected,
}: {
  entry: McpRegistryEntry;
  /**
   * An OAuth row of this connector still waiting for authorization: switched
   * to the key in place — a second row would collide on the unique name.
   */
  pendingOAuthId?: string | null;
  onClose: () => void;
  onConnected: (toolCount: number) => void;
}) => {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tools, setTools] = useState<string[] | null>(null);

  const keyPage = entry.keyUrl ?? entry.websiteUrl ?? null;
  const keyHost = useMemo(() => {
    if (!keyPage) return null;
    try {
      return new URL(keyPage).host;
    } catch {
      return null;
    }
  }, [keyPage]);

  const connect = async () => {
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    let serverId: string | null = null;
    try {
      if (pendingOAuthId) {
        await updateMcpServer(pendingOAuthId, { authType: 'bearer', token: token.trim() });
        serverId = pendingOAuthId;
      } else {
        const server = await createMcpServer({
          name: entry.title,
          url: entry.url,
          authType: 'bearer',
          token: token.trim(),
        });
        serverId = server.id;
      }
      const result = await testMcpServer(serverId);
      if (!result.ok) throw new Error(result.error || 'Verbindung fehlgeschlagen');
      setTools(result.toolNames);
      onConnected(result.toolCount);
    } catch (e) {
      // A fresh row goes again; a row that waited for OAuth goes back to waiting.
      if (serverId && !pendingOAuthId) await deleteMcpServer(serverId).catch(() => {});
      else if (serverId)
        await updateMcpServer(serverId, { authType: 'oauth', token: null }).catch(() => {});
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
            {tools.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-600 dark:text-amber-400">
                <FiAlertCircle className="w-4 h-4" />
                Verbunden, aber der Server meldet keine Werkzeuge — bitte den Token prüfen
              </span>
            ) : (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 text-sm font-semibold',
                  okTextClass
                )}
              >
                <FiCheck className="w-4 h-4" />
                Verbunden — {tools.length} Tools verfügbar
              </span>
            )}
            <ToolChips tools={tools} max={10} />
          </div>
        ) : (
          <div className="flex flex-col gap-sm">
            <p className="text-sm text-grey-500 leading-relaxed m-0">
              Füge deinen API-Token ein — er wird verschlüsselt gespeichert und nur für deine
              Anfragen genutzt.
              {keyHost && (
                <>
                  {' '}
                  Du findest ihn in deinem Konto auf{' '}
                  <a
                    href={keyPage ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline"
                  >
                    {keyHost}
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

/**
 * One card under "Dienste verbinden": a directory entry — a curated vendor or a
 * known connector (`registryKey`), which connects by its key instead of a URL.
 */
type AvailableItem =
  | { kind: 'mcp'; key: string; category: string; title: string; entry: McpRegistryEntry }
  /** A Nango connection (not MCP) that lives in the same directory. */
  | { kind: 'nango'; key: string; category: string; title: string; provider: DriveProvider };

/** The Nango cards and what the directory search matches for each (they aren't in the registry). */
const NANGO_CARDS = [
  { provider: 'microsoft', title: 'Microsoft 365', searchText: 'microsoft 365 onedrive office' },
  {
    provider: 'google',
    title: 'Google Workspace',
    searchText: 'google workspace drive docs sheets slides tabellen',
  },
] as const satisfies readonly { provider: DriveProvider; title: string; searchText: string }[];

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
  // Known-connector category (connectorAdapters.ts).
  'Reise & Verkehr': 'Reisen & Karten',
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

const mergeCategory = (raw: string | null | undefined): string =>
  (raw && CATEGORY_MERGE[raw]) || OTHER_CATEGORY;

function orderCategories(present: Iterable<string>): string[] {
  const set = new Set(present);
  const known = MERGED_CATEGORY_ORDER.filter((c) => set.has(c));
  const extra = [...set]
    .filter((c) => c !== OTHER_CATEGORY && !MERGED_CATEGORY_ORDER.includes(c))
    .sort();
  return [...known, ...extra, ...(set.has(OTHER_CATEGORY) ? [OTHER_CATEGORY] : [])];
}

const McpSection = memo(({ onSuccess, onError, afterConnected }: McpSectionProps) => {
  const { data: servers = [], isLoading, isFetching } = useMcpServers();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('Alle');
  const [connecting, setConnecting] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<McpPrefill | null>(null);
  const [bearerTarget, setBearerTarget] = useState<{
    entry: McpRegistryEntry;
    pendingOAuthId: string | null;
  } | null>(null);
  const openKeyDialog = (entry: McpRegistryEntry, pendingOAuthId: string | null = null) =>
    setBearerTarget({ entry, pendingOAuthId });
  const addFormRef = useRef<HTMLDivElement>(null);
  // Debounced so typing doesn't hit the external MCP registry on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  const { data: registry, isLoading: registryLoading } = useMcpRegistry(debouncedSearch);
  const queryClient = useQueryClient();
  const microsoft = useNangoConnector('microsoft');
  const google = useNangoConnector('google');

  const refreshMcp = () => invalidateMcpServers(queryClient);

  // Known connectors report an empty `url` (the endpoint is deploy-env-only),
  // so they cannot and must not take part in the URL match — they match by key.
  const connectedUrls = useMemo(
    () => new Set(servers.filter((s) => s.url).map((s) => s.url)),
    [servers]
  );
  // Curated cards match by host: a seed whose path moved (monday.com /sse →
  // /mcp) must not reappear for a row saved under the old path — connecting it
  // again would collide on the unique name.
  const connectedHosts = useMemo(
    () => new Set(servers.map((s) => hostOf(s.url)).filter((h): h is string => h !== null)),
    [servers]
  );

  const connectedKeys = useMemo(
    () => new Set(servers.map((s) => s.registryKey).filter((k): k is string => k != null)),
    [servers]
  );

  const available = useMemo<AvailableItem[]>(() => {
    // Search runs server-side for the whole directory, known connectors included.
    const merged: AvailableItem[] = (registry?.recommended ?? [])
      .filter((e) =>
        e.registryKey
          ? !connectedKeys.has(e.registryKey)
          : !connectedHosts.has(hostOf(e.url) ?? e.url)
      )
      .map((entry): AvailableItem => ({
        kind: 'mcp',
        key: entry.registryKey ?? entry.url,
        category: mergeCategory(entry.category),
        title: entry.title,
        entry,
      }));
    // Collapse buckets below the minimum into "Sonstige" so no pill is near-empty.
    const counts = new Map<string, number>();
    for (const it of merged) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
    const items = merged.map((it) =>
      (counts.get(it.category) ?? 0) < MIN_PER_CATEGORY ? { ...it, category: OTHER_CATEGORY } : it
    );
    const query = debouncedSearch.toLowerCase();
    const isAvailable = { microsoft: microsoft.available, google: google.available };
    for (const card of NANGO_CARDS) {
      if (!isAvailable[card.provider] || !card.searchText.includes(query)) continue;
      items.push({
        kind: 'nango',
        key: `nango:${card.provider}`,
        category: OTHER_CATEGORY,
        title: card.title,
        provider: card.provider,
      });
    }
    return items;
  }, [
    registry,
    connectedHosts,
    connectedKeys,
    microsoft.available,
    google.available,
    debouncedSearch,
  ]);

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
  // A known connector never waits for OAuth.
  const waitsForOAuth = (s: McpServerSummary) =>
    s.registryKey == null && s.authType === 'oauth' && !s.hasToken;
  const authPending = servers.filter(waitsForOAuth);
  const connected = servers.filter((s) => !waitsForOAuth(s));
  const activeCount = connected.filter((s) => s.enabled).length;

  // Curated entry for a saved row, by host like the cards above.
  const entryByHost = useMemo(
    () => new Map((registry?.recommended ?? []).map((e) => [hostOf(e.url), e])),
    [registry]
  );
  const entryFor = (server: McpServerSummary) => entryByHost.get(hostOf(server.url));
  /** Key link on a card whose one-click way is OAuth but which also takes a key. */
  const keyAlternative = (entry: McpRegistryEntry) =>
    entry.authHint === 'oauth' && takesKey(entry) ? () => openKeyDialog(entry) : null;
  const askForClient = (server: McpServerSummary) => () => {
    setPrefill({
      name: server.name,
      url: server.url,
      authType: 'oauth',
      manual: true,
      setupUrl: entryFor(server)?.setupUrl ?? null,
      serverId: server.id,
    });
    requestAnimationFrame(() =>
      addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  };
  /** Key action on a row still waiting for OAuth, where the provider takes keys. */
  const rowKeyAction = (server: McpServerSummary) => {
    const entry = entryFor(server);
    if (!entry || !takesKey(entry)) return null;
    return () => openKeyDialog(entry, server.id);
  };

  const handlePickMcp = (entry: McpRegistryEntry) => {
    if (entry.registryKey) {
      const key = entry.registryKey;
      setConnecting(key);
      connectRegistryConnector(key)
        .then(() => {
          refreshMcp();
          onSuccess(`${entry.title} verbunden`);
        })
        .catch((e) => onError(e instanceof Error ? e.message : 'Fehler'))
        .finally(() => setConnecting(null));
      return;
    }
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
          const oauthImpossible =
            result.code === 'dcr_rejected' || result.code === 'no_oauth_support';
          if (oauthImpossible && takesKey(entry)) {
            // OAuth cannot work here, but the provider takes an API key — the
            // shorter way out than registering an OAuth app by hand. Transient
            // failures (blocked popup, provider hiccup) only get the toast; the
            // waiting row offers "Stattdessen API-Key" anyway.
            openKeyDialog(entry, result.startFailed || !createdId ? null : createdId);
          } else if (result.code === 'dcr_rejected') {
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
    openKeyDialog(entry);
  };

  // Registry hits have no declared auth — prefill the add-form so the user picks
  // the auth type (and can eyeball the URL) instead of us guessing bearer/OAuth.
  const handlePickExternal = (entry: McpRegistryEntry) => {
    setPrefill({ name: entry.title, url: entry.url, authType: 'none' });
    requestAnimationFrame(() =>
      addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  };

  const renderCard = (it: AvailableItem) => {
    if (it.kind !== 'nango') {
      return (
        <CardShell
          key={it.key}
          title={it.title}
          connecting={connecting === (it.entry.registryKey ?? it.entry.url)}
          onConnect={() => handlePickMcp(it.entry)}
          onUseKey={keyAlternative(it.entry)}
        />
      );
    }
    const conn = it.provider === 'google' ? google : microsoft;
    return (
      <CardShell
        key={it.key}
        title={it.title}
        experimental
        connecting={conn.connect.isPending}
        onConnect={() =>
          conn.connect.mutate(undefined, {
            onError: (err) =>
              onError(err instanceof Error ? err.message : 'Verbinden fehlgeschlagen'),
          })
        }
        onDisconnect={
          conn.connected
            ? () =>
                conn.disconnect.mutate(undefined, {
                  onSuccess: () => onSuccess(`${it.title} getrennt`),
                  onError: () => onError('Verbindung konnte nicht getrennt werden'),
                })
            : null
        }
      />
    );
  };

  const hasConnected = connected.length > 0;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-md">
          <div className="flex items-center gap-sm flex-wrap">
            <h2 className="m-0 font-[Raleway] text-[15px] font-semibold text-foreground-heading">
              Konnektoren
            </h2>
            <span className="inline-flex items-center rounded-full bg-grey-100 px-2 py-0.5 text-xs text-grey-600 dark:bg-grey-800 dark:text-grey-300">
              Experimentell
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={refreshMcp}
            disabled={isFetching}
            className="ml-auto"
          >
            <FiRefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
            Aktualisieren
          </Button>
        </div>
        <p className="m-0 mt-sm max-w-[64ch] text-[13px] text-grey-600 dark:text-grey-400">
          Verbinde externe Dienste und nutze sie direkt im Chat – jeder verbundene Server ist per
          eigenem Mention ansprechbar, z. B.{' '}
          <span className="text-foreground font-semibold">@notion</span> oder{' '}
          <span className="text-foreground font-semibold">@brevo</span>. Ein Klick startet die
          Verbindung.
        </p>
      </div>

      {isLoading && <SettingsCardsSkeleton cards={3} />}

      {/* OAuth servers still waiting for their authorization — kept out of
          "Verbunden" so a pending server never looks usable. */}
      {authPending.length > 0 && (
        <SettingsSection
          title="Autorisierung erforderlich"
          aside={
            <span className="text-xs text-grey-600 dark:text-grey-400">noch nicht nutzbar</span>
          }
        >
          <SettingsList>
            {authPending.map((server) => (
              <McpServerRow
                key={server.id}
                server={server}
                onSuccess={onSuccess}
                onError={onError}
                onNeedsClient={askForClient(server)}
                onUseKey={rowKeyAction(server)}
              />
            ))}
          </SettingsList>
        </SettingsSection>
      )}

      {/* Connected — only shown once at least one server is connected; an empty
          state here would just be noise. */}
      {hasConnected && (
        <SettingsSection
          title="Verbunden"
          aside={
            <span className="text-xs text-grey-600 dark:text-grey-400">{activeCount} aktiv</span>
          }
        >
          <SettingsList>
            {connected.map((server) => (
              <McpServerRow
                key={server.id}
                server={server}
                onSuccess={onSuccess}
                onError={onError}
                onNeedsClient={askForClient(server)}
              />
            ))}
          </SettingsList>
        </SettingsSection>
      )}

      {hasConnected && afterConnected}

      {/* Available */}
      <SettingsSection
        title="Dienste verbinden"
        aside={
          <span className="text-xs text-grey-600 dark:text-grey-400">
            {available.length} verfügbar
          </span>
        }
      >
        <div className="flex flex-col gap-md py-3">
          {/* Search */}
          <div className="relative">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-grey-500 pointer-events-none" />
            <input
              className={cn(inputClass, 'h-10 pl-11')}
              aria-label="Server suchen"
              placeholder="Server suchen …"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Category pills */}
          {cats.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {cats.map((c) => {
                const active = c === cat;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCat(c)}
                    aria-pressed={active}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs cursor-pointer transition-colors border',
                      active
                        ? 'bg-primary-100 text-primary-700 border-primary-100 dark:bg-primary-950 dark:text-primary-200 dark:border-primary-950'
                        : 'bg-transparent text-grey-600 border-grey-200 hover:border-primary-300 dark:text-grey-300 dark:border-grey-700'
                    )}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}

          {registryLoading && (
            <p className="m-0 text-sm text-grey-600 dark:text-grey-400 text-center py-md">Lade…</p>
          )}

          {!registryLoading &&
            filtered.length > 0 &&
            (cat === 'Alle' && groups ? (
              <div className="flex flex-col gap-md">
                {groups.map(([c, items]) => (
                  <div key={c}>
                    <h3 className="m-0 text-xs font-semibold text-grey-600 dark:text-grey-400">
                      {c}
                    </h3>
                    <SettingsList>{items.map(renderCard)}</SettingsList>
                  </div>
                ))}
              </div>
            ) : (
              <SettingsList>{filtered.map(renderCard)}</SettingsList>
            ))}

          {/* Server suchen — remote hits from the open MCP registry */}
          {!registryLoading && externalServers.length > 0 && (
            <div>
              <div className="flex items-baseline gap-sm">
                <h3 className="m-0 text-xs font-semibold text-grey-600 dark:text-grey-400">
                  Weitere Server im offenen Register
                </h3>
                <span className="text-xs text-grey-600 dark:text-grey-400">
                  {externalServers.length}
                </span>
              </div>
              <SettingsList>
                {externalServers.map((entry) => (
                  <CardShell
                    key={entry.url}
                    title={entry.title}
                    connecting={connecting === entry.url}
                    onConnect={() => handlePickExternal(entry)}
                  />
                ))}
              </SettingsList>
              {registry?.nextCursor && (
                <p className="m-0 mt-sm text-xs text-grey-600 dark:text-grey-400">
                  Weitere Treffer vorhanden – verfeinere die Suche für passendere Ergebnisse.
                </p>
              )}
            </div>
          )}

          {!registryLoading && filtered.length === 0 && externalServers.length === 0 && (
            <div className="py-md text-center">
              <div className="text-sm font-semibold text-foreground">Kein Dienst gefunden</div>
              <div className="mt-1 text-xs text-grey-600 dark:text-grey-400">
                {debouncedSearch
                  ? 'Auch im offenen MCP-Register nichts gefunden. Passe die Suche an.'
                  : 'Passe die Suche an oder wähle eine andere Kategorie.'}
              </div>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* Custom MCP server */}
      <div ref={addFormRef} className="scroll-mt-24">
        <SettingsSection
          title={prefill ? `${prefill.name} verbinden` : 'Eigenen MCP-Server hinzufügen'}
        >
          <div className="py-3">
            <McpAddForm
              onSuccess={onSuccess}
              onError={onError}
              prefill={prefill}
              redirectUri={registry?.oauthRedirectUri ?? null}
            />
          </div>
        </SettingsSection>
      </div>

      {!hasConnected && afterConnected}

      {bearerTarget && (
        <BearerConnectDialog
          entry={bearerTarget.entry}
          pendingOAuthId={bearerTarget.pendingOAuthId}
          onClose={() => {
            setBearerTarget(null);
            refreshMcp();
          }}
          onConnected={(toolCount) => {
            refreshMcp();
            onSuccess(`${bearerTarget.entry.title} verbunden — ${toolCount} Tools verfügbar`);
          }}
        />
      )}
    </div>
  );
});
McpSection.displayName = 'McpSection';

export default McpSection;
