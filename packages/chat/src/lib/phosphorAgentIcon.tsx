import { DEFAULT_AGENT_ICON, type SkillIcon } from '@gruenerator/shared/agents';
import { lazy, Suspense, type ComponentType } from 'react';
import { type IconBaseProps } from 'react-icons';

/**
 * Lazy access to the full react-icons Phosphor set, shared with the web app's
 * picker. User agents store a full Phosphor component name (e.g. `PiSparkle`)
 * in `iconKey`; the curated slug registry in `agentIcons.ts` can't resolve
 * those, so we load the pack on demand (one cached chunk, never in the initial
 * bundle).
 *
 * The `?all` suffix makes this a separate module from the `react-icons/pi`
 * that ~120 files import statically by name. Without it the bundler must keep
 * every export of that one shared module for this namespace import, so the
 * whole 5 MB set lands in the entry graph instead of being tree-shaken.
 *
 * Boundary cast: the dynamic import resolves to the module namespace; we treat
 * it as a name→component map (icons aren't indexable by arbitrary string).
 */
type PhosphorSet = Record<string, ComponentType<IconBaseProps>>;

let piModulePromise: Promise<PhosphorSet> | null = null;

function importPhosphorSet(): Promise<PhosphorSet> {
  // @ts-expect-error -- `?all` is a bundler-only module id; typed by the cast.
  return import('react-icons/pi?all') as unknown as Promise<PhosphorSet>;
}

export function loadPhosphorModule(): Promise<PhosphorSet> {
  piModulePromise ??= importPhosphorSet().catch((error: unknown) => {
    // A cached rejection left every icon blank until reload, without a trace
    // (#5925). Forget it so the next icon retries, and say why it failed.
    piModulePromise = null;
    console.warn('[phosphorAgentIcon] loading the Phosphor icon set failed', error);
    throw error;
  });
  return piModulePromise;
}

// Cache by name so the component identity is stable across renders (no remount).
const iconCache = new Map<string, SkillIcon>();

/** Resolve a Phosphor component name to a lazy, self-suspending icon. */
export function phosphorAgentIcon(name: string): SkillIcon {
  const cached = iconCache.get(name);
  if (cached) return cached;

  const LazyIcon = lazy(async () => {
    const mod = await loadPhosphorModule();
    return { default: mod[name] ?? mod[DEFAULT_AGENT_ICON] };
  });

  const Icon: SkillIcon = ({ className }) => (
    <Suspense fallback={null}>
      <LazyIcon className={className} />
    </Suspense>
  );
  iconCache.set(name, Icon);
  return Icon;
}
