/**
 * `user_agents` — die eigenen Grünerator-Agenten (Agentura) im agentischen
 * Loop.
 *
 * EIN Werkzeug mit `action`-Enum wie `recurringTaskTools.ts` (Katalogbudget).
 *
 * Agents laufen aus (11/2026): neue lassen sich nicht mehr anlegen, auch
 * nicht als Kopie — `create` und `duplicate` antworten mit
 * {@link AGENT_CREATION_CLOSED} und verweisen auf Rezepte. Die Aktionen
 * bleiben im Enum, damit ein Aufruf den Grund bekommt statt eines
 * Schemafehlers. Bestehende Agents laufen weiter.
 *
 * Gatter, nach Wirkung sortiert:
 * - Karte (`confirm_action`): Teilen (Fremde sehen ihn). Ausgeführt in
 *   `confirmController.executeAction`.
 * - `confirm=true` im Werkzeug: Löschen.
 * - direkt: ändern — privat, umkehrbar, Owner-Scope liegt in der
 *   Repository-Query.
 *
 * Parteiinterne Grenze (CLAUDE.md): System-Grüneratoren tragen ihre Rolle aus
 * `INTERN_CONTENT_DIR`. Dieses Werkzeug kennt sie NICHT — es ruft nur die
 * userId-gescopten Repository-Funktionen und weist den `gruenerator-`-
 * Namensraum vor jeder Abfrage ab. Ein geteilter Agent ist lesbar, aber ohne
 * Rolle: `listMentionableUserAgents` projiziert sie bewusst nicht, eine
 * Projekt-Freigabe erlaubt das Benutzen, nicht das Lesen des Prompts.
 *
 * Dienste kommen über `ctx.deps` herein, damit der Test ohne Postgres, Qdrant
 * und Modellaufruf jede Aktion durchspielen kann.
 */
import {
  DEFAULT_USER_AGENT_TOOLS,
  USER_SELECTABLE_TOOLS,
  agentRef,
  canonicalSkillMention,
  getAgentSlug,
  isUserSelectableTool,
  type Agent,
  type RoleLandesverbandInput,
} from '@gruenerator/shared/agents';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { NotebookQdrantHelper } from '../../../database/services/NotebookQdrantHelper.js';
import { findGroups } from '../../../services/groups/groupQueries.js';
import {
  deleteUserAgent,
  getAgentSharing,
  getUserAgent,
  listMentionableUserAgents,
  updateUserAgent,
  type MentionableUserAgentRow,
  type UserAgentPatch,
} from '../../../services/userAgents/userAgentsRepository.js';
import { emitToolConfirmAction, newActionId } from '../services/confirmActionService.js';

import {
  groundNote,
  groundRows,
  makeRow,
  NO_SESSION,
  refuseForbiddenAction,
  requireUserId,
  type PersonalToolCtx,
} from './personalDataTools.js';
import { buildRecipeCatalog } from './recipeCatalog.js';

import type { PendingAction } from '../../../agents/langgraph/ChatGraph/types.js';
import type { NotebookCollection } from '../../../database/services/NotebookQdrantHelper.js';

export interface UserAgentToolDeps {
  getUserAgent: typeof getUserAgent;
  updateUserAgent: typeof updateUserAgent;
  deleteUserAgent: typeof deleteUserAgent;
  listMentionableUserAgents: typeof listMentionableUserAgents;
  getAgentSharing: typeof getAgentSharing;
  /** Löst Notebook-IDs zu Zeilen auf — Besitzprüfung UND Name in einem Aufruf. */
  getNotebookCollectionsByIds: (ids: string[]) => Promise<NotebookCollection[]>;
  /** Was das Modell an Rezepten kennen darf — dieselbe Liste wie `rezept_laden`. */
  recipeCatalog: typeof buildRecipeCatalog;
  findGroups: typeof findGroups;
}

/** `PersonalToolCtx` plus optionale Fakes — der Katalog reicht den Ctx ohne `deps`. */
export type UserAgentToolCtx = PersonalToolCtx & { deps?: Partial<UserAgentToolDeps> };

let helperSingleton: NotebookQdrantHelper | null = null;

