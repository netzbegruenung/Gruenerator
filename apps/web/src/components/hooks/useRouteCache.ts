import { type ComponentType, useState, useEffect } from 'react';

export type PreloadableComponent = ComponentType<Record<string, unknown>> & {
  preload?: () => Promise<{ default: ComponentType<Record<string, unknown>> }>;
};

const componentCache = new Map<PreloadableComponent, ComponentType<Record<string, unknown>>>();

export const useRouteCache = (
  Component: PreloadableComponent
): ComponentType<Record<string, unknown>> => {
  const [cachedComponent, setCachedComponent] = useState<ComponentType<
    Record<string, unknown>
  > | null>(() => {
    return componentCache.get(Component) || null;
  });

  useEffect(() => {
    if (!cachedComponent && Component?.preload) {
      Component.preload().then((module) => {
        const component = module.default;
        componentCache.set(Component, component);
        setCachedComponent(() => component);
      });
    }
  }, [Component, cachedComponent]);

  return cachedComponent || Component;
};
