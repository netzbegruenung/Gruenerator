/**
 * MCP-native handlers for the personal-data actions that use the chat
 * SSE-confirm flow. MCP has no confirm cards: socially-visible mutations use
 * the in-band two-step `confirm=true` protocol, the rest execute directly
 * against the same service layer the confirm executor calls.
 */
import { createRecurringTaskBodySchema } from '@gruenerator/contracts';
import { buildGroupSlug } from '@gruenerator/shared/utils';

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { addRowsToBoard } from '../../services/boards/BoardService.js';
import { shareDocumentToGroup } from '../../services/docs/shareDocumentToGroup.js';
import { shareContentToGroup } from '../../services/groups/groupContent.js';
import {
  createGroupForUser,
  getGroupByToken,
  joinGroupByToken,
  setGroupVisibility,
} from '../../services/groups/groupMutations.js';
import { findGroups, getGroupForMember } from '../../services/groups/groupQueries.js';
import { applyNotebookVisibility } from '../../services/notebook/notebookVisibility.js';
import {
  attachWolkeFolderToNotebook,
  previewWolkeFolder,
} from '../../services/notebook/notebookWolkeAttach.js';
import {
  DELIVERY_LABELS_DE,
  describeRecurrence,
  formatNextRun,
} from '../../services/recurringTasks/recurringTaskLabels.js';
import { createRecurringTask } from '../../services/recurringTasks/recurringTasksRepository.js';
import { getProfileService } from '../../services/user/ProfileService.js';
import { getAgentSharing, getUserAgent } from '../../services/userAgents/userAgentsRepository.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { getAgentForUser } from '../chat/agents/agentLoader.js';
import { createNotebookDirect, notebookUrl } from '../chat/agents/notebookTools.js';
import { RECURRING_TASKS_URL } from '../chat/agents/recurringTaskTools.js';
import {
  createUserAgentSafely,
  prepareUserAgentInput,
  resolveUserAgentDeps,
  userAgentUrl,
} from '../chat/agents/userAgentTools.js';
import { hasWriteAccess } from '../chat/confirmController.js';
import { checkNotebookAccess } from '../notebook/notebookAccess.js';

import { absolutizeUrl } from './chatToolBridge.js';

import type { AttachWolkeFolderResult } from '../../services/notebook/notebookWolkeAttach.js';

async function findLiveDocument(id: string): Promise<{ title: string; created_by: string } | null> {
  const rows = (await getPostgresInstance().query(
    'SELECT title, created_by FROM collaborative_documents WHERE id = $1 AND is_deleted = false',
    [id]
  )) as { title: string; created_by: string }[];
  return rows[0] ?? null;
}

type ToolResult =
  { ok: true; note: string } | { needsConfirmation: true; note: string } | { error: string };

export async function addCardDirect(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const boardId = typeof args.boardId === 'string' ? args.boardId : null;
  const title = typeof args.title === 'string' ? args.title.trim() : '';
  if (!boardId || !title) return { error: 'add_card braucht boardId und title.' };

  // No loadBoardState here — addRowsToBoard decodes the Yjs doc itself.
  const board = await findLiveDocument(boardId);
  if (!board) return { error: 'Board nicht gefunden oder kein Zugriff.' };
  if (!(await hasWriteAccess(boardId, userId))) {
    return { error: 'Keine Berechtigung, dieses Board zu bearbeiten.' };
  }

  const row: Record<string, unknown> = { title };
  if (typeof args.status === 'string' && args.status) row.status = args.status;
  if (typeof args.description === 'string' && args.description) row.description = args.description;
  if (typeof args.dueDate === 'string' && args.dueDate) row.dueDate = args.dueDate;
  if (typeof args.assignee === 'string' && args.assignee) row.assignee = args.assignee;

  await addRowsToBoard(boardId, [row], userId);
  return {
    ok: true,
    note: `Karte „${title}" wurde zu „${board.title}" hinzugefügt (${absolutizeUrl(`/boards/${boardId}`)}).`,
  };
}

export async function createGroupDirect(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  if (!name) return { error: 'create braucht einen name.' };
  const description = typeof args.description === 'string' ? args.description.trim() || null : null;

  const group = await createGroupForUser(userId, { name, description });
  const slug = group.slug_suffix ? buildGroupSlug(group.name, group.slug_suffix) : group.id;
  return {
    ok: true,
    note: `Gruppe „${group.name}" wurde erstellt (${absolutizeUrl(`/gruppen/${slug}`)}).`,
  };
}

