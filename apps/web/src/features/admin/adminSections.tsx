import { hasLandesverbandContentIn } from '@gruenerator/shared/agents';
import { isToolOfferedIn } from '@gruenerator/shared/instances';
import { type ComponentType, lazy } from 'react';
import { type IconType } from 'react-icons';
import {
  FiBarChart2,
  FiBookOpen,
  FiCpu,
  FiFlag,
  FiGlobe,
  FiGrid,
  FiInbox,
  FiLayers,
  FiLink,
  FiMap,
  FiMic,
  FiRefreshCw,
  FiServer,
  FiSmartphone,
  FiUserCheck,
  FiUsers,
} from 'react-icons/fi';

import { type CURRENT_INSTANCE } from '../../config/instance';

import { ReportsNavBadge, VorlagenNavBadge } from './components/AdminNavBadges';

type InstanceId = typeof CURRENT_INSTANCE;

/**
 * Der Administrationsbereich als Registry: jede Unterseite ein Eintrag, ihre
 * Id ist zugleich der Pfad (`/admin/<id>`). Die Ids sind URLs und damit F0 —
 * umbenennen heißt weiterleiten.
 *
 * **Der Satz wird abgeleitet, nicht aufgezählt.** Eine Instanz, die die
 * Vorlagen ausblendet, soll keine Vorlagen prüfen; eine ohne Landesverbände hat
 * niemanden zu verwalten. Beides steht in der Instanz-Registry
 * (`hide.toolIds`, `hide.notebookCategories`) — `available` liest es nur. Kein
 * `if (instanceId === 'bgst')`.
 */
export const ADMIN_GROUPS = [
  { id: 'moderation', label: 'Moderation' },
  { id: 'menschen', label: 'Menschen' },
  { id: 'katalog', label: 'Katalog' },
  { id: 'daten', label: 'Daten' },
  { id: 'werkzeuge', label: 'Werkzeuge' },
] as const;

export type AdminGroupId = (typeof ADMIN_GROUPS)[number]['id'];

export interface AdminSection {
  id: string;
  group: AdminGroupId;
  label: string;
  icon: IconType;
  title: string;
  description?: string;
  /** Zähler neben dem Eintrag in der Navigation, z. B. offene Meldungen. */
  badge?: ComponentType;
  available?: (instanceId: InstanceId) => boolean;
  Component: ComponentType;
  /** Lädt das Code-Chunk vorab, ohne die Seite zu zeigen. */
  preload: () => void;
}

function lazySection(load: () => Promise<{ default: ComponentType }>) {
  return { Component: lazy(load), preload: () => void load() };
}

const hasLandesverbaende = (instanceId: InstanceId) => hasLandesverbandContentIn(instanceId);

