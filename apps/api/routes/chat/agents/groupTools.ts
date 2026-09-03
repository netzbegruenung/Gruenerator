/**
 * `groups` — die Projekte (Gruppen) der Person im agentischen Loop.
 *
 * EIN Werkzeug mit `action`-Enum wie `cloudFileTools.ts` und `notebookTools.ts`
 * (Katalogbudget). Bis 09/2026 konnte es nur auflisten, finden, anlegen und
 * beitreten; jetzt deckt es die Projektseite ab, soweit sie Inhalte und
 * Einstellungen betrifft: Details, geteilte Inhalte, Name/Beschreibung,
 * Sichtbarkeit. Mitglieder verwalten (einladen, entfernen, Rollen) bleibt
 * bewusst der Projektseite vorbehalten — der Werkzeugtext sagt das dem Modell.
 *
 * Gatter, nach Wirkung sortiert:
 * - Karte (`confirm_action`): Anlegen, Beitreten (Mitglieder werden
 *   benachrichtigt) und Sichtbarkeit (öffentlich gelistet = Fremde sehen das
 *   Projekt und können um Aufnahme bitten). Ausgeführt in
 *   `confirmController.executeAction`.
 * - direkt: Name und Beschreibung — umkehrbar, nur Mitglieder sehen es;
 *   Admin-Pflicht liegt im Dienst (`updateGroupInfo`).
 *
 * Ein Projekt wird über `groupId` (aus list/find, Feld ref) oder `groupName`
 * aufgelöst — beim Namen nur unter Projekten, in denen die Person Mitglied
 * ist, dieselbe Regel wie `documents.share_to_group`. `findGroups` liefert
 * auch öffentliche Fremdgruppen mit leerer Rolle; auf die darf nichts zeigen.
 *
 * Dienste kommen über `ctx.deps` herein, damit der Test ohne Postgres jede
 * Aktion durchspielen kann.
 */
import { getAgentSlug, getSystemAgent } from '@gruenerator/shared/agents';
import { buildGroupSlug, buildNotebookSlug } from '@gruenerator/shared/utils';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { hydrateGroupContent } from '../../../services/groups/groupContent.js';
import { getGroupByToken, updateGroupInfo } from '../../../services/groups/groupMutations.js';
import {
  countGroupContent,
  findGroups,
  getGroupForMember,
  listUserGroups,
} from '../../../services/groups/groupQueries.js';
import { officeKindLabel, officeUrl } from '../../docs/docsSearch.js';
import { emitToolConfirmAction, newActionId } from '../services/confirmActionService.js';

import {
  groundNote,
  groundRows,
  makeRow,
  NO_SESSION,
  refuseForbiddenAction,
  requireUserId,
  type PersonalToolCtx,
  type ResultRow,
} from './personalDataTools.js';

import type { PendingAction } from '../../../agents/langgraph/ChatGraph/types.js';
import type { GroupContentBuckets } from '../../../services/groups/groupContent.js';
import type { GroupDetailRow } from '../../../services/groups/groupQueries.js';
import type { GroupAudience } from '@gruenerator/contracts';

export interface GroupToolDeps {
  listUserGroups: typeof listUserGroups;
  findGroups: typeof findGroups;
  getGroupByToken: typeof getGroupByToken;
  getGroupForMember: typeof getGroupForMember;
  countGroupContent: typeof countGroupContent;
  hydrateGroupContent: (groupId: string) => Promise<GroupContentBuckets>;
  updateGroupInfo: typeof updateGroupInfo;
}

/** `PersonalToolCtx` plus optionale Fakes — der Katalog reicht den Ctx ohne `deps`. */
export type GroupToolCtx = PersonalToolCtx & { deps?: Partial<GroupToolDeps> };

function resolveDeps(partial: Partial<GroupToolDeps> | undefined): GroupToolDeps {
  return {
    listUserGroups: partial?.listUserGroups ?? listUserGroups,
    findGroups: partial?.findGroups ?? findGroups,
    getGroupByToken: partial?.getGroupByToken ?? getGroupByToken,
    getGroupForMember: partial?.getGroupForMember ?? getGroupForMember,
    countGroupContent: partial?.countGroupContent ?? countGroupContent,
    hydrateGroupContent: partial?.hydrateGroupContent ?? ((id) => hydrateGroupContent(id)),
    updateGroupInfo: partial?.updateGroupInfo ?? updateGroupInfo,
  };
}

