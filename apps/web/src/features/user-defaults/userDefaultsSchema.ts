import { type UserRole } from '@gruenerator/chat';

export interface UserDefaultsRegistry {
  profile: {
    roles: UserRole[];
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