export const ADMIN_SECTIONS = [
  {
    id: 'meldungen',
    group: 'moderation',
    label: 'Meldungen',
    icon: FiFlag,
    title: 'Meldungen',
    description:
      'Gemeldete Inhalte prüfen, entfernen oder die Meldung verwerfen. Ab drei Meldenden ist ein Inhalt automatisch ausgeblendet.',
    badge: ReportsNavBadge,
    ...lazySection(() => import('./tabs/ReportsTab')),
  },
  {
    id: 'vorlagen',
    group: 'moderation',
    label: 'Vorlagen',
    icon: FiInbox,
    title: 'Vorlagen prüfen',
    description: 'Eingereichte Vorlagen prüfen und für den Marktplatz freigeben.',
    badge: VorlagenNavBadge,
    available: (instanceId) => isToolOfferedIn('vorlagen', instanceId),
    ...lazySection(() => import('./tabs/VorlagenTab')),
  },
  {
    id: 'nutzer',
    group: 'menschen',
    label: 'Nutzer:innen',
    icon: FiUsers,
    title: 'Nutzer:innen',
    description:
      'Wer auf dieser Instanz ein Konto hat. Hier vergibst du Admin-Rechte und schaltest Panda und Sites frei.',
    ...lazySection(() => import('./tabs/UsersTab')),
  },
  {
    id: 'rollen',
    group: 'menschen',
    label: 'Rollen',
    icon: FiUserCheck,
    title: 'Rollen',
    description: 'Welche Rolle sich die Nutzenden selbst gegeben haben.',
    ...lazySection(() => import('./tabs/RolesTab')),
  },
  {
    id: 'landesverbaende',
    group: 'menschen',
    label: 'Landesverbände',
    icon: FiMap,
    title: 'Landesverband-Admins',
    description: 'Lege fest, wer welchen Landesverband administrieren darf.',
    available: hasLandesverbaende,
    ...lazySection(() => import('./landesverband-assignment/LandesverbandAssignmentTab')),
  },
  {
    id: 'rezepte',
    group: 'katalog',
    label: 'Rezepte',
    icon: FiBookOpen,
    title: 'Rezepte',
    description:
      'Welche Rezepte diese Instanz im Katalog anbietet. Ausgeblendete Rezepte bleiben über einen bestehenden Link oder eine explizite @-Erwähnung weiter erreichbar.',
    ...lazySection(() => import('./tabs/SkillsTab')),
  },
  {
    id: 'agents',
    group: 'katalog',
    label: 'Agents',
    icon: FiCpu,
    title: 'Agents',
    description:
      'Welche Agents diese Instanz im Katalog anbietet. Ausgeblendete Agents bleiben über einen bestehenden Link erreichbar. Die Landesverbands-Agents stehen nicht einzeln hier — sie fallen mit ihrem Landesverband.',
    ...lazySection(() => import('./tabs/AgentsTab')),
  },
  {
    id: 'glossar',
    group: 'katalog',
    label: 'Glossar',
    icon: FiGlobe,
    title: 'Übersetzungs-Glossar',
    description:
      'Feste Begriffe für den DeepL-Übersetzer, je Sprachpaar. Greift automatisch auf der Übersetzer-Seite und im Chat.',
    ...lazySection(() => import('./tabs/GlossarTab')),
  },
  {
    id: 'parteitage',
    group: 'katalog',
    label: 'Parteitage',
    icon: FiMic,
    title: 'Parteitage',
    description:
      'Parteitage importieren, Status und Passwort setzen, Reden ausblenden oder endgültig löschen.',
    ...lazySection(() => import('./tabs/ParteitageTab')),
  },
  {
    id: 'statistik',
    group: 'daten',
    label: 'Statistik',
    icon: FiBarChart2,
    title: 'Statistik',
    description:
      'Was auf dieser Instanz entstanden ist, über die Zeit. Nur Summen, keine Personen. Ein Klick auf eine Zeile zeigt Verlauf und Untertypen.',
    ...lazySection(() => import('./tabs/StatisticsTab')),
  },
  {
    id: 'app-updates',
    group: 'daten',
    label: 'App-Updates',
    icon: FiSmartphone,
    title: 'App-Updates',
    description:
      'Welche Stände der Handy-App in den letzten 30 Tagen liefen: der Store-Build oder ein Update aus der Luft, mit der Zahl der angemeldeten Personen (geschätzt).',
    ...lazySection(() => import('./tabs/AppUpdatesTab')),
  },
  {
    id: 'content-sync',
    group: 'daten',
    label: 'Content-Sync',
    icon: FiRefreshCw,
    title: 'Content-Sync',
    description:
      'Die letzten 200 Läufe der Scraper: was neu kam, was fehlschlug. Die stündlichen Landesverband-Läufe stehen einzeln drin, aufbewahrt werden 90 Tage.',
    // Der Sync läuft dort, wo Landesverbands-Inhalte geführt werden; die
    // stündlichen Läufe sind Landesverbands-Läufe.
    available: hasLandesverbaende,
    ...lazySection(() => import('./tabs/ContentSyncTab')),
  },
  {
    id: 'chunks',
    group: 'werkzeuge',
    label: 'Chunk-Inspektor',
    icon: FiLayers,
    title: 'Chunk-Inspektor',
    description:
      'Was der Abruf zu einem Dokument gespeichert hat — die Chunks in ihrer Reihenfolge, mit den Feldern, die im Punkt liegen. Leere Felder sind nicht berechnet worden, sondern nicht gespeichert.',
    ...lazySection(() => import('./chunk-inspector/ChunkInspectorSection')),
  },
  {
    id: 'tabellen',
    group: 'werkzeuge',
    label: 'Tabellen-Reparatur',
    icon: FiGrid,
    title: 'Tabellen-Reparatur',
    description:
      'Quellen finden, deren Tabellen ein neuer Lauf besser lesen würde, und sie neu indexieren. Ohne Titel und Dateinamen — eine einzelne Quelle öffnet der Chunk-Inspektor.',
    ...lazySection(() => import('./table-repair/TableRepairView')),
  },
  {
    id: 'konnektoren',
    group: 'werkzeuge',
    label: 'Konnektor-Test',
    icon: FiLink,
    title: 'Konnektor-Test',
    description:
      'Google Workspace und Microsoft 365 verbinden, Token prüfen und eine Datei über denselben Abruf lesen, den @connect im Chat nutzt. Geprüft wird immer deine eigene Verbindung.',
    ...lazySection(() =>
      import('./connector-test/ConnectorTestView').then((m) => ({ default: m.ConnectorTestView }))
    ),
  },
  {
    id: 'gruene-api',
    group: 'werkzeuge',
    label: 'Grüne-API-Test',
    icon: FiServer,
    title: 'Grüne-API-Test',
    description: 'Die Anbindung an die Grüne-API von Hand ausprobieren.',
    ...lazySection(() => import('./gruene-api/GrueneApiTestView')),
  },
] as const satisfies readonly AdminSection[];

export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]['id'];

export function adminSectionsFor(instanceId: InstanceId): readonly AdminSection[] {
  return ADMIN_SECTIONS.filter(
    (section: AdminSection) => !section.available || section.available(instanceId)
  );
}
