import {
  IMAGE_MODEL_BY_ID,
  DEFAULT_IMAGE_MODEL_ID,
  type ImageModelId,
} from '@gruenerator/shared/models';

import { getProfileService } from './ProfileService.js';

import type { UserProfile } from './types.js';

const USER_DEFAULTS_KEY = 'image_model';
const DEFAULT_FIELD = 'default';

function isImageModelId(value: unknown): value is ImageModelId {
  return typeof value === 'string' && value in IMAGE_MODEL_BY_ID;
}

export async function getImageModelForUser(
  userId: string,
  preloadedProfile?: UserProfile | null
): Promise<ImageModelId> {
  const profile =
    preloadedProfile !== undefined
      ? preloadedProfile
      : await getProfileService().getProfileById(userId);

  const stored = profile?.user_defaults?.[USER_DEFAULTS_KEY] as Record<string, unknown> | undefined;
  const value = stored?.[DEFAULT_FIELD];
  return isImageModelId(value) ? value : DEFAULT_IMAGE_MODEL_ID;
}

export async function setImageModelForUser(
  userId: string,
  modelId: ImageModelId
): Promise<ImageModelId> {
  if (!IMAGE_MODEL_BY_ID[modelId]) {
    throw new Error(`Unknown image modelId: ${modelId}`);
  }
  await getProfileService().updateUserDefault(userId, USER_DEFAULTS_KEY, DEFAULT_FIELD, modelId);
  return modelId;
}
