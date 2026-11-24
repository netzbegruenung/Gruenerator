import { resolveSkillIcon } from '@gruenerator/chat';
import { type UserRole } from '@gruenerator/chat/stores';
import {
  SKILLS,
  getAgentSlug,
  getLandesverbandHubsByIds,
  getSystemAgent,
  isSkillOfferedIn,
  landesverbandIdsForRoles,
  type LvHub,
} from '@gruenerator/shared/agents';
import { type InstanceId } from '@gruenerator/shared/instances';
import { landesverbandHubHref, marketplaceHref } from '@gruenerator/shared/marketplace';
import { NOTEBOOK_ICONS } from '@gruenerator/shared/notebook-icons';
import { isNotebookOfferedIn, type NotebookId } from '@gruenerator/shared/notebooks';
import { grueneJugendRoleLocale } from '@gruenerator/shared/roles';
import { type IconType } from 'react-icons';

import { getAgentIcon } from './sidebarAgentConfig';

import {
  GiHedgehog,
  PiBank,
  PiBooks,
  PiBuildings,
  PiImage,
  PiInstagramLogo,
  PiStorefront,
} from '@/config/shellIcons.generated';
import { landesverbandHubGroups } from '@/features/chat/landesverbandHubCards';
import { getNotebookById } from '@/features/notebook/config/notebooksConfig';

export interface RoleShortcutLink {
  key: string;
  label: string;
  Icon: IconType;
  path: string;
  /** Seitentitel für `onNavigate`. */
  title: string;
}

/**
 * Ein Seitenleisten-Eintrag für eine Rolle: ein Chat mit der Rolle, eine Liste
 * „Neuer Chat mit …" und Links darunter. Landesverband und Grüne Jugend sind
 * nur zwei Ableitungen derselben Form — die Komponente kennt keine von beiden.
 */
export interface RoleShortcut {
  key: string;
  name: string;
  Icon: IconType;
  /** Die Rolle, mit der „Neuer Chat mit deiner Rolle" startet; `null` = kein Eintrag. */
  role: UserRole | null;
  starters: { heading: string; links: RoleShortcutLink[] };
  links: RoleShortcutLink[];
}

/**
 * Je Landesverband-Hub: seine Rezepte, sein Notebook und die Marktplatz-Seite.
 * Ein Rezept-Eintrag öffnet den Chat mit `@<rezept>` — wie bei der
 * Bundesgeschäftsstelle; die LV-Agenten stehen seit 11/2026 nicht mehr hier.
 */
export function landesverbandShortcut(
  hub: LvHub,
  roles: readonly UserRole[],
  userLocale: string,
  instance: InstanceId
): RoleShortcut {
  const notebookPath = getNotebookById(hub.notebookId)?.path;
  const recipes = landesverbandHubGroups(hub, instance).flatMap((group) => group.recipes);
  return {
    key: hub.slug,
    name: hub.name,
    Icon: NOTEBOOK_ICONS[hub.notebookId],
    role: roles.find((r) => landesverbandIdsForRoles([r], userLocale).includes(hub.lvId)) ?? null,
    starters: {
      heading: 'Neuer Chat mit Rezept',
      links: recipes.map((recipe) => ({
        key: recipe.mention,
        label: recipe.title,
        // Siehe `bundesgeschaeftsstelleShortcut`: `SkillIcon` ist schmaler getippt.
        Icon: resolveSkillIcon(recipe.iconKey) as IconType,
        path: recipe.path,
        title: recipe.title,
      })),
    },
    links: [
      ...(notebookPath
        ? [
            {
              key: 'notebook',
              label: 'Notebook',
              Icon: PiBooks,
              path: notebookPath,
              title: hub.name,
            },
          ]
        : []),
      // Die Marktplatz-Seite führt das Land wie der Marktplatz selbst (siehe
      // `LandesverbandHub`) — nur, wo sie für diese Person auch aufgeht.
      ...(hub.audience === userLocale
        ? [
            {
              key: 'rezepte',
              label: 'Alle Rezepte',
              Icon: PiStorefront,
              path: landesverbandHubHref(hub.slug),
              title: 'Marktplatz',
            },
          ]
        : []),
    ],
  };
}

