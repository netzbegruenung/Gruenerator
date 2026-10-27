/**
 * ConfigCanvas — the canvas for a template object the host built itself.
 *
 * Draws the template without sidebar, toolbar or layout chrome and never looks
 * at the template registry, so a host that brings its own templates loads
 * none of the built-in ones. Without a format the stage takes the template's
 * own size when a format of that size exists.
 *
 * To open a template by id, use StandaloneCanvas.
 */

import { memo, useRef } from 'react';

import { DEFAULT_FORMAT_ID, formatIdForSize } from '../formats';

import { GenericCanvas } from './GenericCanvas';

import type { GenericCanvasRef } from './GenericCanvas';
import type { AnyCanvasConfig } from '../templates/registry';
import type React from 'react';

export interface ConfigCanvasProps {
  /** The template to draw. Read once on mount. */
  config: AnyCanvasConfig;
  /** Format id of the canvas; freeform lays out on it. Absent: the template's size. */
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
}

const noop = () => {};

function ConfigCanvasInner({
  config,
  formatId,
  initialProps,
  canvasRef,
  onStateChange,
  onExport,
  className,
  preview = false,
}: ConfigCanvasProps) {
  // Stable ref for onStateChange callback — avoids stale closures
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const callbacks = useRef<Record<string, ((val: unknown) => void) | undefined>>({
    onStateChange: (val: unknown) => onStateChangeRef.current?.(val as Record<string, unknown>),
  });

  // A template of the default size keeps no format, exactly as before.
  const sized = formatIdForSize(config.canvas.width, config.canvas.height);
  const format = formatId ?? (sized === DEFAULT_FORMAT_ID ? null : sized);

  return (
    <div className={className}>
      <GenericCanvas
        forwardedRef={canvasRef}
        config={config}
        {...(format ? { formatId: format } : {})}
        initialProps={initialProps}
        onExport={onExport ?? noop}
        onCancel={noop}
        callbacks={callbacks.current}
        preview={preview}
      />
    </div>
  );
}

ConfigCanvasInner.displayName = 'ConfigCanvas';

export const ConfigCanvas = memo(ConfigCanvasInner);
