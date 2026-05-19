import {
  TEXT_MODEL_IDS,
  TEXT_MODEL_BY_ID,
  isModelEnabledByDefault,
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
    result[id] = resolvePreference(stored[id], id);
  }
  return result;
}

export async function setModelPreference(
  userId: string,
  modelId: TextModelId,
  enabled: boolean
): Promise<ModelPreferencesMap> {
  if (!TEXT_MODEL_BY_ID[modelId]) {
    throw new Error(`Unknown modelId: ${modelId}`);
  }
  await getProfileService().updateUserDefault(userId, USER_DEFAULTS_KEY, modelId, { enabled });
  return getModelPreferencesForUser(userId);
}

export function isModelEnabledForUser(prefs: ModelPreferencesMap, modelId: TextModelId): boolean {
  return prefs[modelId]?.enabled ?? isModelEnabledByDefault(modelId);
}
