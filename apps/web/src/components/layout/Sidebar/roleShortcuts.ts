import { type UserRole } from '@gruenerator/chat/stores';
import {
  SKILLS,
  getAgentSlug,
  getLandesverbandHubsByIds,
  landesverbandIdsForRoles,
  type LvHub,
} from '@gruenerator/shared/agents';
import { type InstanceId } from '@gruenerator/shared/instances';
import { marketplaceHref } from '@gruenerator/shared/marketplace';
import { NOTEBOOK_ICONS } from '@gruenerator/shared/notebook-icons';
import { grueneJugendRoleLocale } from '@gruenerator/shared/roles';
import { type IconType } from 'react-icons';
import { GiHedgehog } from 'react-icons/gi';
import { PiBooks, PiImage, PiInstagramLogo } from 'react-icons/pi';

import { getAgentIcon } from './sidebarAgentConfig';

import { landesverbandHubCards } from '@/features/chat/landesverbandHubCards';
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

/** Je Landesverband-Hub: seine Agents und sein Notebook. */
export function landesverbandShortcut(
  hub: LvHub,
  roles: readonly UserRole[],
  userLocale: string
): RoleShortcut {
  const notebookPath = getNotebookById(hub.notebookId)?.path;
  return {
    key: hub.slug,
    name: hub.name,
    Icon: NOTEBOOK_ICONS[hub.notebookId],
    role: roles.find((r) => landesverbandIdsForRoles([r], userLocale).includes(hub.lvId)) ?? null,
    starters: {
      heading: 'Neuer Chat mit Agent',
      links: landesverbandHubCards(hub, userLocale).map(({ agentId, role }) => ({
        key: agentId,
        label: role,
        Icon: getAgentIcon(agentId),
        path: `/agents/${getAgentSlug(agentId)}`,
        title: role,
      })),
    },
    links: notebookPath
      ? [{ key: 'notebook', label: 'Notebook', Icon: PiBooks, path: notebookPath, title: hub.name }]
      : [],
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

/**
 * Alle Seitenleisten-Einträge der Person: je Landesverband einer, dazu einer für
 * die Grüne Jugend. Rollen mit `showInSidebar: false` zählen nicht mit.
 */
export function buildRoleShortcuts(
  roles: readonly UserRole[],
  userLocale: string,
  instance: InstanceId
): RoleShortcut[] {
  const visible = roles.filter((r) => r.showInSidebar !== false);
  const lvIds = landesverbandIdsForRoles(visible, userLocale);
  const shortcuts = getLandesverbandHubsByIds(lvIds, instance).map((hub) =>
    landesverbandShortcut(hub, visible, userLocale)
  );
  const gj = grueneJugendShortcut(visible, userLocale);
  return gj ? [...shortcuts, gj] : shortcuts;
}

/** Bekommt diese Rolle einen Eintrag in der Seitenleiste? Dann bietet die Rollenkarte den Schalter an. */
export function roleHasSidebarShortcut(
  role: UserRole,
  userLocale: string,
  instance: InstanceId
): boolean {
  return buildRoleShortcuts([{ ...role, showInSidebar: true }], userLocale, instance).length > 0;
}
