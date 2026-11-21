/**
 * Agents laufen aus: eine Besitzer*in wandelt einen eigenen Agent in ein
 * Rezept oder ein persönliches Projekt um.
 *
 * Umwandeln KOPIERT. Der Agent bleibt unverändert und funktioniert weiter
 * (alte Threads, Favoriten, wiederkehrende Aufgaben); er merkt sich nur seinen
 * Nachfolger in `user_agents.migrated_to_*`. Wer unzufrieden ist, wandelt noch
 * einmal um (`fresh`).
 *
 * Zwei Teile:
 *  - {@link planAgentConversion} ist rein: was mitkommt, was wegfällt, was
 *    später folgt, und ob das Ziel überhaupt geht. Der Dialog zeigt genau
 *    diese Liste, bevor etwas angelegt wird.
 *  - {@link convertUserAgent} führt den Plan über die bestehenden Türen aus
 *    (`upsertTextForm`, `createGroupForUser`, `setProjectInstructions`,
 *    `shareContentToGroup`) — keine zweite Schreiblogik.
 *
 * Bewusst nicht übernommen (entschieden 21.11.2026): Werkzeug-Auswahl und
 * Modell. Nie gekürzt: der Rollentext. Passt er nicht ins Ziel, ist das Ziel
 * gesperrt und der Grund steht in `blocked`.
 */
import {
  GROUP_INSTRUCTIONS_MAX,
  MAX_TEXT_FORM_DESCRIPTION_CHARS,
  MAX_TEXT_FORM_STYLE_CHARS,
  MAX_TEXT_FORM_TITLE_CHARS,
  RESERVED_TEXT_FORM_MENTIONS,
  type AgentConversionItem,
  type AgentConversionResponse,
  type AgentConversionTarget,
  type GroupContentType,
} from '@gruenerator/contracts';
import { getNotebookDefinition } from '@gruenerator/shared/notebooks';
import { buildGroupSlug } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { collectTakenMentions } from '../../routes/userTextForms/textFormRouterHelpers.js';
import { createLogger } from '../../utils/logger.js';
import { shareContentToGroup, type ShareContentOutcome } from '../groups/groupContent.js';
import { setProjectInstructions } from '../groups/groupInstructions.js';
import { createGroupForUser } from '../groups/groupMutations.js';
import { trashGroup } from '../groups/groupTrash.js';
import { resolveMentionCollision } from '../user/textFormDraftService.js';
import { deriveRecipeMention } from '../user/textFormKind.js';
import { listTextForms, upsertTextForm } from '../user/textFormRepository.js';

import {
  getAgentSharing,
  getUserAgent,
  setUserAgentSuccessor,
  type UserAgentRecord,
} from './userAgentsRepository.js';

const log = createLogger('agentConversion');

/** Was der Plan über den Agent hinaus wissen muss — vom Aufrufer gelesen. */
export interface AgentConversionFacts {
  isPublic: boolean;
  /** Projekte, in die der Agent geteilt ist. */
  groupShareCount: number;
  /** Lebende wiederkehrende Aufgaben, die diesen Agent nennen. */
  recurringTaskCount: number;
}

export interface AgentConversionPlan {
  items: AgentConversionItem[];
  blocked: string | null;
}

