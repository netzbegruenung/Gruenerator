import { createContext, useContext } from 'react';

/**
 * Ob das Element, in dem ein Primitiv steckt, gesperrt ist. `CanvasRenderLayer`
 * setzt den Wert je Element; ein Context statt einer Eigenschaft, weil die
 * Primitive eigene `memo`-Vergleiche haben und eine neue Eigenschaft in jedem
 * nachgezogen werden müsste. Umschalten rendert nur das betroffene Element neu.
 */
export const CanvasItemLockContext = createContext(false);

export const useIsItemLocked = (): boolean => useContext(CanvasItemLockContext);

/** Über die Transformer-Eigenschaften eines gesperrten Elements gelegt: keine Griffe. */
export const LOCKED_TRANSFORMER = { resizeEnabled: false, rotateEnabled: false } as const;
