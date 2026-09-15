/**
 * `user_agents` — die eigenen Grünerator-Agenten (Agentura) im agentischen
 * Loop.
 *
 * EIN Werkzeug mit `action`-Enum wie `recurringTaskTools.ts` (Katalogbudget).
 * Bis 09/2026 konnte der Chat einen eigenen Agenten weder nennen noch anlegen;
 * `draftAgentSpec` (der Entwurf hinter „Agent erstellen" in der Agentura)
 * existierte, war aber nur über HTTP erreichbar. Jetzt entwirft das Werkzeug
 * aus einem Auftragstext die Rolle, zeigt sie als Karte und legt sie nach
 * Zustimmung an — dieselbe Zeile, die der Builder schreibt.
 *
 * Gatter, nach Wirkung sortiert:
 * - Karte (`confirm_action`): Anlegen (der Agent handelt danach in jedem
 *   Chat mit der entworfenen Rolle, und die Rolle ist ein LLM-Entwurf, den die
 *   Person vor dem Speichern sehen soll) und Teilen (Fremde sehen ihn).
 *   Ausgeführt in `confirmController.executeAction`.
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
  canonicalSkillMention,
  getAgentSlug,
  isUserSelectableTool,
  type Agent,
  type RoleLandesverbandInput,
} from '@gruenerator/shared/agents';
import { TEXT_MODEL_BY_ID } from '@gruenerator/shared/models';
import { generateSlugSuffix, slugifyName } from '@gruenerator/shared/utils';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { NotebookQdrantHelper } from '../../../database/services/NotebookQdrantHelper.js';
import { findGroups } from '../../../services/groups/groupQueries.js';
import { draftAgentSpec } from '../../../services/userAgents/agentDraftService.js';
import {
  createUserAgent,
  deleteUserAgent,
  getAgentSharing,
  getUserAgent,
  listMentionableUserAgents,
  updateUserAgent,
  type UserAgentInput,
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
  draftAgentSpec: typeof draftAgentSpec;
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
    draftAgentSpec: partial?.draftAgentSpec ?? draftAgentSpec,
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
export const AGENTURA_URL = '/agentura';

/** Wie viel von der Rolle die Karte zeigt — und wie viel die Antwort. */
const ROLE_PREVIEW_CHARS = 140;
const ROLE_ANSWER_CHARS = 600;

const SHARE_MODE_LABEL: Record<string, string> = {
  private: 'Privat',
  groups: 'Geteilte Projekte',
  authenticated: 'Mit Anmeldung (alle angemeldeten Personen dieser Instanz)',
};

const TOOL_LABEL = new Map(USER_SELECTABLE_TOOLS.map((t) => [t.key, t.label]));

/** Wie der Web-Builder: der Allrounder des Composers. */
const DEFAULT_AGENT_MODEL = TEXT_MODEL_BY_ID['gruenerator-ultra'];

export function userAgentUrl(identifier: string): string {
  return `/agents/${getAgentSlug(identifier)}`;
}

/**
 * Identifier aus dem Titel, genau wie `AgentEditor.tsx`: Slug plus zufälliges
 * 6-Zeichen-Suffix (kleingeschrieben, wegen `^[a-z0-9-]+$`). Der Suffix macht
 * Kollisionen praktisch unmöglich; `createUserAgentSafely` fängt den Rest.
 */
export function deriveAgentIdentifier(title: string): string {
  return `${slugifyName(title, 'agent')}-${generateSlugSuffix().toLowerCase()}`;
}

/**
 * Anlegen mit EINEM zweiten Versuch bei Identifier-Kollision (Unique-Verstoß
 * aus Postgres) — der HTTP-Router antwortet 409, aber eine bestätigte Karte
 * darf nicht an einem zufälligen Suffix scheitern.
 */
export async function createUserAgentSafely(userId: string, input: UserAgentInput): Promise<Agent> {
  try {
    return await createUserAgent(userId, input);
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes('unique')) throw err;
    const retitled = { ...input, identifier: deriveAgentIdentifier(input.title) };
    return createUserAgent(userId, retitled);
  }
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
// Validierung der Felder, die create und update teilen — auch der MCP-Pfad
// (`mcpMutations.createUserAgentMcp`) läuft hier durch.
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
// create — Entwurf + explizite Felder → fertiger Repository-Input
// ---------------------------------------------------------------------------

