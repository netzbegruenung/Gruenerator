import { loadPhosphorModule } from '@gruenerator/chat';
import { DEFAULT_AGENT_ICON } from '@gruenerator/shared/agents';
import { lazy, Suspense, useMemo } from 'react';
import { type IconBaseProps } from 'react-icons';

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
