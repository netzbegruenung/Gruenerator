import { type MenuAction } from '@expo/ui/community/menu';
import { type UserLibraryItemKind } from '@gruenerator/contracts';

/**
 * Eine fertig gezeichnete Kachel der Grüneratoren-Übersicht. Agent, Rezept und
 * wiederkehrende Aufgabe unterscheiden sich hier nur in Symbol, Zeilen und
 * Zielen.
 */
export interface MarketItem {
  key: string;
  kind: 'agent' | 'recipe' | 'task';
  /** Verweis für „Zu meinen Grüneratoren"; `null` bei Eigenem. */
  libraryRef: { kind: UserLibraryItemKind; ref: string } | null;
  /** Web-Symbolname (`PiSparkle`) oder Konzept-Schlüssel — `AgentGlyph` zeichnet beides. */
  iconKey: string | null;
  title: string;
  meta: string;
  description?: string;
  /** Kleingeschrieben, alles, was die Suche treffen soll. */
  searchText: string;
  /** Öffnet die Detailseite. */
  onOpen: () => void;
  /** Was der lange Druck anbietet; leer = kein Menü. */
  actions: MenuAction[];
  onAction: (id: string) => void;
}

export const searchTextOf = (fields: (string | null | undefined)[]): string =>
  fields
    .filter((f): f is string => typeof f === 'string')
    .join(' ')
    .toLowerCase();
