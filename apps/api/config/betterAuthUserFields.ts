/**
 * Die `additionalFields`-Tabelle des Better-Auth-`user`-Modells.
 *
 * Steht bewusst in einem eigenen, nebenwirkungsfreien Modul: `betterAuth.ts`
 * öffnet beim Import Postgres und Redis, ein Test könnte die Tabelle dort also
 * nicht lesen. Genau dieser Abgleich fehlte, als `ai_consent_at` als
 * `type: 'date'` deklariert war, `userProfileSchema` aber `z.string()`
 * forderte — siehe `betterAuthFieldContract.vitest.ts`.
 *
 * Jedes Feld hier MUSS im Guard-Test eingeordnet sein: entweder es steht in
 * `userProfileSchema` (dann prüft der Test die Typverträglichkeit), oder es
 * steht dort bewusst nicht (dann gehört es in `NOT_IN_PROFILE_SCHEMA`).
 *
 * Jedes Feld trägt `input: false`. Better Auth nimmt sonst jedes hier
 * deklarierte Feld aus dem Request-Body seiner eigenen Nutzer-Routen entgegen
 * (`parseUserInput` sperrt ausschließlich `input === false`) — darunter
 * `is_admin`, `keycloak_id` und sämtliche Freischaltungen. Geschrieben werden
 * diese Spalten nur serverseitig: Profiländerungen laufen über
 * `userProfileContract` mit eigener Feldliste, Kontoanlage über den
 * `internalAdapter`, der `parseUserInput` nicht durchläuft. Der Guard-Test
 * hält das für jedes künftige Feld fest.
 */
export const USER_ADDITIONAL_FIELDS = {
  keycloak_id: { type: 'string', required: false, input: false },
  username: { type: 'string', required: false, input: false },
  // Kein defaultValue: ein neues Konto, dessen IdP kein Land nennt, bleibt ohne
  // locale — die Oberfläche fragt dann nach (LocaleGate), statt Deutschland zu
  // unterstellen. Geschrieben wird das Land an genau einer Stelle: `localeSync.ts`.
  locale: { type: 'string', required: false, input: false },
  auth_source: { type: 'string', required: false, input: false, fieldName: 'auth_source' },
  first_name: { type: 'string', required: false, input: false },
  last_name: { type: 'string', required: false, input: false },
  custom_prompt: { type: 'string', required: false, input: false },
  custom_antrag_gliederung: { type: 'string', required: false, input: false },
  presseabbinder: { type: 'string', required: false, input: false },
  chat_color: { type: 'string', required: false, input: false },
  chat_background: { type: 'string', required: false, input: false },
  document_mode: { type: 'string', required: false, input: false, defaultValue: 'manual' },
  default_startpage: { type: 'string', required: false, input: false, defaultValue: 'chat' },
  feedback_button: { type: 'string', required: false, input: false, defaultValue: 'text' },
  reduce_motion: { type: 'boolean', required: false, input: false, defaultValue: false },
  // Kein defaultValue: NULL heißt Standardstimme (DEFAULT_TTS_VOICE_ID), damit
  // ein Wechsel des Standards nicht jedes Profil einzeln umschreiben muss.
  tts_voice_id: { type: 'string', required: false, input: false },
  reduce_transparency: { type: 'boolean', required: false, input: false, defaultValue: false },
  show_skip_link: { type: 'boolean', required: false, input: false, defaultValue: true },
  ai_consent_at: { type: 'date', required: false, input: false },
  avatar_robot_id: { type: 'number', required: false, input: false, defaultValue: 1 },
  profile_image: { type: 'number', required: false, input: false, defaultValue: 1 },
  is_admin: { type: 'boolean', required: false, input: false, defaultValue: false },
  deutschlandmodus: { type: 'boolean', required: false, input: false, defaultValue: false },
  groups_enabled: { type: 'boolean', required: false, input: false, defaultValue: false },
  groups: { type: 'boolean', required: false, input: false, defaultValue: false },
  custom_generators: { type: 'boolean', required: false, input: false, defaultValue: false },
  database_access: { type: 'boolean', required: false, input: false, defaultValue: false },
  collab: { type: 'boolean', required: false, input: false, defaultValue: false },
  notebook: { type: 'boolean', required: false, input: false, defaultValue: false },
  sharepic: { type: 'boolean', required: false, input: false, defaultValue: false },
  anweisungen: { type: 'boolean', required: false, input: false, defaultValue: false },
  content_management: { type: 'boolean', required: false, input: false, defaultValue: false },
  labor_enabled: { type: 'boolean', required: false, input: false, defaultValue: false },
  sites_enabled: { type: 'boolean', required: false, input: false, defaultValue: true },
  sites: { type: 'boolean', required: false, input: false, defaultValue: false },
  chat: { type: 'boolean', required: false, input: false, defaultValue: false },
  website: { type: 'boolean', required: false, input: false, defaultValue: false },
  ai_sharepic: { type: 'boolean', required: false, input: false, defaultValue: false },
  vorlagen: { type: 'boolean', required: false, input: false, defaultValue: false },
  video_editor: { type: 'boolean', required: false, input: false, defaultValue: false },
  scanner: { type: 'boolean', required: false, input: false, defaultValue: false },
  prompts: { type: 'boolean', required: false, input: false, defaultValue: false },
  interactive_antrag_enabled: {
    type: 'boolean',
    required: false,
    input: false,
    defaultValue: true,
  },
  docs: { type: 'boolean', required: false, input: false, defaultValue: false },
  boards: { type: 'boolean', required: false, input: false, defaultValue: false },
  bundestag_api_enabled: { type: 'boolean', required: false, input: false, defaultValue: false },
  memory_enabled: { type: 'boolean', required: false, input: false, defaultValue: true },
} as const;

/** Feldname → deklarierter Better-Auth-Typ (`'string' | 'boolean' | 'number' | 'date'`). */
export type UserAdditionalFieldName = keyof typeof USER_ADDITIONAL_FIELDS;
