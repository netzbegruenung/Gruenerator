import {
  LEGACY_TEXT_MODEL_ALIASES,
  TEXT_MODEL_IDS,
  TEXT_MODEL_BY_ID,
  isModelEnabledByDefault,
  resolveTextModelId,
  type LegacyTextModelId,
  type TextModelId,
} from '@gruenerator/shared/models';

import { getProfileService } from './ProfileService.js';

import type { UserProfile } from './types.js';

export interface ModelPreference {
  enabled: boolean;
}

export type ModelPreferencesMap = Record<TextModelId, ModelPreference>;

const USER_DEFAULTS_KEY = 'models';

function isStoredPreference(value: unknown): value is ModelPreference {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).enabled === 'boolean'
  );
}

function resolvePreference(stored: unknown, modelId: TextModelId): ModelPreference {
  if (isStoredPreference(stored)) {
    return { enabled: stored.enabled };
  }
  return { enabled: isModelEnabledByDefault(modelId) };
}

export function getDefaultModelPreferences(): ModelPreferencesMap {
  const result = {} as ModelPreferencesMap;
  for (const id of TEXT_MODEL_IDS) {
    result[id] = { enabled: isModelEnabledByDefault(id) };
  }
  return result;
}

export async function getModelPreferencesForUser(
  userId: string,
  preloadedProfile?: UserProfile | null
): Promise<ModelPreferencesMap> {
  const profile =
    preloadedProfile !== undefined
      ? preloadedProfile
      : await getProfileService().getProfileById(userId);

  const stored = (profile?.user_defaults?.[USER_DEFAULTS_KEY] ?? {}) as Record<string, unknown>;

  const result = {} as ModelPreferencesMap;
  for (const id of TEXT_MODEL_IDS) {
    result[id] = resolvePreference(stored[id] ?? legacyStored(stored, id), id);
  }
  return result;
}

/**
 * Der unter einer Vendor-ID abgelegte Wert derselben Lane.
 *
 * Ohne das verliert jeder, der ein Modell abgeschaltet hatte, diese
 * Einstellung in dem Moment, in dem die Lane umbenannt wird — der neue
 * Schlüssel fehlt im Profil und fällt auf „an" zurück. Gelesen wird nur, nicht
 * migriert: der nächste Schaltvorgang schreibt ohnehin unter der neuen ID.
 */
function legacyStored(stored: Record<string, unknown>, id: TextModelId): unknown {
  for (const [legacyId, target] of Object.entries(LEGACY_TEXT_MODEL_ALIASES)) {
    if (target === id) {
      const value = stored[legacyId];
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

/**
 * Ein alter Client schickt weiter seine Vendor-ID (das Contract-Enum nimmt sie
 * an, siehe schemas/modelPreferences.ts). Geschrieben wird trotzdem unter der
 * Lane, sonst legte er einen zweiten Schlüssel für dieselbe Sache an.
 */
export async function setModelPreference(
  userId: string,
  modelId: TextModelId | LegacyTextModelId,
  enabled: boolean
): Promise<ModelPreferencesMap> {
  const resolved = resolveTextModelId(modelId);
  if (!resolved || !TEXT_MODEL_BY_ID[resolved]) {
    throw new Error(`Unknown modelId: ${modelId}`);
  }
  await getProfileService().updateUserDefault(userId, USER_DEFAULTS_KEY, resolved, { enabled });
  return getModelPreferencesForUser(userId);
}

export function isModelEnabledForUser(prefs: ModelPreferencesMap, modelId: TextModelId): boolean {
  return prefs[modelId]?.enabled ?? isModelEnabledByDefault(modelId);
}
