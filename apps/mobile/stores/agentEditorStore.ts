import {
  DEFAULT_SCHEDULE,
  EMPTY_FORM,
  type FormState,
  type ScheduleState,
} from '@gruenerator/shared/grueneratoren';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type EditorVariant = 'agent' | 'recurring';

/**
 * Eine Bearbeitungssitzung des Agent-Editors. Die Unterseiten (Werkzeuge,
 * Wissen, Zeitplan …) lesen und schreiben hier statt über Navigationsparameter.
 */
export interface AgentEditorSession {
  /** Ohne Sitzung zeigt der Editor nichts aus dem Speicher an. */
  active: boolean;
  /** `null` beim Anlegen, sonst der Agent, der bearbeitet wird. */
  identifier: string | null;
  variant: EditorVariant;
  /** Die wiederkehrende Aufgabe zum Agent, falls es eine gibt. */
  taskId: string | null;
  form: FormState;
  schedule: ScheduleState;
  dirty: boolean;
  /**
   * Beim Anlegen einer wiederkehrenden Aufgabe: der schon angelegte Agent. Ein
   * erneutes Speichern nach gescheitertem Aufgaben-Aufruf legt ihn nicht doppelt an.
   */
  createdIdentifier: string | null;
}

export interface StartSessionInput {
  identifier: string | null;
  variant: EditorVariant;
  taskId: string | null;
  form: FormState;
  schedule: ScheduleState;
  dirty: boolean;
}

interface AgentEditorActions {
  start: (input: StartSessionInput) => void;
  patch: (patch: Partial<FormState>) => void;
  patchSchedule: (patch: Partial<ScheduleState>) => void;
  setCreatedIdentifier: (identifier: string) => void;
  reset: () => void;
}

const EMPTY_SESSION: AgentEditorSession = {
  active: false,
  identifier: null,
  variant: 'agent',
  taskId: null,
  form: EMPTY_FORM,
  schedule: DEFAULT_SCHEDULE,
  dirty: false,
  createdIdentifier: null,
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Gespeicherte Sitzung lesen. Fehlende Formularfelder (eine ältere App-Version
 * kannte sie noch nicht) füllen die Vorgaben auf, statt die Anleitung zu verwerfen.
 */
export function migrateAgentEditorSession(persisted: unknown): AgentEditorSession {
  if (!isObject(persisted) || !isObject(persisted.form)) return EMPTY_SESSION;
  const p = persisted;
  const schedule = isObject(p.schedule) ? p.schedule : {};
  return {
    active: p.active === true,
    identifier: typeof p.identifier === 'string' ? p.identifier : null,
    variant: p.variant === 'recurring' ? 'recurring' : 'agent',
    taskId: typeof p.taskId === 'string' ? p.taskId : null,
    form: { ...EMPTY_FORM, ...(p.form as Partial<FormState>) },
    schedule: { ...DEFAULT_SCHEDULE, ...(schedule as Partial<ScheduleState>) },
    dirty: p.dirty === true,
    createdIdentifier: typeof p.createdIdentifier === 'string' ? p.createdIdentifier : null,
  };
}

/**
 * Persistiert, damit eine lange Anleitung einen beendeten App-Prozess übersteht.
 * Nach erfolgreichem Speichern oder bewusstem Verwerfen räumt `reset()` ab.
 */
export const useAgentEditorStore = create<AgentEditorSession & AgentEditorActions>()(
  persist(
    (set) => ({
      ...EMPTY_SESSION,

      start: (input) => set({ ...input, active: true, createdIdentifier: null }),

      patch: (patch) => set((s) => ({ form: { ...s.form, ...patch }, dirty: true })),

      patchSchedule: (patch) =>
        set((s) => ({ schedule: { ...s.schedule, ...patch }, dirty: true })),

      setCreatedIdentifier: (identifier) => set({ createdIdentifier: identifier }),

      reset: () => set(EMPTY_SESSION),
    }),
    {
      name: 'gruenerator-agent-editor',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s): AgentEditorSession => ({
        active: s.active,
        identifier: s.identifier,
        variant: s.variant,
        taskId: s.taskId,
        form: s.form,
        schedule: s.schedule,
        dirty: s.dirty,
        createdIdentifier: s.createdIdentifier,
      }),
      migrate: (persisted) => migrateAgentEditorSession(persisted),
    }
  )
);

/** Ein angefangener, ungespeicherter Neu-Entwurf — die Startseite bietet ihn zum Fortsetzen an. */
export function isResumableCreateDraft(s: AgentEditorSession): boolean {
  return s.active && s.identifier === null && s.dirty;
}

/** Erst nach dem Laden aus dem Speicher eine Sitzung starten — sonst überschriebe das Laden sie. */
export function useAgentEditorHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useAgentEditorStore.persist.onFinishHydration(onChange),
    () => useAgentEditorStore.persist.hasHydrated()
  );
}