export async function joinGroupDirect(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const token = typeof args.joinToken === 'string' ? args.joinToken.trim() : '';
  if (!token) return { error: 'join braucht einen joinToken.' };

  // Joining notifies members with the user's name → two-step confirm. The
  // confirmed call skips the pre-check (joinGroupByToken re-resolves).
  if (args.confirm !== true) {
    const group = await getGroupByToken(token);
    if (!group) return { error: 'Ungültiger oder abgelaufener Einladungslink.' };
    return {
      needsConfirmation: true,
      note: `Der Gruppe „${group.name}" beitreten? Die Mitglieder werden benachrichtigt. Frage die Person und rufe join erst mit confirm=true erneut auf.`,
    };
  }

  const rows = (await getPostgresInstance().query(
    'SELECT display_name FROM profiles WHERE id = $1',
    [userId]
  )) as { display_name: string | null }[];
  const joinerName = rows[0]?.display_name || 'Jemand';

  const outcome = await joinGroupByToken(userId, token, joinerName);
  if (!outcome) return { error: 'Ungültiger oder abgelaufener Einladungslink.' };
  return {
    ok: true,
    note: outcome.alreadyMember
      ? `Du bist bereits Mitglied von „${outcome.group.name}".`
      : `Du bist der Gruppe „${outcome.group.name}" beigetreten.`,
  };
}

/**
 * `groups` set_visibility als zweistufiges confirm-Protokoll — im Chat ist
 * das eine Karte, weil ein öffentlich gelistetes Projekt Fremde erreicht.
 * Projekt über groupId oder groupName (nur eigene Mitgliedschaften).
 */
export async function setGroupVisibilityMcp(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const groupId = typeof args.groupId === 'string' ? args.groupId.trim() : '';
  const groupName = typeof args.groupName === 'string' ? args.groupName.trim() : '';
  let group = groupId ? await getGroupForMember(groupId, userId) : null;
  if (!group && groupName) {
    const match = (await findGroups(userId, groupName, 5)).find((g) => g.role);
    group = match ? await getGroupForMember(match.id, userId) : null;
  }
  if (!group) return { error: 'Projekt nicht gefunden, oder du bist kein Mitglied.' };
  if (!group.isAdmin) return { error: 'Das kann nur ein Admin des Projekts.' };
  if (typeof args.isPublic !== 'boolean') {
    return { error: 'set_visibility braucht isPublic (true/false).' };
  }
  const isPublic = args.isPublic;
  const audience =
    args.audience === 'de-DE' || args.audience === 'de-AT' || args.audience === 'all'
      ? args.audience
      : group.audience;
  if (args.confirm !== true) {
    return {
      needsConfirmation: true,
      note: `Projekt „${group.name}" ${isPublic ? `öffentlich listen (Zielgruppe ${audience})? Andere sehen es dann unter „Projekte entdecken" und können um Aufnahme bitten.` : 'privat stellen? Beitritt dann nur per Einladungslink.'} Frage die Person und rufe set_visibility erst mit confirm=true erneut auf.`,
    };
  }
  const updated = await setGroupVisibility(group.id, userId, { is_public: isPublic, audience });
  if (!updated) return { error: 'Projekt nicht gefunden.' };
  return {
    ok: true,
    note: updated.is_public
      ? `Projekt „${group.name}" ist jetzt öffentlich gelistet.`
      : `Projekt „${group.name}" ist jetzt privat.`,
  };
}

