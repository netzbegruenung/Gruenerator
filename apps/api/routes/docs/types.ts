export interface PermissionEntry {
  level: 'owner' | 'editor' | 'viewer';
  granted_at: string;
  granted_by?: string | undefined;
}

export interface DocumentPermissions {
  [userId: string]: PermissionEntry;
}

export interface CollaborativeDocument {
  id: string;
  title: string;
  content?: string | undefined;
  created_by: string;
  last_edited_by: string;
  document_subtype: string;
  folder_id: string | null;
  permissions: DocumentPermissions | null;
  is_public: boolean;
  share_mode?: 'private' | 'authenticated' | 'public' | undefined;
  share_permission?: 'editor' | 'viewer' | undefined;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  creator_name?: string | undefined;
  last_editor_name?: string | undefined;
  [key: string]: unknown;
}
