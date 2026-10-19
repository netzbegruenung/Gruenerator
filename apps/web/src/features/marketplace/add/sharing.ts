/**
 * The share model Agents and Rezepte have in common: a `share_mode`
 * (private | groups | authenticated), an `is_public` listing on top of
 * `authenticated`, and project shares. Translated here into the three choices
 * of „Element hinzufügen", and back into the calls each kind's endpoints take.
 */
import { type PublicOwnership } from '@gruenerator/contracts';

import { type Visibility, type VisibilityChoice } from './VisibilityStep';

export type ShareMode = 'private' | 'groups' | 'authenticated';

export interface SharingState {
  shareMode: ShareMode;
  isPublic: boolean;
  groupIds: readonly string[];
}

export interface SharingOps {
  setMode: (mode: ShareMode) => Promise<unknown>;
  setPublic: (input: {
    is_public: boolean;
    public_ownership: PublicOwnership | null;
  }) => Promise<unknown>;
  addGroup: (groupId: string) => Promise<unknown>;
  removeGroup: (groupId: string) => Promise<unknown>;
}

/** `null` for „with login, by link" — none of the three, so nothing is preselected. */
export function sharingVisibility(state: SharingState): Visibility | null {
  if (state.isPublic) return 'public';
  if (state.groupIds.length > 0 || state.shareMode === 'groups') return 'project';
  if (state.shareMode === 'private') return 'private';
  return null;
}

/**
 * One choice → the calls, in the order the servers accept them: a listing
 * needs `authenticated` first; project shares go in before the mode narrows
 * to `groups`, and out before it narrows to `private`.
 */
export async function applySharing(
  choice: VisibilityChoice,
  state: SharingState,
  ops: SharingOps
): Promise<void> {
  if (choice.choice === 'public') {
    if (state.shareMode !== 'authenticated') await ops.setMode('authenticated');
    await ops.setPublic({ is_public: true, public_ownership: choice.ownership });
    return;
  }
  if (state.isPublic) await ops.setPublic({ is_public: false, public_ownership: null });
  const keep = choice.choice === 'project' ? choice.groupIds : [];
  for (const id of keep) if (!state.groupIds.includes(id)) await ops.addGroup(id);
  for (const id of state.groupIds) if (!keep.includes(id)) await ops.removeGroup(id);
  const mode: ShareMode = choice.choice === 'project' ? 'groups' : 'private';
  if (state.shareMode !== mode) await ops.setMode(mode);
}