export async function shareDocToGroupMcp(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const id = typeof args.id === 'string' ? args.id : null;
  const groupName = typeof args.groupName === 'string' ? args.groupName.trim() : '';
  const permission = args.permission === 'editor' ? 'editor' : 'viewer';
  if (!id) return { error: 'share_to_group braucht eine Dokument-id (aus list).' };
  if (!groupName) return { error: 'share_to_group braucht groupName.' };

  const doc = await findLiveDocument(id);
  if (!doc || doc.created_by !== userId) {
    return { error: 'Dokument nicht gefunden oder kein Zugriff.' };
  }

  // Only member groups — findGroups also returns public groups with empty role.
  const groups = await findGroups(userId, groupName, 5);
  const group = groups.find((g) => g.role);
  if (!group) return { error: `Keine Gruppe „${groupName}" gefunden, der du angehörst.` };

  if (args.confirm !== true) {
    return {
      needsConfirmation: true,
      note: `„${doc.title}" mit der Gruppe „${group.name}" teilen (${permission === 'editor' ? 'Bearbeiten' : 'Nur lesen'})? Frage die Person und rufe share_to_group erst mit confirm=true erneut auf.`,
    };
  }

  try {
    const result = await shareDocumentToGroup({
      userId,
      docId: id,
      docTitle: doc.title,
      groupId: group.id,
      groupName: group.name,
      permissionLevel: permission,
    });
    return { ok: true, note: result.message };
  } catch (err) {
    return { error: toUserFacingMessage(err, 'Teilen fehlgeschlagen.') };
  }
}

// ---------------------------------------------------------------------------
// notebooks — die Karten-Aktionen des Chats als zweistufiges confirm-Protokoll
// ---------------------------------------------------------------------------

let notebookHelperSingleton: NotebookQdrantHelper | null = null;
function notebookHelper(): NotebookQdrantHelper {
  notebookHelperSingleton ??= new NotebookQdrantHelper();
  return notebookHelperSingleton;
}

interface WolkeFolderArg {
  connectionId: string | undefined;
  path: string;
  includeSubfolders: boolean;
}

/** Das Werkzeugschema hat den Wert schon geprüft — hier nur die Form lesen. */
function readWolkeFolder(raw: unknown): WolkeFolderArg | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.path !== 'string') return null;
  return {
    connectionId: typeof o.connectionId === 'string' ? o.connectionId : undefined,
    path: o.path,
    includeSubfolders: o.includeSubfolders === true,
  };
}

function describeAttach(r: AttachWolkeFolderResult, notebookName: string, url: string): string {
  const parts = [`${r.importedNow} sofort ausgelesen`];
  if (r.alreadyImported > 0) parts.push(`${r.alreadyImported} bereits vorhanden`);
  if (r.queued > 0) parts.push(`${r.queued} warten unter „Neue Dateien"`);
  if (r.failed > 0) parts.push(`${r.failed} fehlgeschlagen (ebenfalls dort)`);
  return `Ordner „${r.folderName}" hängt am Notebook „${notebookName}" — ${r.total} Datei${r.total === 1 ? '' : 'en'}: ${parts.join(', ')} (${absolutizeUrl(url)}).`;
}

async function previewOrError(
  userId: string,
  folder: WolkeFolderArg
): Promise<Awaited<ReturnType<typeof previewWolkeFolder>>> {
  try {
    return await previewWolkeFolder({
      userId,
      connectionId: folder.connectionId,
      folderPath: folder.path,
      includeSubfolders: folder.includeSubfolders,
    });
  } catch (err) {
    return { error: toUserFacingMessage(err, 'Der Wolke-Ordner ließ sich nicht lesen.') };
  }
}

export async function createNotebookMcp(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  if (!name) return { error: 'create braucht einen name.' };
  const description = typeof args.description === 'string' ? args.description.trim() || null : null;
  const profile = await getProfileService().getProfileById(userId);
  const audience = profile?.locale === 'de-AT' ? 'de-AT' : 'de-DE';
  const folder = readWolkeFolder(args.wolkeFolder);

  if (!folder) {
    const created = await createNotebookDirect(notebookHelper(), {
      userId,
      name,
      description,
      audience,
    });
    return {
      ok: true,
      note: `Notebook „${name}" wurde angelegt (leer, privat): ${absolutizeUrl(created.url)}`,
    };
  }

  // Ein Import kostet (OCR seitenweise) → zweistufig, wie die Karte im Chat.
  const preview = await previewOrError(userId, folder);
  if ('error' in preview) return { error: preview.error };
  if (args.confirm !== true) {
    return {
      needsConfirmation: true,
      note: `Notebook „${name}" aus dem Wolke-Ordner „${preview.folderName}" (${preview.fileCount} Dateien, ${preview.alreadyImported} schon importiert) anlegen? Die ersten Dateien werden sofort ausgelesen, der Rest wartet im Notebook unter „Neue Dateien". Frage die Person und rufe create erst mit confirm=true erneut auf.`,
    };
  }
  const created = await createNotebookDirect(notebookHelper(), {
    userId,
    name,
    description,
    audience,
  });
  try {
    const r = await attachWolkeFolderToNotebook({
      userId,
      collectionId: created.id,
      shareLinkId: preview.root.connectionId,
      folderPath: folder.path,
      includeSubfolders: folder.includeSubfolders,
    });
    return { ok: true, note: describeAttach(r, name, created.url) };
  } catch (err) {
    return {
      error: toUserFacingMessage(
        err,
        `Notebook „${name}" wurde angelegt, der Import ist fehlgeschlagen — im Notebook „Synchronisieren" wählen (${absolutizeUrl(created.url)}).`
      ),
    };
  }
}

