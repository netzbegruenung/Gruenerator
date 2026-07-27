import { useIsFocused } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useReduceTransparency } from '../../hooks/useAccessibilityPreferences';
import { usePreferencesStore } from '../../stores/preferencesStore';

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
 *
 * **Two contexts, not one.** The published target changes on every tab switch;
 * the setter never does. With both in one value, every `ScreenScaffold` — which
 * only ever needs the setter — re-rendered its header and full-screen gradient
 * whenever any *other* tab was focused. Split, the target change reaches only
 * the one consumer that reads it: the tab bar.
 */

const TabBarBlurTargetContext = createContext<View | null>(null);
const TabBarBlurSetterContext = createContext<((target: View | null) => void) | null>(null);

/**
 * Whether the tab bar should blur at all — the one answer both halves of this
 * plumbing need, so they can never disagree about it.
 *
 * Two ways to say no, for two different reasons: "Transparenz reduzieren" is the
 * person's accessibility choice and follows them across devices, the performance
 * mode is about what this handset can afford. Either one turns the whole thing
 * off, so the predicate is an AND of both being unset.
 *
 * Saying no here is not cosmetic. It takes `intensity` to 0, which expo-blur
 * turns into `setBlurEnabled(false)` on the native BlurView (`ExpoBlurView.kt`,
 * `applyBlurViewRadiusCompat`), and — the expensive half — it lets the screen
 * skip `BlurTargetView` entirely. See `ScreenScaffold` for why that matters.
 */
export function useTabBarBlurEnabled(): boolean {
  const reduceTransparency = useReduceTransparency();
  const performanceMode = usePreferencesStore((s) => s.performanceMode);
  return !reduceTransparency && !performanceMode;
}

export function TabBarBlurTargetProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<View | null>(null);
  // `setTarget` from useState is referentially stable, which is what makes the
  // setter context free of re-renders.
  return (
    <TabBarBlurSetterContext.Provider value={setTarget}>
      <TabBarBlurTargetContext.Provider value={target}>{children}</TabBarBlurTargetContext.Provider>
    </TabBarBlurSetterContext.Provider>
  );
}

/**
 * Publishes this screen's blur target while it is focused. Returns the ref to
 * hang on the screen's `BlurTargetView` — a `RefObject`, because that is the
 * only shape `BlurTargetView` accepts.
 *
 * Outside the provider (any screen that is not a tab screen) this is inert, so
 * `ScreenScaffold` can call it unconditionally. Pass `enabled: false` when the
 * screen renders no blur target — there is nothing to publish then, and the bar
 * is drawing an opaque fill anyway.
 */
export function useRegisterTabBarBlurTarget(enabled: boolean): RefObject<View | null> {
  const setTarget = useContext(TabBarBlurSetterContext);
  const isFocused = useIsFocused();
  // Refs are attached before effects run, so `.current` is the mounted view by
  // the time the registration below fires.
  const ref = useRef<View | null>(null);

  useEffect(() => {
    if (!enabled || !setTarget || !isFocused) return;
    setTarget(ref.current);
    // Deliberately no cleanup that nulls the target: blurring the outgoing
    // screen for the duration of a tab transition looks better than the bar
    // dropping to a flat fill mid-animation. The incoming screen overwrites it.
  }, [enabled, setTarget, isFocused]);

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
  const target = useContext(TabBarBlurTargetContext);
  return useMemo(() => (target ? { current: target } : undefined), [target]);
}
