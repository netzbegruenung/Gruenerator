import { Server, Sparkles } from 'lucide-react';

import type { ModelOption } from '../stores/chatStore';

/**
 * Icon components for each model option, keyed by the `icon` field on ModelOption.
 * Shared between ToolToggles and NotebookComposer.
 */
export const MODEL_ICONS: Record<ModelOption['icon'], typeof Sparkles> = {
  sparkles: Sparkles,
  server: Server,
};
