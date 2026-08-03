import { useAuthStore } from '@gruenerator/shared/stores';
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Accessibility preferences, OS setting and profile override combined.
 *
 * The profile flags do not replace the system setting, they sit on top of it:
 * unset means "follow the OS", true means "reduce regardless". Reading either
 * source alone gets it wrong — the OS alone ignores the user's explicit choice
 * in the app, the profile alone ignores a phone that is already in reduce-motion
 * mode. So every consumer goes through these hooks, never through
 * `AccessibilityInfo` directly.
 */

function useSystemFlag(
  read: () => Promise<boolean>,
  event: 'reduceMotionChanged' | 'reduceTransparencyChanged'
): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    void read().then((value) => {
      if (active) setEnabled(value);
    });
    const sub = AccessibilityInfo.addEventListener(event, setEnabled);
    return () => {
      active = false;
      sub.remove();
    };
  }, [read, event]);

  return enabled;
}

export function useReduceMotion(): boolean {
  const override = useAuthStore((s) => s.user?.reduce_motion ?? false);
  const system = useSystemFlag(AccessibilityInfo.isReduceMotionEnabled, 'reduceMotionChanged');
  return override || system;
}

export function useReduceTransparency(): boolean {
  const override = useAuthStore((s) => s.user?.reduce_transparency ?? false);
  const system = useSystemFlag(
    AccessibilityInfo.isReduceTransparencyEnabled,
    'reduceTransparencyChanged'
  );
  return override || system;
}
