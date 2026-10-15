import { EMPTY_RECIPE_FORM, type RecipeFormState } from '@gruenerator/shared/grueneratoren';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Ziel eines Entwurfs: ein neues Rezept oder die Erwähnung, die bearbeitet wird. */
export const NEW_RECIPE_TARGET = 'neu';

export function recipeEditorTarget(mention: string | null): string {
  return mention ? mention.toLowerCase() : NEW_RECIPE_TARGET;
}

interface RecipeEditorState {
  /** `null`: kein Entwurf offen. */
  target: string | null;
  form: RecipeFormState;
  dirty: boolean;
}

interface RecipeEditorActions {
  /** Öffnet einen Entwurf; ein KI-Entwurf zählt als ungespeichert (`dirty`). */
  begin: (target: string, form: RecipeFormState, dirty?: boolean) => void;
  update: (patch: Partial<RecipeFormState>) => void;
  clear: () => void;
}

const INITIAL: RecipeEditorState = { target: null, form: EMPTY_RECIPE_FORM, dirty: false };

/**
 * Ein gespeicherter Entwurf wird nur übernommen, wenn er zu dieser Seite gehört.
 * Ein unveränderter Bearbeiten-Entwurf ist nur eine Kopie der Serverzeile und
 * wird frisch geladen; ein neues Rezept bleibt, wie es die Startseite angelegt hat.
 */
export function shouldKeepDraft(
  state: Pick<RecipeEditorState, 'target' | 'dirty'>,
  target: string
): boolean {
  if (state.target !== target) return false;
  return state.dirty || target === NEW_RECIPE_TARGET;
}

const STRING_FIELDS = [
  'mention',
  'title',
  'description',
  'iconKey',
  'styleBlock',
  'rawExamples',
] as const;

/** Liest einen gespeicherten Entwurf tolerant; alles Unlesbare wird verworfen. */
export function migrateRecipeDraft(persisted: unknown): RecipeEditorState {
  if (!persisted || typeof persisted !== 'object') return INITIAL;
  const raw = persisted as Partial<Record<keyof RecipeEditorState, unknown>>;
  const form = raw.form;
  if (typeof raw.target !== 'string' || !form || typeof form !== 'object') return INITIAL;
  const f = form as Record<string, unknown>;
  if (STRING_FIELDS.some((k) => typeof f[k] !== 'string')) return INITIAL;
  if (f.kind !== 'custom' && f.kind !== 'preset' && f.kind !== 'recipe') return INITIAL;
  return {
    target: raw.target,
    dirty: raw.dirty === true,
    form: { ...EMPTY_RECIPE_FORM, ...(f as Partial<RecipeFormState>) },
  };
}

export const useRecipeEditorStore = create<RecipeEditorState & RecipeEditorActions>()(
  persist(
    (set) => ({
      ...INITIAL,
      begin: (target, form, dirty = false) => set({ target, form, dirty }),
      update: (patch) => set((s) => ({ form: { ...s.form, ...patch }, dirty: true })),
      clear: () => set(INITIAL),
    }),
    {
      name: 'gruenerator-recipe-editor-draft',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ target: s.target, form: s.form, dirty: s.dirty }),
      migrate: (persisted) => migrateRecipeDraft(persisted),
    }
  )
);

/** `true`, sobald der gespeicherte Entwurf aus dem Gerätespeicher gelesen ist. */
export function useRecipeDraftHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useRecipeEditorStore.persist.onFinishHydration(onChange),
    () => useRecipeEditorStore.persist.hasHydrated()
  );
}
