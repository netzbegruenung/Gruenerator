/**
 * useCanvasLayers - Platform-agnostic hook for layer management
 * Handles CRUD operations for canvas layers with unique ID generation
 */

import { useState, useCallback, useMemo } from 'react';
import type { Layer, ImageLayer, TextLayer, ShapeLayer } from '../types.js';

export interface UseCanvasLayersOptions {
  initialLayers?: Layer[];
  onLayerChange?: (layers: Layer[]) => void;
}

export interface UseCanvasLayersReturn {
  layers: Layer[];
  addLayer: <T extends Layer>(layer: Omit<T, 'id'>) => string;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  removeLayer: (id: string) => void;
  reorderLayer: (id: string, newIndex: number) => void;
  moveLayerUp: (id: string) => void;
  moveLayerDown: (id: string) => void;
  duplicateLayer: (id: string) => string | null;
  getLayer: (id: string) => Layer | undefined;
  getLayersByType: <T extends Layer['type']>(type: T) => Layer[];
  clearLayers: () => void;
  setLayers: (layers: Layer[]) => void;
}

function generateId(): string {
  return `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useCanvasLayers(options: UseCanvasLayersOptions = {}): UseCanvasLayersReturn {
  const { initialLayers = [], onLayerChange } = options;
  const [layers, setLayersInternal] = useState<Layer[]>(initialLayers);

  const setLayers = useCallback((newLayers: Layer[]) => {
    setLayersInternal(newLayers);
    onLayerChange?.(newLayers);
  }, [onLayerChange]);

  const addLayer = useCallback(<T extends Layer>(layer: Omit<T, 'id'>): string => {
    const id = generateId();
    const newLayer = { ...layer, id } as unknown as Layer;
    setLayersInternal(prev => {
      const updated = [...prev, newLayer];
      onLayerChange?.(updated);
      return updated;
    });
    return id;
  }, [onLayerChange]);

  const updateLayer = useCallback((id: string, updates: Partial<Layer>) => {
    setLayersInternal(prev => {
      const index = prev.findIndex(l => l.id === id);
      if (index === -1) return prev;

      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates } as Layer;
      onLayerChange?.(updated);
      return updated;
    });
  }, [onLayerChange]);

  const removeLayer = useCallback((id: string) => {
    setLayersInternal(prev => {
      const updated = prev.filter(layer => layer.id !== id);
      onLayerChange?.(updated);
      return updated;
    });
  }, [onLayerChange]);

  const reorderLayer = useCallback((id: string, newIndex: number) => {
    setLayersInternal(prev => {
      const currentIndex = prev.findIndex(l => l.id === id);
      if (currentIndex === -1) return prev;

      const clampedIndex = Math.max(0, Math.min(newIndex, prev.length - 1));
      if (currentIndex === clampedIndex) return prev;

      const updated = [...prev];
      const [removed] = updated.splice(currentIndex, 1);
      updated.splice(clampedIndex, 0, removed);
      onLayerChange?.(updated);
      return updated;
    });
  }, [onLayerChange]);

  const moveLayerUp = useCallback((id: string) => {
    setLayersInternal(prev => {
      const index = prev.findIndex(l => l.id === id);
      if (index === -1 || index === prev.length - 1) return prev;

      const updated = [...prev];
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
      onLayerChange?.(updated);
      return updated;
    });
  }, [onLayerChange]);

  const moveLayerDown = useCallback((id: string) => {
    setLayersInternal(prev => {
      const index = prev.findIndex(l => l.id === id);
      if (index <= 0) return prev;

      const updated = [...prev];
      [updated[index], updated[index - 1]] = [updated[index - 1], updated[index]];
      onLayerChange?.(updated);
      return updated;
    });
  }, [onLayerChange]);

  const duplicateLayer = useCallback((id: string): string | null => {
    const layer = layers.find(l => l.id === id);
    if (!layer) return null;

    const newId = generateId();
    const duplicated: Layer = {
      ...layer,
      id: newId,
      x: layer.x + 20,
      y: layer.y + 20,
      name: layer.name ? `${layer.name} (copy)` : undefined,
    };

    setLayersInternal(prev => {
      const updated = [...prev, duplicated];
      onLayerChange?.(updated);
      return updated;
    });
    return newId;
  }, [layers, onLayerChange]);

  const getLayer = useCallback((id: string): Layer | undefined => {
    return layers.find(l => l.id === id);
  }, [layers]);

  const getLayersByType = useCallback(<T extends Layer['type']>(type: T): Layer[] => {
    return layers.filter(l => l.type === type);
  }, [layers]);

  const clearLayers = useCallback(() => {
    setLayersInternal([]);
    onLayerChange?.([]);
  }, [onLayerChange]);

  return {
    layers,
    addLayer,
    updateLayer,
    removeLayer,
    reorderLayer,
    moveLayerUp,
    moveLayerDown,
    duplicateLayer,
    getLayer,
    getLayersByType,
    clearLayers,
    setLayers,
  };
}
