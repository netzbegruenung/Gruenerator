import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { GrueneratorenBundle } from '../../config/routes';
import { ROUTE_RELATIONSHIPS, getCriticalStyles, preloadFonts } from '../utils/routePreloader';

export const useRoutePreloader = () => {
  const location = useLocation();
  const loadedModules = useRef(new Set());
  const styleCache = useRef(new Map());

  useEffect(() => {
    const currentRoute = ROUTE_RELATIONSHIPS[location.pathname];
    if (!currentRoute) return;

    // Lade Schriftarten beim ersten Rendern
    if (currentRoute.styles.includes('typography')) {
      preloadFonts();
    }

    // Verbesserte Style-Sicherung
    const saveStyles = () => {
      if (styleCache.current.has(location.pathname)) {
        return styleCache.current.get(location.pathname);
      }

      const criticalStyles = getCriticalStyles(location.pathname);
      const styles = Array.from(document.styleSheets).map(sheet => ({
        href: sheet.href,
        rules: Array.from(sheet.cssRules || []).filter(rule => {
          // Behalte kritische Styles
          return rule.selectorText?.includes(criticalStyles.fontFamily) ||
                 (criticalStyles.typography && rule.selectorText?.includes('typography'));
        })
      }));

      styleCache.current.set(location.pathname, styles);
      return styles;
    };

    // Optimierte Style-Wiederherstellung
    const restoreStyles = (originalStyles) => {
      const styleElement = document.createElement('style');
      styleElement.setAttribute('data-route', location.pathname);
      document.head.appendChild(styleElement);

      originalStyles.forEach(original => {
        original.rules.forEach(rule => {
          try {
            styleElement.sheet.insertRule(rule.cssText, styleElement.sheet.cssRules.length);
          } catch (error) {
            console.warn('Style rule insertion failed:', error);
          }
        });
      });
    };

    const loadModule = async (moduleName) => {
      if (!loadedModules.current.has(moduleName) && GrueneratorenBundle[moduleName]) {
        const originalStyles = saveStyles();
        try {
          await GrueneratorenBundle[moduleName].preload();
          loadedModules.current.add(moduleName);
          restoreStyles(originalStyles);
        } catch (error) {
          console.warn(`Failed to preload ${moduleName}:`, error);
        }
      }
    };

    // Sofortiges Laden
    Promise.all(currentRoute.immediate.map(module => loadModule(module, true)))
      .catch(console.error);

    // Verzögertes Laden
    const timeoutId = setTimeout(() => {
      Promise.all(currentRoute.delayed.map(module => loadModule(module, false)))
        .catch(console.error);
    }, 2000);

    return () => {
      clearTimeout(timeoutId);
      // Cleanup für route-spezifische Styles
      document.querySelectorAll(`style[data-route="${location.pathname}"]`)
        .forEach(el => el.remove());
    };
  }, [location.pathname]);
};