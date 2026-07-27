import { useIsFocused } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { ReactNode, RefObject } from 'react';
import type { View } from 'react-native';

/**
 * Plumbing for the Android tab bar's blur.
 *
 * `expo-blur`'s `BlurView` does not blur "whatever is behind it" on Android — it
 * blurs one designated `BlurTargetView`, handed over as a ref. Without that ref
 * the native side silently falls back to `blurMethod: 'none'`, which is a plain
 * semi-transparent rectangle. Since the tab bar and the screen it floats over
 * are rendered by different parts of the navigator, the screen has to publish
 * its target and the tab bar has to pick it up — that is all this context does.
 *
 * Every tab screen stays mounted while another is on top, so registration is
 * tied to focus: the visible screen is the one worth blurring.
 */

interface TabBarBlurTargetValue {
  target: View | null;
  setTarget: (target: View | null) => void;
}

const TabBarBlurTargetContext = createContext<TabBarBlurTargetValue | null>(null);

export function TabBarBlurTargetProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<View | null>(null);
  const value = useMemo(() => ({ target, setTarget }), [target]);
  return (
    <TabBarBlurTargetContext.Provider value={value}>{children}</TabBarBlurTargetContext.Provider>
  );
}

/**
 * Publishes this screen's blur target while it is focused. Returns the ref to
 * hang on the screen's `BlurTargetView` — a `RefObject`, because that is the
 * only shape `BlurTargetView` accepts.
 *
 * Outside the provider (any screen that is not a tab screen) this is inert, so
 * `ScreenScaffold` can call it unconditionally.
 */
export function useRegisterTabBarBlurTarget(): RefObject<View | null> {
  const ctx = useContext(TabBarBlurTargetContext);
  const isFocused = useIsFocused();
  // Refs are attached before effects run, so `.current` is the mounted view by
  // the time the registration below fires.
  const ref = useRef<View | null>(null);
  const setTarget = ctx?.setTarget;

  useEffect(() => {
    if (!setTarget || !isFocused) return;
    setTarget(ref.current);
    // Deliberately no cleanup that nulls the target: blurring the outgoing
    // screen for the duration of a tab transition looks better than the bar
    // dropping to a flat fill mid-animation. The incoming screen overwrites it.
  }, [setTarget, isFocused]);

  return ref;
}

/**
 * The focused screen's target, shaped as the `RefObject` `BlurView` expects.
 *
 * A fresh object per target on purpose: `BlurView` compares
 * `prevProps.blurTarget?.current` with `props.blurTarget?.current`, so mutating
 * one long-lived ref would never register as a change and the bar would keep
 * blurring the first screen it ever saw.
 */
export function useTabBarBlurTarget(): RefObject<View | null> | undefined {
  const ctx = useContext(TabBarBlurTargetContext);
  const target = ctx?.target ?? null;
  return useMemo(() => (target ? { current: target } : undefined), [target]);
}
