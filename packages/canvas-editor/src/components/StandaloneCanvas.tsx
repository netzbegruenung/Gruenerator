/**
 * StandaloneCanvas — Lightweight canvas component for direct embedding
 *
 * Renders a config-driven canvas without sidebar, toolbar, or layout chrome.
 * Each instance has its own scoped Zustand store (via CanvasStoreProvider in GenericCanvas).
 *
 * Use this when you need to embed a canvas directly without the full CanvasEditor
 * orchestrator (e.g., previews, inline editing, multiple canvases on one page).
 *
 * The template is either a registered id (built-in, or added by the host with
 * `registerTemplates`) or a config object the host built itself.
 *
 * For the full editing experience with sidebar/toolbar, use ControllableCanvasWrapper.
 */

import { useState, useRef, memo } from 'react';

import { getTemplate, type AnyCanvasConfig, type TemplateId } from '../templates/registry';

import { GenericCanvas } from './GenericCanvas';

import type { GenericCanvasRef } from './GenericCanvas';
import type React from 'react';

/** Which template to draw: a registered id, or a config object. Read once on mount. */
type StandaloneCanvasSource =
  { configId: TemplateId; config?: never } | { config: AnyCanvasConfig; configId?: never };

export type StandaloneCanvasProps = StandaloneCanvasSource & {
  /** Format id of the canvas; freeform lays out on it. Absent: the default format. */
  formatId?: string;
  initialProps: Record<string, unknown>;
  canvasRef?: React.Ref<GenericCanvasRef>;
  onStateChange?: (state: Record<string, unknown>) => void;
  onExport?: (base64: string) => void;
  className?: string;
  /**
   * Render-once snapshot rather than an embedded editor — see
   * `GenericCanvasProps.preview`. Used by the offscreen chat-preview renderer.
   */
  preview?: boolean;
};

const noop = () => {};

function StandaloneCanvasInner({
  configId,
  config: configProp,
  formatId,
  initialProps,
  canvasRef,
  onStateChange,
  onExport,
  className,
  preview = false,
}: StandaloneCanvasProps) {
  const [config, setConfig] = useState<AnyCanvasConfig | null>(configProp ?? null);
  const [error, setError] = useState<string | null>(null);
  const configIdRef = useRef(configId);
  const startedRef = useRef(false);

  // Load config once on first render — configId is stable
  if (!startedRef.current && configId !== undefined) {
    startedRef.current = true;
    const template = getTemplate(configId);
    if (!template) {
      setError(`Unknown canvas type: ${configId}`);
    } else {
      template
        .load(formatId)
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
        formatId={formatId}
        initialProps={initialProps}
        onExport={onExport ?? noop}
        onCancel={noop}
        callbacks={callbacks.current}
        preview={preview}
      />
    </div>
  );
}

StandaloneCanvasInner.displayName = 'StandaloneCanvas';

export const StandaloneCanvas = memo(StandaloneCanvasInner);
