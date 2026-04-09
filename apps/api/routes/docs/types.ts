export interface PermissionEntry {
  level: 'owner' | 'editor' | 'viewer';
  granted_at: string;
  granted_by?: string;
}

export interface DocumentPermissions {
  [userId: string]: PermissionEntry;
}

export interface CollaborativeDocument {
  id: string;
  title: string;
  content?: string;
  created_by: string;
  last_edited_by: string;
  document_subtype: string;
  folder_id: string | null;
  permissions: DocumentPermissions | null;
  is_public: boolean;
  share_mode?: 'private' | 'authenticated' | 'public';
  share_permission?: 'editor' | 'viewer';
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  last_editor_name?: string;
  [key: string]: unknown;
}
