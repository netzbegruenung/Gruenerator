/**
 * Shared types for collaborative-document sharing (docs, boards, canvas, sheets).
 * All kinds live in the same `collaborative_documents` table and use the same
 * `/api/docs/:id/...` share endpoints.
 */

export type ShareMode = 'private' | 'authenticated' | 'public';

export type SharePermissionLevel = 'owner' | 'editor' | 'viewer';

export interface SharingCollaborator {
  /** The permissions endpoint returns mixed rows; group rows carry type 'group'. */
  type?: 'user' | 'group';
  user_id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  avatar_robot_id?: number;
  permission_level: SharePermissionLevel;
  granted_at: string;
}

export interface SharingShareSettings {
  is_public: boolean;
  share_permission: 'viewer' | 'editor';
  share_mode: ShareMode;
}

export interface SharingUserGroup {
  id: string;
  name: string;
  role: string;
}

export interface SharingGroupShare {
  group_id: string;
  group_name: string;
  permission_level: 'viewer' | 'editor';
  shared_at: string;
}

/**
 * Minimal request client the sharing hook needs. Structurally satisfied by
 * both the docs adapter client (packages/docs DocsApiClient) and a thin
 * wrapper around the apps/web axios client.
 */
export interface CollabShareApiClient {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
  put<T>(url: string, data?: unknown): Promise<T>;
  delete<T>(url: string): Promise<T>;
}
