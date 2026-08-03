import { type UserRole } from '@gruenerator/chat';

export interface UserDefaultsRegistry {
  profile: {
    roles: UserRole[];
    /**
     * Set once the user has been through — or skipped — the Onboarding area.
     * Kontoweit statt gerätelokal: die Einrichtung fragt nach Rolle, Friend und
     * Hintergrund, und alle drei gelten auf allen Geräten. Ein localStorage-Flag
     * hätte dieselbe Person am zweiten Rechner erneut begrüßt.
     */
    onboardingCompleted: boolean;
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