async function ownedNotebook(
  userId: string,
  id: string | null
): Promise<
  | { collection: NonNullable<Awaited<ReturnType<NotebookQdrantHelper['getNotebookCollection']>>> }
  | { error: string }
> {
  if (!id) return { error: 'Diese Aktion braucht eine Notebook-id (aus list).' };
  const access = await checkNotebookAccess(id, userId);
  if (!access.exists || !access.canRead)
    return { error: 'Notebook nicht gefunden oder kein Zugriff.' };
  if (!access.isOwner) return { error: 'Das kann nur die Eigentümer*in des Notebooks.' };
  const collection = await notebookHelper().getNotebookCollection(id);
  if (!collection) return { error: 'Notebook nicht gefunden oder kein Zugriff.' };
  return { collection };
}

export async function addWolkeFolderMcp(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const owned = await ownedNotebook(userId, typeof args.id === 'string' ? args.id : null);
  if ('error' in owned) return owned;
  const folder = readWolkeFolder(args.wolkeFolder);
  if (!folder) return { error: 'add_wolke_folder braucht wolkeFolder {connectionId?, path}.' };
  const preview = await previewOrError(userId, folder);
  if ('error' in preview) return { error: preview.error };
  const { collection } = owned;
  if (args.confirm !== true) {
    return {
      needsConfirmation: true,
      note: `Ordner „${preview.folderName}" (${preview.fileCount} Dateien, ${preview.alreadyImported} schon importiert) ans Notebook „${collection.name}" hängen? Frage die Person und rufe add_wolke_folder erst mit confirm=true erneut auf.`,
    };
  }
  try {
    const r = await attachWolkeFolderToNotebook({
      userId,
      collectionId: collection.id,
      shareLinkId: preview.root.connectionId,
      folderPath: folder.path,
      includeSubfolders: folder.includeSubfolders,
    });
    return { ok: true, note: describeAttach(r, collection.name, notebookUrl(collection)) };
  } catch (err) {
    return {
      error: toUserFacingMessage(
        err,
        'Der Ordner hängt am Notebook, der Import ist fehlgeschlagen — im Notebook „Synchronisieren" wählen.'
      ),
    };
  }
}

export async function setNotebookVisibilityMcp(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const owned = await ownedNotebook(userId, typeof args.id === 'string' ? args.id : null);
  if ('error' in owned) return owned;
  const patch = {
    ...(typeof args.shareMode === 'string'
      ? { share_mode: args.shareMode as 'private' | 'groups' | 'authenticated' }
      : {}),
    ...(typeof args.editPolicy === 'string'
      ? { edit_policy: args.editPolicy as 'owner_only' | 'group_admins' | 'all_members' }
      : {}),
    ...(typeof args.isPublic === 'boolean' ? { is_public: args.isPublic } : {}),
    ...(typeof args.publicOwnership === 'string'
      ? { public_ownership: args.publicOwnership as 'owner' | 'public_data' }
      : {}),
  };
  if (Object.keys(patch).length === 0) {
    return { error: 'set_visibility braucht shareMode, editPolicy oder isPublic.' };
  }
  const { collection } = owned;
  if (args.confirm !== true) {
    const target =
      patch.share_mode === 'authenticated'
        ? ' „Mit Anmeldung" heißt: alle angemeldeten Personen dieser Instanz.'
        : '';
    return {
      needsConfirmation: true,
      note: `Sichtbarkeit von „${collection.name}" ändern (${JSON.stringify(patch)})?${target} Frage die Person und rufe set_visibility erst mit confirm=true erneut auf.`,
    };
  }
  const applied = await applyNotebookVisibility(collection.id, userId, patch);
  if (!applied.ok) return { error: applied.error };
  return { ok: true, note: `Sichtbarkeit von „${collection.name}" wurde geändert.` };
}

