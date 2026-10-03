/**
 * Die Freigabe-Karte für neue oder geänderte Werkzeuge eines verbundenen
 * Servers — Texte und der eine POST an EINER Stelle, weil Web und Mobile
 * dieselbe Karte zeigen (vgl. toolApproval.ts, confirmAction.ts).
 *
 * Aufbau nach assistant-ui PermissionGrant: Kopf (was, wer), Reichweite (die
 * Werkzeugnamen), drei Umfänge. „Nur dieses Gespräch" pinnt die gesehenen
 * Definitionen für diesen Thread; „Immer" gibt sie serverweit frei;
 * „Ablehnen" schaltet sie ab.
 */
import { type McpToolGrant, type McpToolGrantScope } from '@gruenerator/contracts';

import { useChatConfigStore } from '../stores/chatConfigStore';

export type { McpToolGrant, McpToolGrantScope };

/** Pseudo-Werkzeugname, unter dem beide Clients die Karte als Part führen. */
export const TOOL_GRANT_TOOL_NAME = 'mcp_tool_grant';

export const TOOL_GRANT_OPTIONS = [
  { scope: 'denied', label: 'Ablehnen' },
  { scope: 'session', label: 'Nur dieses Gespräch' },
  { scope: 'always', label: 'Immer' },
] as const satisfies ReadonlyArray<{ scope: McpToolGrantScope; label: string }>;

export function toolGrantTitle(grant: Pick<McpToolGrant, 'serverName' | 'changed'>): string {
  return grant.changed.length > 0
    ? `${grant.serverName} hat Werkzeug-Beschreibungen geändert`
    : `${grant.serverName} bietet neue Werkzeuge an`;
}

export function toolGrantSubtitle(grant: Pick<McpToolGrant, 'changed'>): string {
  return grant.changed.length > 0
    ? 'Bis zur Freigabe nutzt der Chat keine Werkzeuge dieses Dienstes. Eine Werkzeug-Beschreibung ist eine Anweisung an die KI — prüfe, ob du ihr vertraust.'
    : 'Die neuen Werkzeuge bleiben ungenutzt, bis du sie freigibst. Die bisherigen funktionieren weiter.';
}

export function toolGrantResolvedLabel(scope: McpToolGrantScope): string {
  if (scope === 'denied') return 'Abgeschaltet';
  if (scope === 'session') return 'Für dieses Gespräch freigegeben · ab der nächsten Nachricht';
  return 'Freigegeben · ab der nächsten Nachricht';
}

/**
 * Die Karte als Werkzeug-Part: stabil je Server, damit Live-Event und Reload
 * dieselbe Karte meinen, und mit einem Ergebnis, damit sie nicht als laufendes
 * Werkzeug schimmert. Die Argumente SIND der Grant.
 */
export function toolGrantPartFields(grant: McpToolGrant): {
  toolCallId: string;
  toolName: typeof TOOL_GRANT_TOOL_NAME;
  args: McpToolGrant;
  result: { kind: 'tool_grant' };
} {
  return {
    toolCallId: `${TOOL_GRANT_TOOL_NAME}:${grant.serverId}`,
    toolName: TOOL_GRANT_TOOL_NAME,
    args: grant,
    result: { kind: 'tool_grant' },
  };
}

/** Reihenfolge der Reichweite: Geändertes zuerst, es ist das Heiklere. */
export function toolGrantTools(grant: Pick<McpToolGrant, 'added' | 'changed'>): string[] {
  return [...grant.changed, ...grant.added];
}

export type ToolGrantOutcome =
  { status: 'resolved'; scope: McpToolGrantScope } | { status: 'error'; message: string };

export async function answerToolGrant(
  grant: Pick<McpToolGrant, 'serverId' | 'added' | 'changed'>,
  threadId: string,
  scope: McpToolGrantScope
): Promise<ToolGrantOutcome> {
  try {
    const { fetch: configFetch, endpoints } = useChatConfigStore.getState();
    const response = await configFetch(
      `${endpoints.mcpServers}/${encodeURIComponent(grant.serverId)}/tool-grant`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, threadId, tools: toolGrantTools(grant) }),
      }
    );
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      return { status: 'error', message: data?.error || 'Die Freigabe ist fehlgeschlagen.' };
    }
    return { status: 'resolved', scope };
  } catch {
    return { status: 'error', message: 'Die Freigabe ist fehlgeschlagen.' };
  }
}