export function resolveUserAgentDeps(
  partial: Partial<UserAgentToolDeps> | undefined
): UserAgentToolDeps {
  return {
    getUserAgent: partial?.getUserAgent ?? getUserAgent,
    updateUserAgent: partial?.updateUserAgent ?? updateUserAgent,
    deleteUserAgent: partial?.deleteUserAgent ?? deleteUserAgent,
    listMentionableUserAgents: partial?.listMentionableUserAgents ?? listMentionableUserAgents,
    getAgentSharing: partial?.getAgentSharing ?? getAgentSharing,
    getNotebookCollectionsByIds:
      partial?.getNotebookCollectionsByIds ??
      ((ids) => (helperSingleton ??= new NotebookQdrantHelper()).getNotebookCollectionsByIds(ids)),
    recipeCatalog: partial?.recipeCatalog ?? buildRecipeCatalog,
    findGroups: partial?.findGroups ?? findGroups,
  };
}

const NOT_FOUND = 'Grünerator-Agent nicht gefunden, oder er gehört dir nicht.';
const SYSTEM_AGENT =
  'Das ist ein System-Grünerator — die lassen sich hier weder ansehen noch ändern. Das Werkzeug verwaltet nur eigene Grünerator-Agenten.';
const TYPE_LABEL = 'Grünerator-Agent';
export const GRUENERATOREN_URL = '/grueneratoren';

/** Antwort auf jeden Versuch, einen neuen Agent anzulegen — Chat, Karte, MCP. */
export const AGENT_CREATION_CLOSED =
  'Neue Grünerator-Agents lassen sich nicht mehr anlegen, auch nicht als Kopie. Lege stattdessen ein Rezept an (Werkzeug recipes) oder ein Projekt. Bestehende Agents laufen weiter und lassen sich in ein Rezept oder Projekt umwandeln.';

/** Wie viel von der Rolle die Antwort zeigt. */
const ROLE_ANSWER_CHARS = 600;

const SHARE_MODE_LABEL: Record<string, string> = {
  private: 'Privat',
  groups: 'Geteilte Projekte',
  authenticated: 'Mit Anmeldung (alle angemeldeten Personen dieser Instanz)',
};

const TOOL_LABEL = new Map(USER_SELECTABLE_TOOLS.map((t) => [t.key, t.label]));

/**
 * How the model should name an agent: someone else's by its row uuid, since
 * its identifier may belong to another owner's agent too; the caller's own by
 * its readable identifier.
 */
function sharedRef(a: MentionableUserAgentRow): string {
  return agentRef(a, !a.sharedFromGroup);
}

