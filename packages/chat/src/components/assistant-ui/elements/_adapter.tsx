/**
 * Boundary between the vendored assistant-ui Elements and this repo, following
 * the same pattern as tool-ui/citation/_adapter.tsx and tool-ui/link-preview.
 *
 * Registry files ship with "@/components/ui/..." and "@/lib/utils" imports.
 * packages/chat has no "@/" alias at consumer build time (and apps/web's points
 * somewhere else entirely), so every vendored element imports from here instead
 * — which also means a re-sync only has to redirect imports, never hunt for the
 * right Collapsible.
 */
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@gruenerator/ui';
export { cn } from '../../../lib/utils';