const AUDIENCE_LABEL: Record<GroupAudience, string> = {
  'de-DE': 'Deutschland',
  'de-AT': 'Österreich',
  all: 'Deutschland und Österreich',
};

const NOT_MEMBER = 'Projekt nicht gefunden, oder du bist kein Mitglied.';
const ADMIN_ONLY = 'Das kann nur ein Admin des Projekts.';

export function groupUrl(g: { id: string; name: string; slug_suffix: string | null }): string {
  return `/gruppen/${g.slug_suffix ? buildGroupSlug(g.name, g.slug_suffix) : g.id}`;
}

function visibilityLabel(isPublic: boolean, audience: GroupAudience): string {
  return isPublic
    ? `öffentlich gelistet (${AUDIENCE_LABEL[audience]})`
    : 'privat (Beitritt nur per Einladungslink)';
}

function str(item: Record<string, unknown>, key: string): string | null {
  const v = item[key];
  return typeof v === 'string' && v ? v : null;
}

/**
 * Die Buckets der Gruppenseite als klickbare Zeilen. Jede Zeile trägt nur
 * Titel, URL, Typ und Snippet — was ein Bucket sonst noch mitbringt (Inhalt,
 * Berechtigungen, Besitzer-IDs) bleibt hier. Buckets ohne eigene Seite (Texte,
 * System-Notebooks) zeigen auf die Projektseite, wo sie liegen.
 */
export function groupContentRows(buckets: GroupContentBuckets, projectUrl: string): ResultRow[] {
  const rows: ResultRow[] = [];
  const sharedBy = (item: Record<string, unknown>): string | null => {
    const name = str(item, 'shared_by_name');
    return name && name !== 'Unknown User' ? `geteilt von ${name}` : null;
  };

  for (const item of buckets.collaborative_documents) {
    const id = str(item, 'id');
    if (!id) continue;
    const subtype = str(item, 'document_subtype');
    rows.push(
      makeRow(
        str(item, 'title') ?? '',
        subtype === 'canvas' ? `/studio/canvas/${id}` : officeUrl(subtype, id),
        officeKindLabel(subtype),
        sharedBy(item)
      )
    );
  }
  for (const item of buckets.notebooks) {
    const id = str(item, 'id');
    const name = str(item, 'name') ?? '';
    if (!id) continue;
    const slug = str(item, 'slug_suffix');
    rows.push(
      makeRow(
        name,
        `/notebooks/${slug ? buildNotebookSlug(name, slug) : id}`,
        'Notebook',
        str(item, 'description') ?? sharedBy(item)
      )
    );
  }
  for (const item of buckets.documents) {
    const id = str(item, 'id');
    if (!id) continue;
    rows.push(
      makeRow(
        str(item, 'title') ?? str(item, 'filename') ?? '',
        `/documents/${id}`,
        'Datei',
        sharedBy(item)
      )
    );
  }
  for (const item of buckets.user_agents) {
    const identifier = str(item, 'identifier') ?? str(item, 'id');
    if (!identifier) continue;
    rows.push(
      makeRow(
        str(item, 'title') ?? identifier,
        `/agents/${getAgentSlug(identifier)}`,
        'Grünerator-Agent',
        str(item, 'description') ?? sharedBy(item)
      )
    );
  }
  for (const item of buckets.system_agents) {
    const id = str(item, 'id');
    if (!id) continue;
    rows.push(
      makeRow(
        getSystemAgent(id)?.title ?? id,
        `/agents/${getAgentSlug(id)}`,
        'Grünerator-Agent',
        sharedBy(item)
      )
    );
  }
  for (const item of buckets.generators) {
    const id = str(item, 'id');
    if (!id) continue;
    rows.push(
      makeRow(
        str(item, 'title') ?? str(item, 'name') ?? '',
        `/gruenerator/${id}`,
        'Grünerator',
        str(item, 'description') ?? sharedBy(item)
      )
    );
  }
  for (const item of buckets.canvas_templates) {
    const id = str(item, 'id');
    if (!id) continue;
    rows.push(
      makeRow(str(item, 'title') ?? '', `/studio/canvas/${id}`, 'Sharepic-Vorlage', sharedBy(item))
    );
  }
  for (const item of buckets.templates) {
    rows.push(
      makeRow(
        str(item, 'title') ?? '',
        str(item, 'external_url') ?? projectUrl,
        'Vorlage',
        str(item, 'description') ?? sharedBy(item)
      )
    );
  }
  for (const item of buckets.texts) {
    const words = typeof item.word_count === 'number' ? `${item.word_count} Wörter` : null;
    rows.push(makeRow(str(item, 'title') ?? '', projectUrl, 'Text', words ?? sharedBy(item)));
  }
  for (const item of buckets.system_notebooks) {
    const id = str(item, 'id');
    if (!id) continue;
    rows.push(makeRow(id, projectUrl, 'Notebook (System)', sharedBy(item)));
  }
  return rows;
}

