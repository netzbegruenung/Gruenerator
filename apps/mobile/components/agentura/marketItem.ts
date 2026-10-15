import { type MenuAction } from '@expo/ui/community/menu';
import { type UserLibraryItemKind } from '@gruenerator/contracts';

/**
 * Eine fertig gezeichnete Kachel der Übersicht oder der Agentura. Agent, Rezept
 * und wiederkehrende Aufgabe unterscheiden sich hier nur in Symbol, Zeilen und
 * Zielen — `kind` und `isFavorite` sind alles, was der gemeinsame Typ-Filter
 * braucht.
 */
export interface MarketItem {
  key: string;
  kind: 'agent' | 'recipe' | 'task';
  isFavorite: boolean;
  /** Verweis für „Zu meinen Grüneratoren"; `null` bei Eigenem. */
  libraryRef: { kind: UserLibraryItemKind; ref: string } | null;
  /** Katalog- oder Landesverbands-Rezept — im Shop nur bei Suche oder Rezept-Filter. */
  systemRecipe: boolean;
  /** Web-Symbolname (`PiSparkle`) oder Konzept-Schlüssel — `AgentGlyph` zeichnet beides. */
  iconKey: string | null;
  title: string;
  meta: string;
  author?: string;
  description?: string;
  /** Kleingeschrieben, alles, was die Suche treffen soll. */
  searchText: string;
  /** Öffnet die Detailseite. */
  onOpen: () => void;
  /** Öffnet einen neuen Chat damit; `null` bei Aufgaben. */
  onStartChat: (() => void) | null;
  /** Was der lange Druck anbietet; leer = kein Menü. */
  actions: MenuAction[];
  onAction: (id: string) => void;
}

export interface MarketAisle {
  key: string;
  title: string;
  items: MarketItem[];
}

export const searchTextOf = (fields: (string | null | undefined)[]): string =>
  fields
    .filter((f): f is string => typeof f === 'string')
    .join(' ')
    .toLowerCase();
