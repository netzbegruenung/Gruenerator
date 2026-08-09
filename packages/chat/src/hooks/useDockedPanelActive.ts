import { useArtifactLiveStore } from '../stores/artifactLiveStore';
import { useReelLiveStore } from '../stores/reelLiveStore';
import { useSharepicLiveStore } from '../stores/sharepicLiveStore';
import { useSocialPostLiveStore } from '../stores/socialPostLiveStore';

/**
 * True while any of the three mutually-exclusive docked panels
 * (artifact/sharepic+post/reel) is currently showing. The panels each decide
 * their own visibility internally from these same stores; this mirrors that
 * decision for hosts that need to lay out chrome (e.g. a resize handle)
 * around whichever one is docked, without duplicating each panel's own
 * visibility logic.
 */
export function useDockedPanelActive(): boolean {
  const artifact = useArtifactLiveStore((s) => s.activeArtifact);
  const sharepic = useSharepicLiveStore((s) => s.activeVariant);
  const post = useSocialPostLiveStore((s) => s.activePost);
  const reel = useReelLiveStore((s) => s.activeReel);
  return Boolean(artifact || sharepic || post || reel);
}