/** Projekt-Anweisungen: die Rolle, dazu der Hinweis auf das Standard-Rezept. */
export function projectInstructionsFor(agent: UserAgentRecord): string {
  const role = agent.systemRole.trim();
  const recipe = agent.defaultRecipeMention;
  return recipe ? `${role}\n\nFür Texte nutzt du das Rezept @${recipe}.` : role;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** „in dasselbe Projekt" / „in dieselben 3 Projekte". */
function sameProjects(n: number): string {
  return n === 1 ? 'in dasselbe Projekt' : `in dieselben ${n} Projekte`;
}

export function planAgentConversion(
  agent: UserAgentRecord,
  target: AgentConversionTarget,
  facts: AgentConversionFacts
): AgentConversionPlan {
  const items: AgentConversionItem[] = [];
  let blocked: string | null = null;
  const role = agent.systemRole.trim();

  if (target === 'recipe') {
    if (role.length > MAX_TEXT_FORM_STYLE_CHARS) {
      blocked = `Die Rolle hat ${role.length.toLocaleString('de-DE')} Zeichen, ein Rezept fasst höchstens ${MAX_TEXT_FORM_STYLE_CHARS.toLocaleString('de-DE')}. Kürze die Rolle im Agent-Editor und wandle dann um.`;
    }
    const titleCut = agent.title.trim().length > MAX_TEXT_FORM_TITLE_CHARS;
    items.push({
      part: 'role',
      outcome: 'carried',
      note: titleCut
        ? `Die Rolle wird zur Anleitung des Rezepts. Der Titel wird auf ${MAX_TEXT_FORM_TITLE_CHARS} Zeichen gekürzt.`
        : 'Die Rolle wird zur Anleitung des Rezepts.',
    });
  } else {
    const instructions = projectInstructionsFor(agent);
    if (instructions.length > GROUP_INSTRUCTIONS_MAX) {
      blocked = `Die Rolle hat ${instructions.length.toLocaleString('de-DE')} Zeichen, Projekt-Anweisungen fassen höchstens ${GROUP_INSTRUCTIONS_MAX.toLocaleString('de-DE')}. Wandle den Agent in ein Rezept um oder kürze die Rolle.`;
    }
    items.push({
      part: 'role',
      outcome: 'carried',
      note: 'Die Rolle wird zu den Anweisungen des Projekts.',
    });
  }

  const examples = agent.fewShotExamples?.length ?? 0;
  if (examples > 0) {
    items.push(
      target === 'recipe'
        ? {
            part: 'examples',
            outcome: 'carried',
            note: `${count(examples, 'Beispiel kommt', 'Beispiele kommen')} als Beispieltext mit.`,
          }
        : {
            part: 'examples',
            outcome: 'dropped',
            note: 'Beispiele haben im Projekt keinen Platz.',
          }
    );
  }

  const notebooks = agent.defaultNotebookIds?.length ?? 0;
  if (notebooks > 0) {
    items.push(
      target === 'recipe'
        ? {
            part: 'notebooks',
            outcome: 'later',
            note: `${count(notebooks, 'Notebook', 'Notebooks')} kann ein Rezept noch nicht mitnehmen. Wenn du die Notebooks behalten willst, wandle in ein Projekt um.`,
          }
        : {
            part: 'notebooks',
            outcome: 'carried',
            note: `${count(notebooks, 'Notebook wird', 'Notebooks werden')} ins Projekt geteilt; Chats im Projekt durchsuchen sie von selbst.`,
          }
    );
  }

  if (agent.defaultRecipeMention || agent.defaultRecipeId) {
    items.push(
      target === 'recipe'
        ? {
            part: 'defaultRecipe',
            outcome: 'dropped',
            note: 'Das Standard-Rezept bleibt ein eigenes Rezept; das neue ersetzt es nicht.',
          }
        : agent.defaultRecipeMention
          ? {
              part: 'defaultRecipe',
              outcome: 'carried',
              note: `Die Anweisungen nennen das Rezept @${agent.defaultRecipeMention}.`,
            }
          : {
              part: 'defaultRecipe',
              outcome: 'dropped',
              note: 'Das Standard-Rezept wird nicht übernommen.',
            }
    );
  }

  if (agent.openingMessage.trim() || agent.openingQuestions.length > 0) {
    items.push({
      part: 'opening',
      outcome: 'later',
      note:
        target === 'recipe'
          ? 'Begrüßung und Startfragen kann ein Rezept noch nicht zeigen.'
          : 'Begrüßung und Startfragen kann ein Projekt noch nicht zeigen.',
    });
  }

  if (facts.groupShareCount > 0) {
    items.push(
      target === 'recipe'
        ? {
            part: 'groupShares',
            outcome: 'carried',
            note: `Das Rezept wird ${sameProjects(facts.groupShareCount)} geteilt.`,
          }
        : {
            part: 'groupShares',
            outcome: 'dropped',
            note: 'Das neue Projekt ist persönlich. Wer den Agent über ein Projekt nutzt, bekommt ihn nicht mit.',
          }
    );
  }

  if (facts.isPublic) {
    items.push({
      part: 'public',
      outcome: 'dropped',
      note:
        target === 'recipe'
          ? 'Das Rezept ist erst privat. Veröffentlichen musst du es selbst, mit der Erklärung zu den Rechten.'
          : 'Ein Projekt lässt sich nicht im Marktplatz veröffentlichen.',
    });
  }

  if (agent.enabledTools?.length) {
    items.push({
      part: 'tools',
      outcome: 'dropped',
      note: 'Die Werkzeug-Auswahl entfällt; der Grünerator wählt Werkzeuge selbst.',
    });
  }

  if (agent.defaultModel) {
    items.push({
      part: 'model',
      outcome: 'dropped',
      note: 'Die Modellwahl entfällt; du wählst das Modell im Chat.',
    });
  }

  if (facts.recurringTaskCount > 0) {
    items.push({
      part: 'recurringTasks',
      outcome: 'later',
      note: `${count(facts.recurringTaskCount, 'wiederkehrende Aufgabe läuft', 'wiederkehrende Aufgaben laufen')} weiter mit dem Agent.`,
    });
  }

  return { items, blocked };
}

// ── Ausführen ─────────────────────────────────────────────────────────────────

export interface AgentConversionDeps {
  getAgent: (userId: string, handle: string) => Promise<UserAgentRecord | undefined>;
  readFacts: (userId: string, agent: UserAgentRecord) => Promise<AgentConversionFacts>;
  listAgentGroupIds: (agentId: string) => Promise<string[]>;
  /** Pfad des lebenden Nachfolgers, sonst `null`. */
  successorPath: (
    userId: string,
    successor: { kind: AgentConversionTarget; ref: string }
  ) => Promise<string | null>;
  takenMentions: (userId: string) => Promise<Set<string>>;
  createRecipe: (
    userId: string,
    input: {
      mention: string;
      title: string;
      description: string;
      iconKey: string | null;
      styleBlock: string;
      examples: Array<{ content: string }>;
    }
  ) => Promise<{ id: string; mention: string }>;
  createProject: (
    userId: string,
    input: { name: string; description: string }
  ) => Promise<{ id: string; name: string; slugSuffix: string | null }>;
  trashProject: (userId: string, groupId: string) => Promise<unknown>;
  setInstructions: (groupId: string, userId: string, text: string) => Promise<unknown>;
  share: (input: {
    userId: string;
    groupId: string;
    contentType: GroupContentType;
    contentId: string;
    sharerName: string;
  }) => Promise<ShareContentOutcome>;
  setSuccessor: (
    userId: string,
    agentId: string,
    successor: { kind: AgentConversionTarget; ref: string }
  ) => Promise<boolean>;
}

export type ConvertUserAgentOutcome =
  { ok: true; response: AgentConversionResponse } | { ok: false; status: 404; message: string };

function recipePath(mention: string): string {
  return `/agentura/rezept/${encodeURIComponent(mention)}`;
}

function projectPath(project: { id: string; name: string; slugSuffix: string | null }): string {
  return `/projekte/${project.slugSuffix ? buildGroupSlug(project.name, project.slugSuffix) : project.id}`;
}

/** Ersetzt die Notiz eines Plan-Postens durch das, was tatsächlich geschah. */
function withNote(
  items: AgentConversionItem[],
  part: AgentConversionItem['part'],
  note: string,
  outcome?: AgentConversionItem['outcome']
): AgentConversionItem[] {
  return items.map((i) => (i.part === part ? { ...i, note, ...(outcome ? { outcome } : {}) } : i));
}

function notebookContentType(id: string): GroupContentType {
  return getNotebookDefinition(id) ? 'system_notebooks' : 'notebook_collections';
}

export async function convertUserAgent(
  params: {
    userId: string;
    sharerName: string;
    handle: string;
    target: AgentConversionTarget;
    dryRun: boolean;
    fresh: boolean;
  },
  deps: AgentConversionDeps = defaultDeps()
): Promise<ConvertUserAgentOutcome> {
  const { userId, target } = params;
  const agent = await deps.getAgent(userId, params.handle);
  if (!agent) return { ok: false, status: 404, message: 'Agent nicht gefunden.' };

  const facts = await deps.readFacts(userId, agent);
  const plan = planAgentConversion(agent, target, facts);

  const existingRef = agent.migratedTo?.[target] ?? null;
  const existingPath = existingRef
    ? await deps.successorPath(userId, { kind: target, ref: existingRef })
    : null;
  const existingResult =
    existingRef && existingPath ? { kind: target, ref: existingRef, path: existingPath } : null;

  const base = { success: true as const, target, items: plan.items, blocked: plan.blocked };

  if (params.dryRun || plan.blocked) {
    return {
      ok: true,
      response: { ...base, alreadyConverted: existingResult !== null, result: existingResult },
    };
  }
  if (existingResult && !params.fresh) {
    return { ok: true, response: { ...base, alreadyConverted: true, result: existingResult } };
  }

  const result =
    target === 'recipe'
      ? await convertToRecipe(params, agent, plan.items, deps)
      : await convertToProject(params, agent, plan.items, deps);

  await deps.setSuccessor(userId, agent.id, { kind: target, ref: result.ref });

  return {
    ok: true,
    response: {
      ...base,
      items: result.items,
      alreadyConverted: false,
      result: { kind: target, ref: result.ref, path: result.path },
    },
  };
}

interface StepResult {
  ref: string;
  path: string;
  items: AgentConversionItem[];
}

async function convertToRecipe(
  params: { userId: string; sharerName: string },
  agent: UserAgentRecord,
  planned: AgentConversionItem[],
  deps: AgentConversionDeps
): Promise<StepResult> {
  const { userId } = params;
  const taken = await deps.takenMentions(userId);
  // Der Bezeichner ist der kurze Name, unter dem die Person den Agent kennt
  // (`@pressearbeit-kv`); der Titel kann länger als eine Mention sein und
  // würde mitten im Wort abgeschnitten.
  const base = deriveRecipeMention(agent.identifier) || deriveRecipeMention(agent.title);
  const mention = resolveMentionCollision(base || 'rezept', taken);

  const recipe = await deps.createRecipe(userId, {
    mention,
    title: agent.title.trim().slice(0, MAX_TEXT_FORM_TITLE_CHARS),
    description: agent.description.trim().slice(0, MAX_TEXT_FORM_DESCRIPTION_CHARS),
    iconKey: agent.iconKey ?? null,
    styleBlock: agent.systemRole.trim(),
    examples: (agent.fewShotExamples ?? [])
      .map((e) => ({ content: e.output.trim() }))
      .filter((e) => e.content.length > 0),
  });

  let items = planned;
  const groupIds = await deps.listAgentGroupIds(agent.id);
  if (groupIds.length > 0) {
    let shared = 0;
    for (const groupId of groupIds) {
      try {
        const outcome = await deps.share({
          userId,
          groupId,
          contentType: 'user_text_forms',
          contentId: recipe.id,
          sharerName: params.sharerName,
        });
        if (outcome.success) shared++;
        else log.warn(`[convert] recipe share into ${groupId} refused: ${outcome.message}`);
      } catch (error) {
        // Teilen ist ein Zusatz: ein Projekt, in dem die Person nicht mehr
        // teilen darf, hält das Rezept nicht auf. Gezählt wird unten.
        log.warn(`[convert] recipe share into ${groupId} failed:`, error);
      }
    }
    const missing = groupIds.length - shared;
    items = withNote(
      items,
      'groupShares',
      missing === 0
        ? `Das Rezept ist ${sameProjects(shared)} geteilt.`
        : `Das Rezept ist in ${count(shared, 'Projekt', 'Projekte')} geteilt; in ${count(missing, 'Projekt', 'Projekte')} darfst du nicht mehr teilen.`,
      missing === 0 ? 'carried' : 'later'
    );
  }

  return { ref: recipe.id, path: recipePath(recipe.mention), items };
}

async function convertToProject(
  params: { userId: string; sharerName: string },
  agent: UserAgentRecord,
  planned: AgentConversionItem[],
  deps: AgentConversionDeps
): Promise<StepResult> {
  const { userId } = params;
  const project = await deps.createProject(userId, {
    name: agent.title.trim(),
    description: agent.description.trim(),
  });

  try {
    await deps.setInstructions(project.id, userId, projectInstructionsFor(agent));
  } catch (error) {
    // Ohne Anweisungen ist das Projekt eine leere Hülle: wieder abräumen
    // (Papierkorb, nicht hart), damit kein halbes Projekt liegen bleibt.
    await deps.trashProject(userId, project.id).catch(() => undefined);
    throw error;
  }

  let items = planned;
  const notebookIds = agent.defaultNotebookIds ?? [];
  if (notebookIds.length > 0) {
    let shared = 0;
    for (const id of notebookIds) {
      try {
        const outcome = await deps.share({
          userId,
          groupId: project.id,
          contentType: notebookContentType(id),
          contentId: id,
          sharerName: params.sharerName,
        });
        if (outcome.success) shared++;
        else log.warn(`[convert] notebook ${id} share refused: ${outcome.message}`);
      } catch (error) {
        // Ein Notebook, das der Person nicht (mehr) gehört, bleibt draussen;
        // gezählt wird unten.
        log.warn(`[convert] notebook ${id} share failed:`, error);
      }
    }
    const missing = notebookIds.length - shared;
    items = withNote(
      items,
      'notebooks',
      `${count(shared, 'Notebook ist', 'Notebooks sind')} ins Projekt geteilt; Chats im Projekt durchsuchen sie von selbst.${
        missing > 0
          ? ` ${count(missing, 'Notebook ließ', 'Notebooks ließen')} sich nicht teilen (gehört dir nicht oder gibt es nicht mehr).`
          : ''
      }`,
      missing === 0 ? 'carried' : 'later'
    );
  }

  return { ref: project.id, path: projectPath(project), items };
}

// ── Standard-Abhängigkeiten ───────────────────────────────────────────────────

function defaultDeps(): AgentConversionDeps {
  return {
    getAgent: getUserAgent,
    readFacts: async (userId, agent) => {
      const postgres = getPostgresInstance();
      const sharing = await getAgentSharing(userId, agent.id);
      const shares = (await postgres.query(
        `SELECT COUNT(*)::int AS n FROM group_content_shares gcs
           INNER JOIN groups g ON g.id = gcs.group_id AND g.deleted_at IS NULL
          WHERE gcs.content_type = 'user_agents' AND gcs.content_id = $1`,
        [agent.id]
      )) as Array<{ n: number }>;
      const tasks = (await postgres.query(
        `SELECT COUNT(*)::int AS n FROM recurring_tasks
          WHERE user_id = $1 AND deleted_at IS NULL
            AND agent_identifier IN ($2, $3)`,
        [userId, agent.identifier, agent.id]
      )) as Array<{ n: number }>;
      return {
        isPublic: sharing?.is_public === true,
        groupShareCount: shares[0]?.n ?? 0,
        recurringTaskCount: tasks[0]?.n ?? 0,
      };
    },
    listAgentGroupIds: async (agentId) => {
      const rows = (await getPostgresInstance().query(
        `SELECT gcs.group_id FROM group_content_shares gcs
           INNER JOIN groups g ON g.id = gcs.group_id AND g.deleted_at IS NULL
          WHERE gcs.content_type = 'user_agents' AND gcs.content_id = $1`,
        [agentId]
      )) as Array<{ group_id: string }>;
      return rows.map((r) => r.group_id);
    },
    successorPath: async (userId, successor) => {
      const postgres = getPostgresInstance();
      if (successor.kind === 'recipe') {
        const row = (await postgres.queryOne(
          `SELECT mention FROM user_text_forms
            WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
          [successor.ref, userId],
          { table: 'user_text_forms' }
        )) as { mention: string } | null;
        return row ? recipePath(row.mention) : null;
      }
      const row = (await postgres.queryOne(
        `SELECT g.id, g.name, g.slug_suffix FROM groups g
           INNER JOIN group_memberships m ON m.group_id = g.id AND m.user_id = $2
          WHERE g.id = $1 AND g.deleted_at IS NULL`,
        [successor.ref, userId],
        { table: 'groups' }
      )) as { id: string; name: string; slug_suffix: string | null } | null;
      return row ? projectPath({ id: row.id, name: row.name, slugSuffix: row.slug_suffix }) : null;
    },
    // Dieselbe Liste wie der Rezept-Entwurf (Systemrezepte, Presets, eigene),
    // dazu die Pfadsegmente, die eine Detailseite unerreichbar machten.
    takenMentions: async (userId) =>
      new Set<string>([
        ...collectTakenMentions(await listTextForms(userId)),
        ...RESERVED_TEXT_FORM_MENTIONS,
      ]),
    createRecipe: async (userId, input) => {
      const form = await upsertTextForm(userId, {
        kind: 'custom',
        textType: null,
        mention: input.mention,
        title: input.title,
        examples: input.examples,
        styleBlock: input.styleBlock,
        description: input.description || null,
        iconKey: input.iconKey,
      });
      return { id: form.id, mention: form.mention };
    },
    createProject: async (userId, input) => {
      const group = await createGroupForUser(userId, {
        name: input.name,
        description: input.description || null,
        groupType: 'personal',
      });
      return { id: group.id, name: group.name, slugSuffix: group.slug_suffix ?? null };
    },
    trashProject: (userId, groupId) => trashGroup(userId, groupId),
    setInstructions: setProjectInstructions,
    share: (input) =>
      shareContentToGroup({
        ...input,
        permissions: { read: true, write: false, collaborative: false },
      }),
    setSuccessor: setUserAgentSuccessor,
  };
}