const GJ_BRAND = {
  'de-DE': { name: 'GRÜNE JUGEND', mention: 'gj-insta', collection: 'gruene-jugend' },
  'de-AT': {
    name: 'Grüne Jugend',
    mention: 'gj-insta-at',
    collection: 'gruene-jugend-oesterreich',
  },
} as const;

/**
 * Für eine Rolle in der Grünen Jugend: ihr Insta-Rezept und ihre Sharepic-
 * Vorlagen. Mit aktiver GJ-Rolle schreibt der Chat ohnehin im GJ-Stil und baut
 * Sharepics im GJ-Design (`lvRecipePreference`, `vorlagenTools`) — der Eintrag
 * macht das nur auffindbar.
 *
 * Bei mehreren GJ-Rollen zählt die aus dem eigenen Land: die Kollektion des
 * anderen Landes blendet der Marktplatz aus.
 */
export function grueneJugendShortcut(
  roles: readonly UserRole[],
  userLocale: string
): RoleShortcut | null {
  const gjRoles = roles.filter((r) => grueneJugendRoleLocale(r) !== null);
  const role = gjRoles.find((r) => grueneJugendRoleLocale(r) === userLocale) ?? gjRoles[0];
  if (!role) return null;

  const brand = GJ_BRAND[grueneJugendRoleLocale(role) ?? 'de-DE'];
  const recipe = SKILLS.find((skill) => skill.mention === brand.mention);
  return {
    key: 'gruene-jugend',
    name: brand.name,
    Icon: GiHedgehog,
    role,
    starters: {
      heading: 'Neuer Chat mit Rezept',
      links: recipe
        ? [
            {
              key: recipe.mention,
              label: recipe.title,
              Icon: PiInstagramLogo,
              path: `/chat?rezept=${recipe.mention}`,
              title: recipe.title,
            },
          ]
        : [],
    },
    links: [
      {
        key: 'sharepics',
        label: 'Sharepic-Vorlagen',
        Icon: PiImage,
        path: marketplaceHref({ collection: brand.collection }),
        title: 'Marktplatz',
      },
    ],
  };
}

/** Notebook-Links, soweit die Instanz das Notebook anbietet (bgst blendet z. B. `parlamente` aus). */
function notebookLinks(ids: readonly NotebookId[], instance: InstanceId): RoleShortcutLink[] {
  return ids.flatMap((id) => {
    const notebook = getNotebookById(id);
    if (!notebook?.path || !isNotebookOfferedIn(id, instance)) return [];
    return [
      {
        key: id,
        label: notebook.title,
        Icon: NOTEBOOK_ICONS[id],
        path: notebook.path,
        title: notebook.title,
      },
    ];
  });
}

const BGST_ROLLE = 'Mitarbeiter*in Bundesgeschäftsstelle';
/** Die Rezepte, die nur die Bundesgeschäftsstelle bekommt (`instances: ['bgst', 'local']`). */
const BGST_RECIPES = [
  'beschlusslage',
  'rechtsstand',
  'sprechzettel',
  'leitantrag',
  'presse-beschluss',
] as const;

/**
 * Für die Bundesgeschäftsstelle: ihre fünf Rezepte und die Notebooks
 * Bundesverband und Wahlprüfsteine. Ohne angebotenes Rezept (jede Instanz außer
 * bgst und local) gibt es keinen Eintrag — die Rolle allein trägt ihn nicht.
 */
