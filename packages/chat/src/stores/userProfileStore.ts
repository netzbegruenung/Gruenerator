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
  reset: () => void;
}

type UserProfileStore = UserProfileState & UserProfileActions;

const INITIAL_STATE: UserProfileState = {
  roles: [],
  locale: 'de-DE',
};

export const useUserProfileStore = create<UserProfileStore>()((set) => ({
  ...INITIAL_STATE,

  setRoles: (roles) => set({ roles }),
  setLocale: (locale) => set({ locale }),
  hydrate: (state) => set(state),
  reset: () => set(INITIAL_STATE),
}));