export interface PrepareUserAgentParams {
  userId: string;
  userLocale: string | null;
  roles: readonly RoleLandesverbandInput[] | null;
  brief: string;
  title?: string | undefined;
  systemRole?: string | undefined;
  fields: AgentFieldInput;
  deps: UserAgentToolDeps;
}

export interface PreparedUserAgent {
  input: UserAgentInput;
  /** Die Zeilen der Karte — auch der MCP-Rückfragetext liest sie. */
  preview: Array<{ key: string; value: string }>;
}

/**
 * Der Entwurf (`draftAgentSpec`) liefert Titel, Rolle, Werkzeuge, Rezepte,
 * Icon und Begrüßung; explizit genannte Felder gewinnen. Geprüft wird VOR dem
 * Modellaufruf — ein falscher Werkzeugschlüssel soll keinen Entwurf kosten.
 * Fällt der Entwurf aus, kommt ein Fehler zurück, den das Modell weitergeben
 * kann, und keine Karte.
 */
export async function prepareUserAgentInput(
  params: PrepareUserAgentParams
): Promise<PreparedUserAgent | { error: string }> {
  const { userId, deps } = params;
  const brief = params.brief.trim();
  if (!brief) return { error: 'create braucht brief — was der Grünerator-Agent tun soll.' };

  const fields = await validateAgentFields({
    userId,
    userLocale: params.userLocale,
    roles: params.roles,
    fields: params.fields,
    deps,
  });
  if ('error' in fields) return fields;

  let draft: Awaited<ReturnType<typeof draftAgentSpec>>;
  try {
    draft = await deps.draftAgentSpec([{ role: 'user', content: brief }]);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      error: `Der Entwurf für den Grünerator-Agent konnte nicht erstellt werden (${reason}). Später erneut versuchen oder den Agenten in der Agentura (${AGENTURA_URL}) anlegen.`,
    };
  }

  const title = (params.title?.trim() || draft.title).slice(0, 100);
  const systemRole = params.systemRole?.trim() || draft.systemRole;
  const enabledTools = fields.enabledTools ?? draft.enabledTools;
  const skillMentions = fields.skillMentions ?? draft.skillMentions;
  // Profil-Locale schlägt den Entwurf: eine AT-Person bekommt keinen DE-Agenten,
  // nur weil der Auftrag Österreich nicht erwähnt hat.
  const locale = params.userLocale === 'de-AT' ? 'de-AT' : draft.locale;

  const input: UserAgentInput = {
    identifier: deriveAgentIdentifier(title),
    title,
    description: draft.description,
    systemRole,
    avatar: '✨',
    iconKey: draft.iconKey,
    backgroundColor: draft.backgroundColor,
    tags: [],
    model: DEFAULT_AGENT_MODEL.model,
    provider: DEFAULT_AGENT_MODEL.provider,
    params: { max_tokens: 3000, temperature: 0.5 },
    openingMessage: draft.openingMessage,
    openingQuestions: draft.openingQuestions,
    locale,
    author: 'Eigener Grünerator-Agent',
    enabledTools: enabledTools.length ? enabledTools : [...DEFAULT_USER_AGENT_TOOLS],
    skillMentions,
    ...(fields.defaultNotebookIds?.length ? { defaultNotebookIds: fields.defaultNotebookIds } : {}),
  };

  return {
    input,
    preview: [
      { key: 'Name', value: input.title },
      { key: 'Rolle', value: truncate(input.systemRole, ROLE_PREVIEW_CHARS) },
      { key: 'Werkzeuge', value: toolLabels(input.enabledTools ?? []) },
      { key: 'Rezepte', value: listLabel(skillMentions) },
      { key: 'Notebooks', value: listLabel(fields.notebookNames) },
    ],
  };
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
    description: `Zugriff auf die eigenen Grünerator-Agenten der Person (Agentura): selbst gebaute Assistenten mit eigener Rolle, eigenen Werkzeugen, Rezepten und Notebooks, die unter /agents/<identifier> im Chat laufen.

NUTZE FÜR: die eigenen und die aus Projekten geteilten Grünerator-Agenten auflisten (list), Details eines Agenten ansehen — Rolle, Werkzeuge, Rezepte, Notebooks, Sichtbarkeit (get mit identifier), einen neuen Agenten anlegen — „bau mir einen Agenten, der …" (create mit brief; optional title, systemRole, enabledTools, skillMentions, defaultNotebookIds), einen eigenen Agenten ändern (update mit identifier und den neuen Feldern), mit einem Projekt teilen (share_to_group mit identifier und groupName), löschen (delete mit confirm=true nach Zustimmung).

NICHT für: eine wiederkehrende Aufgabe für einen Agenten einrichten (dafür 'recurring_tasks'), Rezepte oder Textformen verwalten (dafür 'rezept_laden' zum Anwenden), das Projekt selbst (dafür 'groups'), die System-Grüneratoren der Plattform (die lassen sich nicht ändern).

Für create genügt brief: eine Beschreibung in ganzen Sätzen, was der Agent tun soll, für wen und in welchem Ton — daraus wird die Systemrolle entworfen; mit update lässt sie sich danach verfeinern. Anlegen und Teilen werden der Person als Karte zur Bestätigung angezeigt — kündige nichts als angelegt oder geteilt an, was nur angefordert ist. Ein Agent wird über identifier (aus list, Feld ref) benannt; geteilte Agenten sind nur lesbar.`,
    inputSchema: z.object({
      action: z.enum(['list', 'get', 'create', 'update', 'share_to_group', 'delete']),
      identifier: z
        .string()
        .optional()
        .describe('Agent-Kennung aus list, Feld ref (get, update, share_to_group, delete)'),
      brief: z
        .string()
        .max(4000)
        .optional()
        .describe('Was der Grünerator-Agent tun soll, in ganzen Sätzen (create)'),
      title: z
        .string()
        .max(100)
        .optional()
        .describe('Anzeigename (create: statt des Entwurfs; update)'),
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
      if (action === 'create') return createCard(userId, args);

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
      const note = `Es gibt noch keine eigenen Grünerator-Agenten. Anlegen geht hier mit create oder in der Agentura (${AGENTURA_URL}).`;
      groundNote(sourceRegistry, 'Grünerator-Agenten', note);
      return { resultCount: 0, results: [], note };
    }
    const results = rows.map((a) =>
      makeRow(
        a.title,
        userAgentUrl(a.identifier),
        TYPE_LABEL,
        a.sharedFromGroup
          ? `${a.description} · geteilt aus Projekt „${a.sharedFromGroup}"`
          : a.description,
        a.identifier
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
        (a) => a.identifier === identifier && a.sharedFromGroup
      );
      if (!shared) return { error: NOT_FOUND };
      const url = userAgentUrl(shared.identifier);
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
          identifier: shared.identifier,
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
      `Sichtbarkeit: ${SHARE_MODE_LABEL[shareMode] ?? shareMode}${sharing?.is_public ? ', in der Agentura gelistet' : ''}`,
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
  // create — Karte
  // -------------------------------------------------------------------------

  async function createCard(
    userId: string,
    args: {
      brief?: string | undefined;
      title?: string | undefined;
      systemRole?: string | undefined;
      enabledTools?: string[] | undefined;
      skillMentions?: string[] | undefined;
      defaultNotebookIds?: string[] | undefined;
    }
  ): Promise<Record<string, unknown>> {
    if (!threadId) return { error: 'Anlegen ist in diesem Kontext nicht möglich.' };
    const forbidden = refuseForbiddenAction(state);
    if (forbidden) return forbidden;
    if (!args.brief?.trim()) {
      return { error: 'create braucht brief — was der Grünerator-Agent tun soll.' };
    }

    const prepared = await prepareUserAgentInput({
      userId,
      userLocale,
      roles,
      brief: args.brief,
      title: args.title,
      systemRole: args.systemRole,
      fields: {
        enabledTools: args.enabledTools,
        skillMentions: args.skillMentions,
        defaultNotebookIds: args.defaultNotebookIds,
      },
      deps,
    });
    if ('error' in prepared) return prepared;
    const { input, preview } = prepared;

    const pending: PendingAction = {
      actionId: newActionId(),
      threadId,
      userId,
      title: 'Grünerator-Agent anlegen',
      preview: `„${input.title}" — ${truncate(input.description, 80)}`,
      createdAt: Date.now(),
      type: 'create_user_agent',
      payload: { input },
    };
    await emitToolConfirmAction(sse, pending, preview);
    const note = `Bestätigung angefordert: Grünerator-Agent „${input.title}" anlegen (Werkzeuge: ${toolLabels(input.enabledTools ?? [])}). Die Rolle ist ein Entwurf und lässt sich danach mit update verfeinern.`;
    groundNote(sourceRegistry, 'Grünerator-Agent anlegen', note);
    return { ok: true, needsConfirmation: true, note };
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