export function bundesgeschaeftsstelleShortcut(
  roles: readonly UserRole[],
  instance: InstanceId
): RoleShortcut | null {
  const role = roles.find((r) => r.ebene === 'bund' && r.rolle === BGST_ROLLE);
  if (!role) return null;

  // Aus `SKILLS`, nicht aus `agentsList`: die Rezepte gehören dem Universal-
  // Agenten, und der ist `hiddenFromInventory`.
  const recipes = BGST_RECIPES.flatMap((mention) => {
    const recipe = SKILLS.find((skill) => skill.mention === mention);
    return recipe && isSkillOfferedIn(recipe, instance) ? [recipe] : [];
  });
  if (recipes.length === 0) return null;

  return {
    key: 'bundesgeschaeftsstelle',
    name: 'Bundesgeschäftsstelle',
    Icon: PiBuildings,
    role,
    starters: {
      heading: 'Neuer Chat mit Rezept',
      links: recipes.map((recipe) => ({
        key: recipe.mention,
        label: recipe.title,
        // `SkillIcon` ist schmaler getippt, als die Werte sind: `SKILL_ICONS`
        // hält die Phosphor-Komponenten aus `@gruenerator/shared/icons`, die
        // `IconBaseProps` nehmen.
        Icon: resolveSkillIcon(recipe.iconKey) as IconType,
        path: `/chat?rezept=${recipe.mention}`,
        title: recipe.title,
      })),
    },
    links: notebookLinks(['gruene-notebook', 'wahlpruefsteine-notebook'], instance),
  };
}

const MDB_BUERO_ROLLE = 'Mitarbeiter*in MdB-Büro';
const MDB_BUERO_AGENTS = [
  'gruenerator-bundestag',
  'gruenerator-abgeordnetenwatch',
  'gruenerator-rede-schreiber',
  'gruenerator-buergerservice',
] as const;

/**
 * Für ein MdB-Büro: Bundestag-Recherche, Abgeordnetenwatch, Rede und
 * Bürger*innenanfragen, dazu die Notebooks Bundestagsfraktion und DIP. Benannt
 * nach der*dem Abgeordneten, sobald die Rolle sie*ihn kennt.
 */
export function mdbBueroShortcut(
  roles: readonly UserRole[],
  instance: InstanceId
): RoleShortcut | null {
  const role = roles.find((r) => r.ebene === 'bund' && r.rolle === MDB_BUERO_ROLLE);
  if (!role) return null;

  const abgeordnete = role.abgeordnete?.trim();
  return {
    key: 'mdb-buero',
    name: abgeordnete ? `Büro ${abgeordnete}` : 'MdB-Büro',
    Icon: PiBank,
    role,
    starters: {
      heading: 'Neuer Chat mit Agent',
      links: MDB_BUERO_AGENTS.flatMap((agentId) => {
        const agent = getSystemAgent(agentId);
        if (!agent) return [];
        return [
          {
            key: agentId,
            label: agent.title,
            Icon: getAgentIcon(agentId),
            path: `/agents/${getAgentSlug(agentId)}`,
            title: agent.title,
          },
        ];
      }),
    },
    links: notebookLinks(['bundestagsfraktion-notebook', 'bundestag-dip-notebook'], instance),
  };
}

/**
 * Alle Seitenleisten-Einträge der Person: je Landesverband einer, dazu je einer
 * für Bundesgeschäftsstelle, MdB-Büro und Grüne Jugend. Rollen mit
 * `showInSidebar: false` zählen nicht mit.
 */
export function buildRoleShortcuts(
  roles: readonly UserRole[],
  userLocale: string,
  instance: InstanceId
): RoleShortcut[] {
  const visible = roles.filter((r) => r.showInSidebar !== false);
  const lvIds = landesverbandIdsForRoles(visible, userLocale);
  const shortcuts = getLandesverbandHubsByIds(lvIds, instance).map((hub) =>
    landesverbandShortcut(hub, visible, userLocale, instance)
  );
  const extra = [
    bundesgeschaeftsstelleShortcut(visible, instance),
    mdbBueroShortcut(visible, instance),
    grueneJugendShortcut(visible, userLocale),
  ].filter((shortcut): shortcut is RoleShortcut => shortcut !== null);
  return [...shortcuts, ...extra];
}

/** Bekommt diese Rolle einen Eintrag in der Seitenleiste? Dann bietet die Rollenkarte den Schalter an. */
export function roleHasSidebarShortcut(
  role: UserRole,
  userLocale: string,
  instance: InstanceId
): boolean {
  return buildRoleShortcuts([{ ...role, showInSidebar: true }], userLocale, instance).length > 0;
}
