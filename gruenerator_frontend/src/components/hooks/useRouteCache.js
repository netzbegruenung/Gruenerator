import { useState, useEffect } from 'react';

const componentCache = new Map();

export const useRouteCache = (Component) => {
  const [cachedComponent, setCachedComponent] = useState(() => {
    return componentCache.get(Component) || null;
  });

  useEffect(() => {
    if (!cachedComponent && Component?.preload) {
      Component.preload().then(module => {
        const component = module.default;
        componentCache.set(Component, component);
        setCachedComponent(component);
      });
    }
  }, [Component, cachedComponent]);

  return cachedComponent || Component;
};