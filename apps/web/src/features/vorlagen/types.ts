import { type DocumentItem } from '@/components/common/DocumentOverview';

/**
 * The subset of a user template the management UI reads. Extends DocumentItem
 * so the loosely-typed `UserTemplate[]` from `useUserTemplates` casts cleanly
 * (same pattern as the profile's VorlagenSection).
 */
export interface Template extends DocumentItem {
  id: string;
  title: string;
  description?: string;
  is_private?: boolean;
  template_type?: string;
  external_url?: string;
  preview_image_url?: string;
  thumbnail_url?: string;
  tags?: string[];
  content_data?: { originalUrl?: string } & Record<string, unknown>;
}

// Templates created inside the app's canvas/board editor are stored as
// collaborative docs (template_type 'board' | 'doc' | 'canvas') and are opened
// by instantiating a new document — as opposed to Canva/external links.
const CANVAS_EDITOR_TYPES = ['board', 'doc', 'canvas'];

export const isCanvasEditorType = (t: Template): boolean =>
  !!t.template_type && CANVAS_EDITOR_TYPES.includes(t.template_type);
