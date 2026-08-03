/**
 * Helpers for `profiles.custom_prompt`, which two sections of the
 * Personalisierung tab write: the free-text "Anweisungen" textarea and the
 * role wizard's generated block. The block is fenced by markers
 * (`ROLE_BLOCK_START`/`ROLE_BLOCK_END`) so each side edits only its own half.
 */
import { ROLE_BLOCK_END, ROLE_BLOCK_START } from '@gruenerator/shared/roles';

import { type Profile } from '@/features/auth/services/profileApiService';

/** `Profile` carries an index signature, so the field arrives as `unknown`. */
export function readCustomPrompt(profile: Profile | undefined): string {
  const value = profile?.custom_prompt;
  return typeof value === 'string' ? value : '';
}

/** The user-written part, with the role block cut out. */
export function stripRoleBlock(prompt: string): string {
  const start = prompt.indexOf(ROLE_BLOCK_START);
  const end = prompt.indexOf(ROLE_BLOCK_END);
  if (start === -1 || end === -1 || end < start) return prompt.trim();
  return [prompt.slice(0, start), prompt.slice(end + ROLE_BLOCK_END.length)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The role block as stored, or '' when there is none. */
export function extractRoleBlock(prompt: string): string {
  const start = prompt.indexOf(ROLE_BLOCK_START);
  const end = prompt.indexOf(ROLE_BLOCK_END);
  if (start === -1 || end === -1 || end < start) return '';
  return prompt.slice(start + ROLE_BLOCK_START.length, end).trim();
}
