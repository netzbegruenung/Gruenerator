import { DEFAULT_AGENT_ICON } from '@gruenerator/shared/agents';
import { lazy, Suspense, useMemo, type ComponentType } from 'react';
import { type IconBaseProps } from 'react-icons';

/**
 * Lazy access to the full react-icons Phosphor set. Kept out of the initial
 * bundle: the pack only loads when an agent icon actually renders, then the
 * promise is cached so every later icon reuses the same module.
 *
 * Boundary cast: the dynamic import resolves to the module namespace; we treat
 * it as a name→component map (the icons aren't indexable by arbitrary string
 * otherwise). This is a true module boundary, not a type hole.
 */
let piModulePromise: Promise<Record<string, ComponentType<IconBaseProps>>> | null = null;

export function loadPhosphorModule(): Promise<Record<string, ComponentType<IconBaseProps>>> {
  piModulePromise ??= import('react-icons/pi') as unknown as Promise<
    Record<string, ComponentType<IconBaseProps>>
  >;
  return piModulePromise;
}

export interface PhosphorIconProps extends IconBaseProps {
  /** react-icons Phosphor component name, e.g. `PiSparkle`. */
  name: string;
}

/**
 * Render any Phosphor icon by its component name. Unknown names fall back to
 * the default. Self-suspending — callers need no Suspense boundary.
 */
export function PhosphorIcon({ name, ...props }: PhosphorIconProps) {
  const LazyIcon = useMemo(
    () =>
      lazy(async () => {
        const mod = await loadPhosphorModule();
        return { default: mod[name] ?? mod[DEFAULT_AGENT_ICON] };
      }),
    [name]
  );

  return (
    <Suspense fallback={null}>
      <LazyIcon {...props} />
    </Suspense>
  );
}
