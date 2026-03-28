import { create } from 'zustand';

export interface UserRole {
  ebene: string;
  rolle: string;
  bundesland?: string;
  gliederung?: string;
  abgeordnete?: string;
  instructions?: string;
  systemPrompt?: string;
}

interface UserProfileState {
  roles: UserRole[];
  locale: string;
}

interface UserProfileActions {
  setRoles: (roles: UserRole[]) => void;
  setLocale: (locale: string) => void;
  hydrate: (state: Partial<UserProfileState>) => void;
}

type UserProfileStore = UserProfileState & UserProfileActions;

export const useUserProfileStore = create<UserProfileStore>()((set) => ({
  roles: [],
  locale: 'de-DE',

  setRoles: (roles) => set({ roles }),
  setLocale: (locale) => set({ locale }),
  hydrate: (state) => set(state),
}));
