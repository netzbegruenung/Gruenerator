import { type ChatToolDecision } from '@gruenerator/contracts';
import { and, eq, like } from 'drizzle-orm';

import { chat_tool_approvals } from '../../../../database/schema/index.js';
import { getDrizzleInstance } from '../../../../database/services/DrizzleService.js';
import { createLogger } from '../../../../utils/logger.js';

const log = createLogger('toolApprovalRepo');

export interface StoredApproval {
  scopeKey: string;
  toolLabel: string | null;
  decision: ChatToolDecision;
  createdAt: Date;
}

/**
 * Fällt bei einem Ausfall auf die LEERE Menge zurück, nicht auf „alles erlaubt":
 * ohne Allowlist wird gefragt, und Fragen ist der sichere Ausgang.
 */
export async function loadAllowlist(userId: string): Promise<Set<string>> {
  try {
    const db = getDrizzleInstance();
    const rows = await db
      .select({ scope_key: chat_tool_approvals.scope_key })
      .from(chat_tool_approvals)
      .where(
        and(eq(chat_tool_approvals.user_id, userId), eq(chat_tool_approvals.decision, 'allow'))
      );
    return new Set(rows.map((r) => r.scope_key));
  } catch (err) {
    log.warn(
      `Allowlist nicht lesbar, es wird gefragt: ${err instanceof Error ? err.message : err}`
    );
    return new Set<string>();
  }
}

/**
 * Werkzeuge eines Servers, die die Person abgeschaltet hat (rohe Namen). Ein
 * Ausfall liefert die LEERE Menge: dann steht das Werkzeug wieder im Katalog
 * und fragt beim Aufruf — lästig, aber nicht unsicher.
 */
export async function loadDeniedForServer(userId: string, serverId: string): Promise<Set<string>> {
  const prefix = `mcp:${serverId}/`;
  try {
    const db = getDrizzleInstance();
    const rows = await db
      .select({ scope_key: chat_tool_approvals.scope_key })
      .from(chat_tool_approvals)
      .where(
        and(
          eq(chat_tool_approvals.user_id, userId),
          eq(chat_tool_approvals.decision, 'deny'),
          like(chat_tool_approvals.scope_key, `${prefix}%`)
        )
      );
    return new Set(rows.map((r) => r.scope_key.slice(prefix.length)));
  } catch (err) {
    log.warn(`Abgeschaltete Werkzeuge nicht lesbar: ${err instanceof Error ? err.message : err}`);
    return new Set<string>();
  }
}

export async function listApprovals(userId: string): Promise<StoredApproval[]> {
  const db = getDrizzleInstance();
  const rows = await db
    .select()
    .from(chat_tool_approvals)
    .where(eq(chat_tool_approvals.user_id, userId));
  return rows
    .map((r) => ({
      scopeKey: r.scope_key,
      toolLabel: r.tool_label,
      decision: r.decision,
      createdAt: r.created_at,
    }))
    .sort((a, b) => a.scopeKey.localeCompare(b.scopeKey));
}

export async function grantApproval(
  userId: string,
  scopeKey: string,
  toolLabel: string | null,
  decision: ChatToolDecision = 'allow'
): Promise<void> {
  const db = getDrizzleInstance();
  await db
    .insert(chat_tool_approvals)
    .values({ user_id: userId, scope_key: scopeKey, tool_label: toolLabel, decision })
    .onConflictDoUpdate({
      target: [chat_tool_approvals.user_id, chat_tool_approvals.scope_key],
      set: { tool_label: toolLabel, decision },
    });
}

export async function revokeApproval(userId: string, scopeKey: string): Promise<boolean> {
  const db = getDrizzleInstance();
  const deleted = await db
    .delete(chat_tool_approvals)
    .where(
      and(eq(chat_tool_approvals.user_id, userId), eq(chat_tool_approvals.scope_key, scopeKey))
    )
    .returning({ scope_key: chat_tool_approvals.scope_key });
  return deleted.length > 0;
}

/** Beim Trennen eines Servers: seine Freigaben verlieren ihren Gegenstand. */
export async function revokeApprovalsForServer(userId: string, serverId: string): Promise<void> {
  const prefix = `mcp:${serverId}/`;
  try {
    const rows = await listApprovals(userId);
    const stale = rows.filter((r) => r.scopeKey.startsWith(prefix));
    for (const row of stale) await revokeApproval(userId, row.scopeKey);
  } catch (err) {
    log.warn(`Freigaben zu Server ${serverId} nicht aufgeräumt: ${err}`);
  }
}