export async function shareNotebookMcp(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const owned = await ownedNotebook(userId, typeof args.id === 'string' ? args.id : null);
  if ('error' in owned) return owned;
  const groupName = typeof args.groupName === 'string' ? args.groupName.trim() : '';
  if (!groupName) return { error: 'share_to_group braucht groupName.' };
  const groups = await findGroups(userId, groupName, 5);
  const group = groups.find((g) => g.role);
  if (!group) return { error: `Kein Projekt „${groupName}" gefunden, dem du angehörst.` };
  const { collection } = owned;
  if (args.confirm !== true) {
    return {
      needsConfirmation: true,
      note: `Notebook „${collection.name}" mit dem Projekt „${group.name}" teilen (nur lesen)? Frage die Person und rufe share_to_group erst mit confirm=true erneut auf.`,
    };
  }
  const rows = (await getPostgresInstance().query(
    'SELECT display_name FROM profiles WHERE id = $1',
    [userId]
  )) as { display_name: string | null }[];
  const outcome = await shareContentToGroup({
    userId,
    contentType: 'notebook_collections',
    contentId: collection.id,
    groupId: group.id,
    permissions: { read: true, write: false },
    sharerName: rows[0]?.display_name || 'Jemand',
  });
  if (!outcome.success) return { error: outcome.message };
  return { ok: true, note: `Notebook „${collection.name}" wurde mit „${group.name}" geteilt.` };
}

/**
 * `recurring_tasks` create als zweistufiges confirm-Protokoll — im Chat ist
 * das eine Karte, weil die Aufgabe danach selbstständig handelt und je Lauf
 * kostet. Dieselbe Validierung wie im Werkzeug: Contract-Schema plus
 * `getAgentForUser`, damit kein erfundener Identifier still als Standard-Agent
 * läuft.
 */
export async function createRecurringTaskMcp(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const profile = await getProfileService().getProfileById(userId);
  const locale = profile?.locale === 'de-AT' ? 'de-AT' : 'de-DE';
  const agentIdentifier =
    typeof args.agentIdentifier === 'string' && args.agentIdentifier.trim()
      ? args.agentIdentifier.trim()
      : null;
  let agentTitle: string | null = null;
  if (agentIdentifier) {
    const agent = await getAgentForUser(agentIdentifier, userId);
    if (!agent) return { error: `Grünerator-Agent „${agentIdentifier}" nicht gefunden.` };
    agentTitle = agent.title;
  }
  const validated = createRecurringTaskBodySchema.safeParse({
    title: args.title,
    instruction: args.instruction,
    recurrence: args.recurrence,
    ...(args.delivery !== undefined ? { delivery: args.delivery } : {}),
    ...(args.emailNotify !== undefined ? { emailNotify: args.emailNotify } : {}),
    agentIdentifier,
    timezone:
      typeof args.timezone === 'string' && args.timezone.trim()
        ? args.timezone.trim()
        : locale === 'de-AT'
          ? 'Europe/Vienna'
          : 'Europe/Berlin',
    locale,
  });
  if (!validated.success) {
    return {
      error: `create braucht title, instruction und recurrence — ${validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    };
  }
  const body = validated.data;
  const takt = describeRecurrence(body.recurrence);
  const zustellung = DELIVERY_LABELS_DE[body.delivery];
  if (args.confirm !== true) {
    return {
      needsConfirmation: true,
      note: `Wiederkehrende Aufgabe „${body.title}" einrichten — ${takt}, ${zustellung}, Agent: ${agentTitle ?? 'Grünerator (Standard)'}? Sie läuft danach von selbst. Frage die Person und rufe create erst mit confirm=true erneut auf.`,
    };
  }
  const task = await createRecurringTask(userId, body);
  return {
    ok: true,
    note: `Wiederkehrende Aufgabe „${task.title}" eingerichtet — läuft ${takt}, ${zustellung}. Nächste Ausführung: ${formatNextRun(task.nextRunAt, locale)} (${absolutizeUrl(RECURRING_TASKS_URL)}).`,
  };
}

