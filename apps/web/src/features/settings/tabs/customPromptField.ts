/**
 * Helper für `profiles.custom_prompt`. Die Spalte gehört inzwischen allein dem
 * Freitextfeld „Anweisungen" — der Rollen-Wizard schreibt nicht mehr hinein.
 * Was aus der Zeit davor noch als Rollenblock darin steht, schneidet
 * `stripRoleBlock` (aus `@gruenerator/shared/roles`) beim Lesen heraus.
 */
import { type Profile } from '@/features/auth/services/profileApiService';

/** `Profile` carries an index signature, so the field arrives as `unknown`. */
export function readCustomPrompt(profile: Profile | undefined): string {
  const value = profile?.custom_prompt;
  return typeof value === 'string' ? value : '';
}
