import { type UserRole } from '@gruenerator/chat';

export interface UserDefaultsRegistry {
  profile: {
    roles: UserRole[];
    /**
     * Starred recipe mentions, lowercased (`'presse-berlin'`). F0 — the key and
     * the value format are read by shipped clients, so extend rather than
     * rename. Mirrored into `useSkillFavoritesStore` for instant rendering.
     */
    skillFavorites: string[];
  };
  notifications: Record<string, boolean>;
  boards: Record<string, boolean>;
  popups: Record<string, boolean>;
  monitor: Record<string, boolean>;
}

export type UserDefaultsGenerator = keyof UserDefaultsRegistry;

export type UserDefaultsKey<G extends UserDefaultsGenerator> = keyof UserDefaultsRegistry[G] &
  string;

export type UserDefaultsValue<
  G extends UserDefaultsGenerator,
  K extends UserDefaultsKey<G>,
> = UserDefaultsRegistry[G][K];

export type UserDefaultsBlob = {
  [G in UserDefaultsGenerator]?: Partial<UserDefaultsRegistry[G]>;
};
