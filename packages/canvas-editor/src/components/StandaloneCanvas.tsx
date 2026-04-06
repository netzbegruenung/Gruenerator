/**
 * StandaloneCanvas — Lightweight canvas component for direct embedding
 *
 * Renders a config-driven canvas without sidebar, toolbar, or layout chrome.
 * Each instance has its own scoped Zustand store (via CanvasStoreProvider in GenericCanvas).
 *
 * Use this when you need to embed a canvas directly without the full CanvasEditor
 * orchestrator (e.g., previews, inline editing, multiple canvases on one page).
 *
 * For the full editing experience with sidebar/toolbar, use ControllableCanvasWrapper.
 */

import { useState, useRef, memo } from 'react';

import type React from 'react';

import { loadCanvasConfig, isValidCanvasType } from '../configs/configLoader';
import { GenericCanvas } from './GenericCanvas';

import type { FullCanvasConfig, CanvasConfigId } from '../configs/types';
import type { GenericCanvasRef } from './GenericCanvas';

export interface StandaloneCanvasProps {
  configId: CanvasConfigId;
  initialProps: Record<string, unknown>;
  canvasRef?: React.Ref<GenericCanvasRef>;
  onStateChange?: (state: Record<string, unknown>) => void;
  onExport?: (base64: string) => void;
  className?: string;
}

const noop = () => {};

function StandaloneCanvasInner({
  configId,
  initialProps,
  canvasRef,
  onStateChange,
  onExport,
  className,
}: StandaloneCanvasProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [config, setConfig] = useState<FullCanvasConfig<any, any> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configIdRef = useRef(configId);
  const startedRef = useRef(false);

  // Load config once on first render — configId is stable
  if (!startedRef.current) {
    startedRef.current = true;
    if (!isValidCanvasType(configId)) {
      setError(`Unknown canvas type: ${configId}`);
    } else {
      loadCanvasConfig(configId)
        .then((loaded) => {
          if (configIdRef.current === configId) {
            setConfig(loaded);
          }
        })
        .catch((err) => {
          if (configIdRef.current === configId) {
            setError(err instanceof Error ? err.message : 'Failed to load canvas config');
          }
        });
    }
  }

  // Stable ref for onStateChange callback — avoids stale closures
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const callbacks = useRef<Record<string, ((val: unknown) => void) | undefined>>({
    onStateChange: (val: unknown) => onStateChangeRef.current?.(val as Record<string, unknown>),
  });

  if (error) {
    return <div className={className}>Canvas error: {error}</div>;
  }

  if (!config) {
    return <div className={className} />;
  }

  return (
    <div className={className}>
      <GenericCanvas
        forwardedRef={canvasRef}
        config={config}
        initialProps={initialProps}
        onExport={onExport ?? noop}
        onCancel={noop}
        callbacks={callbacks.current}
      />
    </div>
  );
}

StandaloneCanvasInner.displayName = 'StandaloneCanvas';

export const StandaloneCanvas = memo(StandaloneCanvasInner);
