export type ExplainableAccess = 'owner' | 'viewer' | 'login_required' | 'not_found';

export interface ExplainableAccessRow {
  user_id: string;
  share_mode: string;
  deleted_at: Date | string | null;
}

/**
 * Who may open an explainable reached by its share token. Callers only pass
 * rows found by that token (or by id for the owner); a private row is never
 * shared, so a viewer sees it exactly like a missing one.
 */
export function canRead(
  row: ExplainableAccessRow | null,
  viewerUserId: string | null
): ExplainableAccess {
  if (!row || row.deleted_at) return 'not_found';
  if (viewerUserId && viewerUserId === row.user_id) return 'owner';
  if (row.share_mode === 'public') return 'viewer';
  if (row.share_mode === 'authenticated') return viewerUserId ? 'viewer' : 'login_required';
  return 'not_found';
}
