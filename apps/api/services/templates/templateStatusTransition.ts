import { type TemplateStatus, type TemplateStatusRequest } from '@gruenerator/contracts';

/**
 * Resolve a client-requested lifecycle transition for a `user_templates` row.
 *
 * Clients may only ask for `draft` (privat machen) or `pending_review` (zur
 * Galerie einreichen); `published` and `rejected` stay with the admin review
 * flow. Because the gallery filters on `is_private = false AND status =
 * 'published'`, the two columns have to move together — so this returns both,
 * and callers must not let a client set `is_private` independently of it.
 *
 * Submitting an already-published template is a no-op rather than a demotion:
 * pushing it back into the queue would pull a live gallery entry offline for a
 * second review nobody asked for.
 */
export function resolveStatusTransition(
  current: TemplateStatus,
  requested: TemplateStatusRequest
): { status: TemplateStatus; is_private: boolean } {
  if (requested === 'draft') {
    return { status: 'draft', is_private: true };
  }
  if (current === 'published') {
    return { status: 'published', is_private: false };
  }
  return { status: 'pending_review', is_private: false };
}
