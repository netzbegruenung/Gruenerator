import { type ComponentType, useState, useEffect } from 'react';

interface PreloadableComponent<P = Record<string, unknown>> extends ComponentType<P> {
  preload?: () => Promise<{ default: ComponentType<P> }>;
}

const componentCache = new Map<PreloadableComponent, ComponentType>();

export const useRouteCache = <P extends Record<string, unknown>>(
  Component: PreloadableComponent<P>
): ComponentType<P> => {
  const [cachedComponent, setCachedComponent] = useState<ComponentType<P> | null>(() => {
    return (componentCache.get(Component) as ComponentType<P>) || null;
  });

  useEffect(() => {
    if (!cachedComponent && Component?.preload) {
      Component.preload().then((module) => {
        const component = module.default;
        componentCache.set(Component, component as ComponentType);
        setCachedComponent(() => component);
      });
    }
  }, [Component, cachedComponent]);

  return cachedComponent || Component;
};
