import { useArtifactLiveStore } from '../stores/artifactLiveStore';
import { useSharepicLiveStore } from '../stores/sharepicLiveStore';
import { useSocialPostLiveStore } from '../stores/socialPostLiveStore';

/**
 * True while any of the three mutually-exclusive docked panels
 * (artifact/sharepic+post) is currently showing. The panels each decide
 * their own visibility internally from these same stores; this mirrors that
 * decision for hosts that need to lay out chrome (e.g. a resize handle)
 * around whichever one is docked, without duplicating each panel's own
 * visibility logic.
 */
export function useDockedPanelActive(): boolean {
  const artifact = useArtifactLiveStore((s) => s.activeArtifact);
  const sharepic = useSharepicLiveStore((s) => s.activeVariant);
  const post = useSocialPostLiveStore((s) => s.activePost);
  return Boolean(artifact || sharepic || post);
}