export function userAgentUrl(identifier: string): string {
  return `/agents/${getAgentSlug(identifier)}`;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function toolLabels(keys: readonly string[]): string {
  return keys.length ? keys.map((k) => TOOL_LABEL.get(k) ?? k).join(', ') : '—';
}

function listLabel(items: readonly string[]): string {
  return items.length ? items.join(', ') : '—';
}

/** Ein Mention darf mit `@` oder `/` getippt kommen; gespeichert wird der nackte Schlüssel. */
function normalizeMention(raw: string): string {
  return canonicalSkillMention(
    raw
      .trim()
      .replace(/^[@/]+/, '')
      .toLowerCase()
  );
}

// ---------------------------------------------------------------------------
// Validierung der Felder, die update ändern kann.
// ---------------------------------------------------------------------------

export interface AgentFieldInput {
  enabledTools?: readonly string[] | undefined;
  skillMentions?: readonly string[] | undefined;
  defaultNotebookIds?: readonly string[] | undefined;
}

export interface ValidatedAgentFields {
  enabledTools?: string[];
  skillMentions?: string[];
  defaultNotebookIds?: string[];
  /** Namen der geprüften Notebooks, für Karte und Antwort. */
  notebookNames: string[];
}

export async function validateAgentFields(params: {
  userId: string;
  userLocale: string | null;
  roles: readonly RoleLandesverbandInput[] | null;
  fields: AgentFieldInput;
  deps: UserAgentToolDeps;
}): Promise<ValidatedAgentFields | { error: string }> {
  const { userId, fields, deps } = params;
  const out: ValidatedAgentFields = { notebookNames: [] };

  if (fields.enabledTools) {
    const keys = [...new Set(fields.enabledTools.map((k) => k.trim()).filter(Boolean))];
    const bad = keys.filter((k) => !isUserSelectableTool(k));
    if (bad.length) {
      return {
        error: `Unbekannte Werkzeuge: ${bad.join(', ')}. Erlaubt sind: ${USER_SELECTABLE_TOOLS.map((t) => t.key).join(', ')}.`,
      };
    }
    out.enabledTools = keys;
  }

  if (fields.skillMentions) {
    const mentions = [...new Set(fields.skillMentions.map(normalizeMention).filter(Boolean))];
    if (mentions.length) {
      const catalog = await deps.recipeCatalog({
        userLocale: params.userLocale,
        userId,
        roles: params.roles,
      });
      const known = new Set(catalog.map((e) => e.mention.toLowerCase()));
      const bad = mentions.filter((m) => !known.has(m));
      if (bad.length) {
        return {
          error: `Unbekannte Rezepte: ${bad.join(', ')}. Die verfügbaren Rezepte nennt 'rezept_laden'.`,
        };
      }
    }
    out.skillMentions = mentions;
  }

  if (fields.defaultNotebookIds) {
    const ids = [...new Set(fields.defaultNotebookIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length) {
      const rows = await deps.getNotebookCollectionsByIds(ids);
      const byId = new Map(rows.map((r) => [r.id, r]));
      // Fremde Notebooks zählen wie fehlende — die Fehlermeldung darf nicht
      // verraten, dass es die ID gibt.
      const bad = ids.filter((id) => byId.get(id)?.user_id !== userId);
      if (bad.length) {
        return { error: `Notebook nicht gefunden oder gehört dir nicht: ${bad.join(', ')}.` };
      }
      out.notebookNames = ids.map((id) => byId.get(id)?.name ?? id);
    }
    out.defaultNotebookIds = ids;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Das Werkzeug
// ---------------------------------------------------------------------------

export function makeUserAgentsTool(ctx: UserAgentToolCtx): Tool {
  const { state, sse, threadId, sourceRegistry } = ctx;
  const deps = resolveUserAgentDeps(ctx.deps);
  const userLocale = state.userLocale ?? null;
  const roles = state.userRoles ?? null;

  return tool({
    description: `Zugriff auf die eigenen Grünerator-Agenten der Person: selbst gebaute Assistenten mit eigener Rolle, eigenen Werkzeugen, Rezepten und Notebooks, die unter /agents/<identifier> im Chat laufen.

NUTZE FÜR: die eigenen und die aus Projekten geteilten Grünerator-Agenten auflisten (list), Details eines Agenten ansehen — Rolle, Werkzeuge, Rezepte, Notebooks, Sichtbarkeit (get mit identifier), einen eigenen Agenten ändern (update mit identifier und den neuen Feldern), mit einem Projekt teilen (share_to_group mit identifier und groupName), löschen (delete mit confirm=true nach Zustimmung).

NICHT für: einen neuen Agenten anlegen oder kopieren — das geht nicht mehr; wer so etwas möchte, bekommt ein Rezept (dafür 'recipes'; anwenden mit 'rezept_laden'). Auch nicht für: eine wiederkehrende Aufgabe einrichten (dafür 'recurring_tasks'), das Projekt selbst (dafür 'groups'), die System-Grüneratoren der Plattform (die lassen sich nicht ändern).

Teilen wird der Person als Karte zur Bestätigung angezeigt — kündige nichts als geteilt an, was nur angefordert ist. Ein Agent wird über identifier (aus list, Feld ref) benannt; geteilte Agenten sind nur lesbar.`,
    inputSchema: z.object({
      action: z.enum(['list', 'get', 'create', 'update', 'duplicate', 'share_to_group', 'delete']),
      identifier: z
        .string()
        .optional()
        .describe(
          'Agent-Kennung aus list, Feld ref (get, update, duplicate, share_to_group, delete)'
        ),
      brief: z
        .string()
        .max(4000)
        .optional()
        .describe('Was der Grünerator-Agent tun soll, in ganzen Sätzen (create)'),
      title: z
        .string()
        .max(100)
        .optional()
        .describe('Anzeigename (create: statt des Entwurfs; update; duplicate: statt „… (Kopie)")'),
      description: z.string().max(500).optional().describe('Kurzbeschreibung (update)'),
      systemRole: z
        .string()
        .max(12000)
        .optional()
        .describe('Die vollständige Systemrolle (create: statt des Entwurfs; update)'),
      openingMessage: z.string().max(2000).optional().describe('Begrüßung beim Start (update)'),
      enabledTools: z
        .array(z.string())
        .max(20)
        .optional()
        .describe(
          `Werkzeugschlüssel (create; update): ${USER_SELECTABLE_TOOLS.map((t) => `${t.key} = ${t.label}`).join(', ')}`
        ),
      skillMentions: z
        .array(z.string())
        .max(20)
        .optional()
        .describe('Rezept-Mentions als Schnellstarts, z. B. presse, instagram (create; update)'),
      defaultNotebookIds: z
        .array(z.string())
        .max(10)
        .optional()
        .describe(
          'Eigene Notebooks als Wissensbasis, IDs aus notebooks list (create; update — leere Liste löst die Bindung)'
        ),
      groupName: z.string().optional().describe('Zielprojekt (share_to_group)'),
      confirm: z
        .boolean()
        .default(false)
        .describe('Nur bei delete: erst true setzen, nachdem die Person zugestimmt hat.'),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const { action } = args;

      if (action === 'list') return listAgents(userId, args.limit);
      if (action === 'create' || action === 'duplicate') return { error: AGENT_CREATION_CLOSED };

      // Alle weiteren Aktionen zielen auf EINEN Agenten.
      const identifier = args.identifier?.trim();
      if (!identifier) return { error: 'Diese Aktion braucht identifier (aus list, Feld ref).' };
      // Vor jeder Abfrage: der Registry-Namensraum ist tabu. Die Repository-
      // Query fände ihn ohnehin nicht, aber die Antwort soll sagen, WARUM.
      if (identifier.startsWith('gruenerator-')) return { error: SYSTEM_AGENT };

      if (action === 'get') return getAgent(userId, identifier);

      const forbidden = refuseForbiddenAction(state);
      if (forbidden) return forbidden;

      const agent = await deps.getUserAgent(userId, identifier);
      if (!agent) return { error: NOT_FOUND };

      if (action === 'update') return updateAgent(userId, agent, args);
      if (action === 'share_to_group') return shareCard(userId, agent, args.groupName);

      // delete
      // Kein Mensch am Lauf: der `confirm=true`-Zweischritt bestätigt sich hier
      // selbst, und die Karte, die fragen würde, ginge an einen stummen Sink.
      if (!threadId) return { error: 'Löschen ist in diesem Kontext nicht möglich.' };
      if (!args.confirm) {
        const ask = `Soll der Grünerator-Agent „${agent.title}" wirklich gelöscht werden? Frage die Person und rufe delete erst mit confirm=true erneut auf.`;
        groundNote(sourceRegistry, 'Bestätigung nötig', ask);
        return { needsConfirmation: true, note: ask };
      }
      const deleted = await deps.deleteUserAgent(userId, agent.identifier);
      if (!deleted) return { error: NOT_FOUND };
      const note = `Grünerator-Agent „${agent.title}" wurde gelöscht.`;
      groundNote(sourceRegistry, 'Gelöscht', note);
      return { ok: true, note };
    },
  });

  // -------------------------------------------------------------------------
  // list — eigene zuerst, dann die aus Projekten geteilten
  // -------------------------------------------------------------------------

  async function listAgents(userId: string, limit: number): Promise<Record<string, unknown>> {
    const rows = (await deps.listMentionableUserAgents(userId)).slice(0, limit);
    if (rows.length === 0) {
      const note = `Es gibt keine eigenen Grünerator-Agenten. Neue lassen sich nicht mehr anlegen; dafür gibt es Rezepte (Werkzeug recipes).`;
      groundNote(sourceRegistry, 'Grünerator-Agenten', note);
      return { resultCount: 0, results: [], note };
    }
    const results = rows.map((a) =>
      makeRow(
        a.title,
        userAgentUrl(sharedRef(a)),
        TYPE_LABEL,
        a.sharedFromGroup
          ? `${a.description} · geteilt aus Projekt „${a.sharedFromGroup}"`
          : a.description,
        sharedRef(a)
      )
    );
    groundRows(sourceRegistry, results);
    return { resultCount: results.length, results };
  }

  // -------------------------------------------------------------------------
  // get — Details als EIN Quellenblock; geteilte Agenten ohne Rolle
  // -------------------------------------------------------------------------

  async function getAgent(userId: string, identifier: string): Promise<Record<string, unknown>> {
    const own = await deps.getUserAgent(userId, identifier);
    if (!own) {
      // Nicht meiner — vielleicht in ein Projekt geteilt. Die Picker-Projektion
      // trägt bewusst keine Rolle; mehr gibt es über eine Freigabe nicht.
      const shared = (await deps.listMentionableUserAgents(userId)).find(
        (a) => (a.id === identifier || a.identifier === identifier) && a.sharedFromGroup
      );
      if (!shared) return { error: NOT_FOUND };
      const url = userAgentUrl(shared.id);
      const lines = [
        `Grünerator-Agent „${shared.title}" — ${url}`,
        `Beschreibung: ${shared.description}`,
        `Geteilt aus Projekt „${shared.sharedFromGroup}" — nur benutzbar, nicht änderbar; die Rolle sieht nur die Eigentümer*in.`,
      ];
      sourceRegistry.register([
        {
          source: 'eigene-inhalte',
          title: `Grünerator-Agent: ${shared.title}`,
          content: lines.join('\n'),
          url,
        },
      ]);
      return {
        agent: {
          identifier: sharedRef(shared),
          title: shared.title,
          description: shared.description,
          sharedFromGroup: shared.sharedFromGroup,
          readOnly: true,
          url,
        },
      };
    }

    const [sharing, notebooks] = await Promise.all([
      deps.getAgentSharing(userId, identifier),
      own.defaultNotebookIds?.length
        ? deps.getNotebookCollectionsByIds([...own.defaultNotebookIds])
        : Promise.resolve([] as NotebookCollection[]),
    ]);
    const nameById = new Map(notebooks.map((n) => [n.id, n.name]));
    const notebookRows = (own.defaultNotebookIds ?? []).map((id) => ({
      id,
      name: nameById.get(id) ?? id,
    }));
    const toolKeys = own.enabledTools ?? [...DEFAULT_USER_AGENT_TOOLS];
    const skillMentions = own.skillMentions ?? [];
    const shareMode = sharing?.share_mode ?? 'private';
    const url = userAgentUrl(own.identifier);
    const role = truncate(own.systemRole, ROLE_ANSWER_CHARS);
    const roleTruncated = role.length < own.systemRole.replace(/\s+/g, ' ').trim().length;

    const lines = [
      `Grünerator-Agent „${own.title}" — ${url}`,
      `Beschreibung: ${own.description}`,
      `Rolle${roleTruncated ? ' (gekürzt)' : ''}: ${role}`,
      `Werkzeuge: ${toolLabels(toolKeys)}`,
      `Rezepte: ${listLabel(skillMentions)}`,
      `Notebooks: ${listLabel(notebookRows.map((n) => n.name))}`,
      `Sichtbarkeit: ${SHARE_MODE_LABEL[shareMode] ?? shareMode}${sharing?.is_public ? ', im Marktplatz gelistet' : ''}`,
    ];
    sourceRegistry.register([
      {
        source: 'eigene-inhalte',
        title: `Grünerator-Agent: ${own.title}`,
        content: lines.join('\n'),
        url,
      },
    ]);
    return {
      agent: {
        identifier: own.identifier,
        title: own.title,
        description: own.description,
        role,
        roleTruncated,
        enabledTools: toolKeys,
        toolLabels: toolLabels(toolKeys),
        skillMentions,
        notebooks: notebookRows,
        shareMode,
        shareModeLabel: SHARE_MODE_LABEL[shareMode] ?? shareMode,
        isPublic: sharing?.is_public ?? false,
        sharedFromGroup: null,
        readOnly: false,
        url,
      },
    };
  }

  // -------------------------------------------------------------------------
  // update — direkt
  // -------------------------------------------------------------------------

  async function updateAgent(
    userId: string,
    agent: Agent,
    args: {
      title?: string | undefined;
      description?: string | undefined;
      systemRole?: string | undefined;
      openingMessage?: string | undefined;
      enabledTools?: string[] | undefined;
      skillMentions?: string[] | undefined;
      defaultNotebookIds?: string[] | undefined;
    }
  ): Promise<Record<string, unknown>> {
    const fields = await validateAgentFields({
      userId,
      userLocale,
      roles,
      fields: {
        enabledTools: args.enabledTools,
        skillMentions: args.skillMentions,
        defaultNotebookIds: args.defaultNotebookIds,
      },
      deps,
    });
    if ('error' in fields) return fields;

    const patch: UserAgentPatch = {};
    const changes: string[] = [];
    const title = args.title?.trim();
    if (title) {
      patch.title = title;
      changes.push(`heißt jetzt „${title}"`);
    }
    const description = args.description?.trim();
    if (description) {
      patch.description = description;
      changes.push('neue Beschreibung');
    }
    const systemRole = args.systemRole?.trim();
    if (systemRole) {
      patch.systemRole = systemRole;
      changes.push('neue Rolle');
    }
    const openingMessage = args.openingMessage?.trim();
    if (openingMessage) {
      patch.openingMessage = openingMessage;
      changes.push('neue Begrüßung');
    }
    if (fields.enabledTools) {
      patch.enabledTools = fields.enabledTools;
      changes.push(`Werkzeuge ${toolLabels(fields.enabledTools)}`);
    }
    if (fields.skillMentions) {
      patch.skillMentions = fields.skillMentions;
      changes.push(`Rezepte ${listLabel(fields.skillMentions)}`);
    }
    if (fields.defaultNotebookIds) {
      patch.defaultNotebookIds = fields.defaultNotebookIds;
      changes.push(`Notebooks ${listLabel(fields.notebookNames)}`);
    }
    if (changes.length === 0) {
      return {
        error:
          'update braucht mindestens eines von title, description, systemRole, openingMessage, enabledTools, skillMentions, defaultNotebookIds.',
      };
    }
    const updated = await deps.updateUserAgent(userId, agent.identifier, patch);
    if (!updated) return { error: NOT_FOUND };
    const note = `Grünerator-Agent „${agent.title}" — ${changes.join('; ')}. (${userAgentUrl(updated.identifier)})`;
    groundNote(sourceRegistry, 'Grünerator-Agent geändert', note);
    return { ok: true, note, url: userAgentUrl(updated.identifier) };
  }

  // -------------------------------------------------------------------------
  // share_to_group — Karte
  // -------------------------------------------------------------------------

  async function shareCard(
    userId: string,
    agent: Agent,
    groupName: string | undefined
  ): Promise<Record<string, unknown>> {
    if (!threadId) return { error: 'Teilen ist in diesem Kontext nicht möglich.' };
    if (!groupName?.trim()) return { error: 'share_to_group braucht groupName.' };
    // Nur Projekte, in denen die Person Mitglied ist — `findGroups` liefert auch
    // öffentliche Gruppen mit leerer Rolle.
    const groups = await deps.findGroups(userId, groupName.trim(), 5);
    const group = groups.find((g) => g.role);
    if (!group) return { error: `Kein Projekt „${groupName}" gefunden, dem du angehörst.` };
    // `group_content_shares` kennt den Agenten über seine UUID, nicht über den
    // Identifier — den trägt nur die Sharing-Projektion.
    const sharing = await deps.getAgentSharing(userId, agent.identifier);
    if (!sharing) return { error: NOT_FOUND };

    const pending: PendingAction = {
      actionId: newActionId(),
      threadId,
      userId,
      title: 'Grünerator-Agent teilen',
      preview: `„${agent.title}" → ${group.name}`,
      createdAt: Date.now(),
      type: 'share_user_agent',
      payload: {
        identifier: agent.identifier,
        agentTitle: agent.title,
        agentId: sharing.id,
        groupId: group.id,
        groupName: group.name,
      },
    };
    await emitToolConfirmAction(sse, pending, [
      { key: 'Grünerator-Agent', value: agent.title },
      { key: 'Projekt', value: group.name },
      { key: 'Berechtigung', value: 'Benutzen, nicht bearbeiten' },
    ]);
    const note = `Bestätigung zum Teilen von „${agent.title}" mit „${group.name}" angefordert.`;
    groundNote(sourceRegistry, 'Teilen', note);
    return { ok: true, needsConfirmation: true, note };
  }
}
