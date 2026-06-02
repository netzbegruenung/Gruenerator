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
 * Boundary cast: the dynamic import resolves to the module namespace; we treat
 * it as a name→component map (icons aren't indexable by arbitrary string).
 */
let piModulePromise: Promise<Record<string, ComponentType<IconBaseProps>>> | null = null;

function loadPhosphorModule(): Promise<Record<string, ComponentType<IconBaseProps>>> {
  piModulePromise ??= import('react-icons/pi') as unknown as Promise<
    Record<string, ComponentType<IconBaseProps>>
  >;
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
