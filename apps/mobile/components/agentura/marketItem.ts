import { type UserLibraryItemKind } from '@gruenerator/contracts';
import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';

/**
 * Eine fertig gezeichnete Kachel der Übersicht oder der Agentura. Agent, Rezept
 * aus dem Katalog und eigenes Rezept unterscheiden sich hier nur in Symbol,
 * Zeilen und Ziel — `kind` und `isFavorite` sind alles, was der gemeinsame
 * Typ-Filter braucht.
 */
export interface MarketItem {
  key: string;
  kind: 'agent' | 'recipe';
  isFavorite: boolean;
  /** Verweis für „Zu meinen Grüneratoren"; `null` bei Eigenem. */
  libraryRef: { kind: UserLibraryItemKind; ref: string } | null;
  /** Katalog- oder Landesverbands-Rezept — im Shop nur bei Suche oder Rezept-Filter. */
  systemRecipe: boolean;
  icon: IoniconsIconName;
  title: string;
  meta: string;
  author?: string;
  description?: string;
  /** Kleingeschrieben, alles, was die Suche treffen soll. */
  searchText: string;
  /** Öffnet einen neuen Chat damit. */
  onOpen: () => void;
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
