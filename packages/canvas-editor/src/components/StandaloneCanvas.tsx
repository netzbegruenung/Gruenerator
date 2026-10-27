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
 * `registerTemplates`) or a config object the host built itself. A host with
 * only its own templates uses ConfigCanvas, which does not load the registry.
 *
 * For the full editing experience with sidebar/toolbar, use ControllableCanvasWrapper.
 */

import { useState, useRef, memo } from 'react';

import { getTemplate, type AnyCanvasConfig, type TemplateId } from '../templates/registry';

import { ConfigCanvas, type ConfigCanvasProps } from './ConfigCanvas';

/** Which template to draw: a registered id, or a config object. Read once on mount. */
type StandaloneCanvasSource =
  { configId: TemplateId; config?: never } | { config: AnyCanvasConfig; configId?: never };

export type StandaloneCanvasProps = StandaloneCanvasSource & Omit<ConfigCanvasProps, 'config'>;

function StandaloneCanvasInner({ configId, config: configProp, ...canvas }: StandaloneCanvasProps) {
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
        .load(canvas.formatId)
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

  if (error) {
    return <div className={canvas.className}>Canvas error: {error}</div>;
  }

  if (!config) {
    return <div className={canvas.className} />;
  }

  return <ConfigCanvas config={config} {...canvas} />;
}

StandaloneCanvasInner.displayName = 'StandaloneCanvas';

export const StandaloneCanvas = memo(StandaloneCanvasInner);
