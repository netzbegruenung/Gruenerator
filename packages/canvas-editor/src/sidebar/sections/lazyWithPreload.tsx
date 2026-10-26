import { lazy, useState } from 'react';

import type { ComponentType } from 'react';

/**
 * `lazy()` with a `preload()`. React.lazy suspends on its first render even when
 * the chunk is already in memory, and React 19 then holds the reveal back for
 * ~300 ms (Suspense fallback throttling). Once `preload()` has resolved, this
 * renders the component directly — no Suspense, no delay. The choice is made
 * once per mount, so a chunk landing mid-mount never remounts the section.
 */
export function lazyWithPreload<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  // A failed load is forgotten, so the next preload (another hover, the next
  // idle warm-up) retries instead of replaying the rejection until a reload.
  const preload = () =>
    (pending ??= load().then(
      (component) => {
        loaded = component;
        return component;
      },
      (error: unknown) => {
        pending = null;
        throw error;
      }
    ));
  const Lazy = lazy(() => preload().then((component) => ({ default: component })));

  function LazyWithPreload(props: P) {
    const [Component] = useState<ComponentType<P>>(() => loaded ?? (Lazy as ComponentType<P>));
    return <Component {...props} />;
  }
  return Object.assign(LazyWithPreload, { preload });
}