export function makeGroupsTool(ctx: GroupToolCtx): Tool {
  const { state, sse, threadId, sourceRegistry } = ctx;
  const deps = resolveDeps(ctx.deps);

  return tool({
    description: `Zugriff auf die Projekte (Gruppen) der Person — gemeinsame Arbeitsbereiche im Team, in denen Dokumente, Notebooks und Agenten geteilt werden.

NUTZE FÜR: eigene Projekte auflisten (list), ein Projekt per Name finden (find mit query), Details eines Projekts — Beschreibung, Rolle, Mitgliederzahl, Sichtbarkeit, Anzahl geteilter Inhalte — ansehen (get), die geteilten Inhalte eines Projekts mit Links auflisten (content — „was liegt im Projekt X?"), ein neues Projekt anlegen (create, braucht name), per Einladungslink/-token beitreten (join, braucht joinToken), Name oder Beschreibung ändern (update, nur Admins), ein Projekt öffentlich listen oder privat stellen (set_visibility mit isPublic, nur Admins).

NICHT für: Inhalte MIT einem Projekt teilen (dafür 'documents' action=share_to_group bzw. 'notebooks' action=share_to_group), den Inhalt eines geteilten Dokuments lesen (dafür 'read_artifact' oder 'documents' action=get mit der id aus content), ein geteiltes Notebook befragen (dafür 'notebooks' action=search). Mitglieder einladen, entfernen oder Rollen ändern ist im Chat nicht möglich — dafür auf die Projektseite verweisen.

Ein Projekt wird über groupId (aus list/find, Feld ref) oder groupName benannt. Erstellen, Beitreten und Sichtbarkeit werden der Person als Karte zur Bestätigung angezeigt — kündige nichts als erledigt an, was nur angefordert ist.`,
    inputSchema: z.object({
      action: z.enum([
        'list',
        'find',
        'get',
        'content',
        'create',
        'join',
        'update',
        'set_visibility',
      ]),
      query: z.string().optional().describe('Projektname (nur bei action="find")'),
      groupId: z
        .string()
        .optional()
        .describe('Projekt-ID aus list/find, Feld ref (get, content, update, set_visibility)'),
      groupName: z
        .string()
        .optional()
        .describe('Projektname statt groupId (get, content, update, set_visibility)'),
      name: z
        .string()
        .optional()
        .describe('Name des neuen Projekts (create) bzw. neuer Name (update)'),
      description: z
        .string()
        .optional()
        .describe('Beschreibung (create) bzw. neue Beschreibung (update; leer = entfernen)'),
      joinToken: z
        .string()
        .optional()
        .describe('Einladungs-Token/-Link des Projekts (nur bei action="join")'),
      isPublic: z
        .boolean()
        .optional()
        .describe('set_visibility: true = unter „Projekte entdecken" listen, false = privat'),
      audience: z
        .enum(['de-DE', 'de-AT', 'all'])
        .optional()
        .describe('set_visibility: wem das Projekt gelistet wird (Standard: unverändert)'),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const { action, limit } = args;

      if (action === 'create') {
        // No artifact noun to bind to — only an action-level prohibition
        // ("nichts speichern", "keine Aktion") can rule a group out.
        const forbidden = refuseForbiddenAction(state);
        if (forbidden) return forbidden;
        const groupName = args.name?.trim();
        if (!groupName) return { error: 'create braucht einen name.' };
        if (!threadId) return { error: 'Erstellen ist in diesem Kontext nicht möglich.' };
        const pending: PendingAction = {
          actionId: newActionId(),
          threadId,
          userId,
          title: 'Gruppe erstellen',
          preview: `„${groupName}" anlegen`,
          createdAt: Date.now(),
          type: 'create_group',
          payload: { name: groupName, description: args.description?.trim() || null },
        };
        await emitToolConfirmAction(sse, pending, [{ key: 'Gruppe', value: groupName }]);
        const note = `Bestätigung zum Erstellen der Gruppe „${groupName}" angefordert.`;
        groundNote(sourceRegistry, 'Gruppe erstellen', note);
        return { ok: true, note };
      }

      if (action === 'join') {
        const token = args.joinToken?.trim();
        if (!token) return { error: 'join braucht einen joinToken.' };
        if (!threadId) return { error: 'Beitreten ist in diesem Kontext nicht möglich.' };
        const group = await deps.getGroupByToken(token);
        if (!group) return { error: 'Ungültiger oder abgelaufener Einladungslink.' };
        const pending: PendingAction = {
          actionId: newActionId(),
          threadId,
          userId,
          title: 'Gruppe beitreten',
          preview: `„${group.name}" beitreten`,
          createdAt: Date.now(),
          type: 'join_group',
          payload: { joinToken: token, groupName: group.name },
        };
        await emitToolConfirmAction(sse, pending, [{ key: 'Gruppe', value: group.name }]);
        const note = `Bestätigung zum Beitritt zur Gruppe „${group.name}" angefordert.`;
        groundNote(sourceRegistry, 'Gruppe beitreten', note);
        return { ok: true, note };
      }

      if (action === 'find') {
        const q = (args.query ?? '').trim();
        if (!q) return { error: 'find braucht einen Suchbegriff.' };
        const groups = await deps.findGroups(userId, q, limit);
        const results = groups.map((g) =>
          makeRow(g.name, groupUrl(g), 'Projekt', `${g.member_count} Mitglieder`, g.id)
        );
        groundRows(sourceRegistry, results);
        return { resultCount: results.length, results };
      }

      if (action === 'list') {
        const groups = await deps.listUserGroups(userId, limit);
        const results = groups.map((g) =>
          makeRow(
            g.name,
            groupUrl(g),
            'Projekt',
            `${g.role || 'Mitglied'} · ${g.member_count} Mitglieder`,
            g.id
          )
        );
        groundRows(sourceRegistry, results);
        return { resultCount: results.length, results };
      }

      // Alle weiteren Aktionen zielen auf EIN Projekt.
      const resolved = await resolveGroup(userId, args.groupId, args.groupName);
      if ('error' in resolved) return resolved;
      const group = resolved.group;

      if (action === 'get') return getGroup(group);

      if (action === 'content') {
        const buckets = await deps.hydrateGroupContent(group.id);
        const all = groupContentRows(buckets, groupUrl(group));
        const results = all.slice(0, limit);
        if (results.length === 0) {
          const note = `Im Projekt „${group.name}" ist noch nichts geteilt.`;
          groundNote(sourceRegistry, `Projekt „${group.name}"`, note);
          return { project: group.name, resultCount: 0, results, note };
        }
        groundRows(sourceRegistry, results);
        return {
          project: group.name,
          resultCount: results.length,
          ...(all.length > results.length ? { total: all.length } : {}),
          results,
        };
      }

      if (action === 'update') {
        const forbidden = refuseForbiddenAction(state);
        if (forbidden) return forbidden;
        const name = args.name?.trim();
        const description = args.description?.trim();
        if (name === undefined && args.description === undefined) {
          return { error: 'update braucht name oder description.' };
        }
        if (!group.isAdmin) return { error: ADMIN_ONLY };
        const outcome = await deps.updateGroupInfo(group.id, userId, {
          ...(name !== undefined ? { name } : {}),
          ...(args.description !== undefined ? { description: description || null } : {}),
        });
        if (!outcome.success) return { error: outcome.message };
        const parts: string[] = [];
        if (name !== undefined) parts.push(`heißt jetzt „${name}"`);
        if (args.description !== undefined) {
          parts.push(description ? `Beschreibung: ${description}` : 'Beschreibung entfernt');
        }
        const note = `Projekt „${group.name}" — ${parts.join('; ')}.`;
        groundNote(sourceRegistry, 'Projekt geändert', note);
        return { ok: true, note };
      }

      // set_visibility
      return setVisibilityCard(userId, group, args.isPublic, args.audience);
    },
  });

  async function resolveGroup(
    userId: string,
    groupId: string | undefined,
    groupName: string | undefined
  ): Promise<{ group: GroupDetailRow } | { error: string }> {
    const id = groupId?.trim();
    if (id) {
      const group = await deps.getGroupForMember(id, userId);
      return group ? { group } : { error: NOT_MEMBER };
    }
    const name = groupName?.trim();
    if (!name) return { error: 'Diese Aktion braucht groupId (aus list/find) oder groupName.' };
    const candidates = (await deps.findGroups(userId, name, 5)).filter((g) => g.role);
    if (candidates.length === 0) {
      return { error: `Kein Projekt „${name}" gefunden, dem du angehörst.` };
    }
    const exact = candidates.find((g) => g.name.toLowerCase() === name.toLowerCase());
    if (!exact && candidates.length > 1) {
      return {
        error: `Mehrere Projekte passen auf „${name}": ${candidates.map((g) => `${g.name} (${g.id})`).join(', ')}. Nimm groupId.`,
      };
    }
    const group = await deps.getGroupForMember((exact ?? candidates[0]).id, userId);
    return group ? { group } : { error: NOT_MEMBER };
  }

  // -------------------------------------------------------------------------
  // get — Details als EIN Quellenblock
  // -------------------------------------------------------------------------

  async function getGroup(group: GroupDetailRow): Promise<Record<string, unknown>> {
    const url = groupUrl(group);
    const contentCount = await deps.countGroupContent(group.id);
    const lines = [
      `Projekt „${group.name}" — ${url}`,
      group.description ? `Beschreibung: ${group.description}` : null,
      group.group_type === 'personal'
        ? 'Persönlicher Space (nur du)'
        : `${group.member_count} Mitglied(er); deine Rolle: ${group.isAdmin ? 'Admin' : 'Mitglied'}`,
      `Sichtbarkeit: ${visibilityLabel(group.is_public, group.audience)}`,
      contentCount
        ? `${contentCount} geteilte(r) Inhalt(e) — action="content" listet sie mit Links`
        : 'Noch keine geteilten Inhalte',
    ].filter((l): l is string => Boolean(l));
    sourceRegistry.register([
      { source: 'eigene-inhalte', title: `Projekt: ${group.name}`, content: lines.join('\n'), url },
    ]);
    return {
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        url,
        role: group.role,
        isAdmin: group.isAdmin,
        memberCount: group.member_count,
        isPublic: group.is_public,
        audience: group.audience,
        groupType: group.group_type,
        contentCount,
      },
    };
  }

  // -------------------------------------------------------------------------
  // set_visibility — Karte
  // -------------------------------------------------------------------------

  async function setVisibilityCard(
    userId: string,
    group: GroupDetailRow,
    isPublic: boolean | undefined,
    audienceArg: GroupAudience | undefined
  ): Promise<Record<string, unknown>> {
    if (!threadId) return { error: 'Sichtbarkeit ändern ist in diesem Kontext nicht möglich.' };
    const forbidden = refuseForbiddenAction(state);
    if (forbidden) return forbidden;
    if (isPublic === undefined) return { error: 'set_visibility braucht isPublic (true/false).' };
    if (!group.isAdmin) return { error: ADMIN_ONLY };
    // „Projekte entdecken" blendet persönliche Spaces aus — eine Karte, die
    // nichts Sichtbares bewirkt, wäre eine Lüge.
    if (isPublic && group.group_type === 'personal') {
      return { error: 'Ein persönlicher Space kann nicht öffentlich gelistet werden.' };
    }
    const audience = audienceArg ?? group.audience;
    if (isPublic === group.is_public && audience === group.audience) {
      const note = `Projekt „${group.name}" ist schon ${visibilityLabel(isPublic, audience)}.`;
      groundNote(sourceRegistry, 'Sichtbarkeit', note);
      return { ok: true, note };
    }

    const pending: PendingAction = {
      actionId: newActionId(),
      threadId,
      userId,
      title: 'Sichtbarkeit des Projekts ändern',
      preview: `${group.name}: ${isPublic ? 'öffentlich' : 'privat'}`,
      createdAt: Date.now(),
      type: 'set_group_visibility',
      payload: { groupId: group.id, groupName: group.name, is_public: isPublic, audience },
    };
    await emitToolConfirmAction(sse, pending, [
      { key: 'Projekt', value: group.name },
      { key: 'Sichtbarkeit', value: isPublic ? 'Öffentlich gelistet' : 'Privat' },
      ...(isPublic ? [{ key: 'Zielgruppe', value: AUDIENCE_LABEL[audience] }] : []),
    ]);
    const note = `Bestätigung angefordert: Projekt „${group.name}" ${isPublic ? 'öffentlich listen' : 'privat stellen'}.`;
    groundNote(sourceRegistry, 'Sichtbarkeit', note);
    return { ok: true, needsConfirmation: true, note };
  }
}