/**
 * `user_agents` create als zweistufiges confirm-Protokoll — im Chat ist das
 * eine Karte, weil die Rolle ein LLM-Entwurf ist, den die Person vor dem
 * Speichern sehen soll. Der Entwurf wird bei JEDEM Aufruf neu gemacht, auch
 * beim zweiten mit confirm=true: der Rückfragetext ist keine Reservierung,
 * und zwischen den Aufrufen gibt es keinen Speicher. Wer die gezeigte Rolle
 * exakt will, gibt sie als systemRole mit.
 */
export async function createUserAgentMcp(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const profile = await getProfileService().getProfileById(userId);
  const userLocale = profile?.locale === 'de-AT' ? 'de-AT' : 'de-DE';
  const strings = (key: string): string[] | undefined =>
    Array.isArray(args[key]) ? (args[key] as unknown[]).map(String) : undefined;
  const prepared = await prepareUserAgentInput({
    userId,
    userLocale,
    // MCP kennt die Profilrollen nicht — ungefiltert heißt: alle Rezepte gelten.
    roles: null,
    brief: typeof args.brief === 'string' ? args.brief : '',
    ...(typeof args.title === 'string' ? { title: args.title } : {}),
    ...(typeof args.systemRole === 'string' ? { systemRole: args.systemRole } : {}),
    fields: {
      ...(strings('enabledTools') ? { enabledTools: strings('enabledTools') } : {}),
      ...(strings('skillMentions') ? { skillMentions: strings('skillMentions') } : {}),
      ...(strings('defaultNotebookIds')
        ? { defaultNotebookIds: strings('defaultNotebookIds') }
        : {}),
    },
    deps: resolveUserAgentDeps(undefined),
  });
  if ('error' in prepared) return prepared;
  const { input, preview } = prepared;
  if (args.confirm !== true) {
    return {
      needsConfirmation: true,
      note: `Grünerator-Agent anlegen? ${preview.map((p) => `${p.key}: ${p.value}`).join(' · ')}. Frage die Person und rufe create erst mit confirm=true erneut auf (gern mit systemRole, wenn die Rolle genau so bleiben soll).`,
    };
  }
  const agent = await createUserAgentSafely(userId, input);
  return {
    ok: true,
    note: `Grünerator-Agent „${agent.title}" angelegt (${absolutizeUrl(userAgentUrl(agent.identifier))}).`,
  };
}

export async function shareUserAgentMcp(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const identifier = typeof args.identifier === 'string' ? args.identifier.trim() : '';
  if (!identifier) return { error: 'share_to_group braucht identifier.' };
  const agent = await getUserAgent(userId, identifier);
  const sharing = agent ? await getAgentSharing(userId, identifier) : undefined;
  if (!agent || !sharing) {
    return { error: 'Grünerator-Agent nicht gefunden, oder er gehört dir nicht.' };
  }
  const groupName = typeof args.groupName === 'string' ? args.groupName.trim() : '';
  if (!groupName) return { error: 'share_to_group braucht groupName.' };
  const groups = await findGroups(userId, groupName, 5);
  const group = groups.find((g) => g.role);
  if (!group) return { error: `Kein Projekt „${groupName}" gefunden, dem du angehörst.` };
  if (args.confirm !== true) {
    return {
      needsConfirmation: true,
      note: `Grünerator-Agent „${agent.title}" mit dem Projekt „${group.name}" teilen (benutzen, nicht bearbeiten)? Frage die Person und rufe share_to_group erst mit confirm=true erneut auf.`,
    };
  }
  const rows = (await getPostgresInstance().query(
    'SELECT display_name FROM profiles WHERE id = $1',
    [userId]
  )) as { display_name: string | null }[];
  const outcome = await shareContentToGroup({
    userId,
    contentType: 'user_agents',
    contentId: sharing.id,
    groupId: group.id,
    permissions: { read: true, write: false },
    sharerName: rows[0]?.display_name || 'Jemand',
  });
  if (!outcome.success) return { error: outcome.message };
  return {
    ok: true,
    note: `Grünerator-Agent „${agent.title}" wurde mit „${group.name}" geteilt.`,
  };
}
