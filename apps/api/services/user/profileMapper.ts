import {
  chatBackgroundSchema,
  type ChatBackground,
  ttsVoiceIdSchema,
  type TtsVoiceId,
} from '@gruenerator/contracts';
import { type InferSelectModel } from 'drizzle-orm';

import { type profiles } from '../../database/schema/core.js';

import type { UserProfile } from './types.js';

type ProfileSelectModel = InferSelectModel<typeof profiles>;

/**
 * Maps a Drizzle select result from the `profiles` table to the `UserProfile` domain type.
 *
 * Key conversions:
 * - Nullable text fields default to empty string or `undefined` where UserProfile expects it
 * - `email` is non-nullable in UserProfile but nullable in the DB column
 * - `user_defaults` is typed more specifically in UserProfile
 * - `beta_features` is typed as `Record<string, boolean>` in both, already aligned
 */
export function toUserProfile(row: ProfileSelectModel): UserProfile {
  return {
    id: row.id,
    ...(row.keycloak_id != null && { keycloak_id: row.keycloak_id }),
    email: row.email ?? '',
    ...(row.username != null && { username: row.username }),
    ...(row.display_name != null && { display_name: row.display_name }),
    avatar_robot_id: row.avatar_robot_id,
    ...(row.chat_color != null && { chat_color: row.chat_color }),
    ...(chatBackgroundSchema.safeParse(row.chat_background).success && {
      chat_background: row.chat_background as ChatBackground,
    }),
    beta_features: row.beta_features,
    user_defaults: row.user_defaults,
    ...(row.locale != null && { locale: row.locale as 'de-DE' | 'de-AT' }),
    default_startpage: row.default_startpage as 'chat' | 'arbeiten',
    feedback_button: row.feedback_button as 'text' | 'icon' | 'off',
    reduce_motion: row.reduce_motion,
    reduce_transparency: row.reduce_transparency,
    show_skip_link: row.show_skip_link,
    ...(ttsVoiceIdSchema.safeParse(row.tts_voice_id).success && {
      tts_voice_id: row.tts_voice_id as TtsVoiceId,
    }),
    ai_consent_at: row.ai_consent_at ? row.ai_consent_at.toISOString() : null,
    ...(row.custom_prompt != null && { custom_prompt: row.custom_prompt }),

    // Feature flags — all have DB defaults so they are non-null
    is_admin: row.is_admin,
    groups_enabled: row.groups_enabled,
    custom_generators: row.custom_generators,
    database_access: row.database_access,
    collab: row.collab,
    notebook: row.notebook,
    sharepic: row.sharepic,
    anweisungen: row.anweisungen,
    labor_enabled: row.labor_enabled,
    sites_enabled: row.sites_enabled,
    chat: row.chat,
    interactive_antrag_enabled: row.interactive_antrag_enabled,
    vorlagen: row.vorlagen,
    video_editor: row.video_editor,
    scanner: row.scanner,
    prompts: row.prompts,
    docs: row.docs,
    boards: row.boards,
    bundestag_api_enabled: row.bundestag_api_enabled,
    memory_enabled: row.memory_enabled,

    // Timestamps
    created_at: row.created_at ?? new Date(),
    updated_at: row.updated_at ?? new Date(),
    ...(row.last_login != null && { last_login: row.last_login }),
  };
}
