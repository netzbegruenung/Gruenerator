import { create } from 'zustand';

import { useChatConfigStore } from './chatConfigStore';

import type { RoleRef } from '@gruenerator/contracts';

export interface UserRole {
  ebene: string;
  rolle: string;
  bundesland?: string;
  gliederung?: string;
  abgeordnete?: string;
  instructions?: string;
  systemPrompt?: string;
  /** Fassung des Meta-Prompts, aus dem `systemPrompt` stammt (siehe `ROLE_PROMPT_VERSION`). */
  promptVersion?: number;
}

interface UserProfileState {
  roles: UserRole[];
  /**
   * Die Rolle, mit der ein NEUER Chat startet — die zuletzt im Composer
   * gewählte. `null` heißt „Ohne Rolle", aber nur zusammen mit
   * {@link UserProfileState.hasChosenRole}: ohne diese zweite Angabe wäre
   * „noch nie gewählt" von „bewusst ohne Rolle" nicht zu unterscheiden, und
   * die Vorauswahl bei genau einer Rolle ließe sich nicht abwählen.
   *
   * Kontoweit statt gerätelokal, aus demselben Grund wie `onboardingCompleted`
   * daneben: „Ich bin Mitarbeiter*in der Landesgeschäftsstelle" ist eine
   * Eigenschaft der Person, nicht des Browsers. Ein localStorage-Wert hätte am
   * zweiten Rechner erneut gefragt und auf einem geteilten Rechner auf eine
   * Rolle gezeigt, die dem angemeldeten Konto gar nicht gehört.
   *
   * Abgrenzung zur Rolle IM Thread: die steht in den Thread-Einstellungen und
   * wird von `loadThreadSettings` geladen. Ein Thread ohne Rolle bleibt ohne
   * Rolle — dieser Wert gilt nur für den Entwurf, solange noch kein Thread
   * existiert.
   */
  activeRole: RoleRef | null;
  /**
   * Ob die Person je eine Rolle gewählt hat — beim Web-Client die Frage, ob der
   * Schlüssel `profile.activeRole` in den Konto-Einstellungen überhaupt steht.
   * Ist er nie gesetzt worden und gibt es genau EINE Rolle, gilt die als
   * vorausgewählt (siehe `ActiveRoleSyncEffect`); ein „Ohne Rolle" im Composer
   * schreibt `null` und setzt diese Angabe, womit die Vorauswahl endet.
   */
  hasChosenRole: boolean;
  locale: string;
  isHydrated: boolean;
}

interface UserProfileActions {
  setRoles: (roles: UserRole[]) => void;
  /**
   * Merkt die Rolle für neue Chats und schreibt sie in die Konto-Einstellungen.
   * Das Schreiben injiziert die Host-App (`ChatConfig.persistActiveRole`) —
   * `packages/chat` kennt die Nutzer-Voreinstellungen nicht. Fehlt sie (mobil),
   * bleibt der Wert für die Sitzung stehen und wird nicht gespeichert.
   */
  setActiveRole: (role: RoleRef | null) => void;
  setLocale: (locale: string) => void;
  hydrate: (state: Partial<UserProfileState>) => void;
  reset: () => void;
}

type UserProfileStore = UserProfileState & UserProfileActions;

const INITIAL_STATE: UserProfileState = {
  roles: [],
  activeRole: null,
  hasChosenRole: false,
  locale: 'de-DE',
  isHydrated: false,
};

export const useUserProfileStore = create<UserProfileStore>()((set) => ({
  ...INITIAL_STATE,

  setRoles: (roles) => set({ roles }),
  setActiveRole: (role) => {
    set({ activeRole: role, hasChosenRole: true });
    useChatConfigStore.getState().persistActiveRole?.(role);
  },
  setLocale: (locale) => set({ locale }),
  hydrate: (state) => set(state),
  reset: () => set(INITIAL_STATE),
}));
