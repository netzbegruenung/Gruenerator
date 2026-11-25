import { FileText, Globe, Telescope } from 'lucide-react';

import { type ComposerToolIconKey } from '../../lib/composerControls';

/**
 * Semantic icon key → component for `COMPOSER_TOOLS`. The keys live in the
 * shared registry (renderer-agnostic so React Native can read it); this map is
 * web's half of that contract, used by the plus menu and the composer chips.
 */
export const TOOL_ICONS: Record<
  ComposerToolIconKey,
  React.ComponentType<{ className?: string }>
> = {
  globe: Globe,
  research: Telescope,
  document: FileText,
};
