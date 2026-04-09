export interface WordPressSite {
  id: string;
  label: string | null;
  site_url: string;
  username: string;
  app_password_encrypted: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string | undefined;
  last_used_at: string | null;
  last_error: string | null;
}

export interface WordPressSitePublic {
  id: string;
  label: string | null;
  site_url: string;
  username: string;
  has_credentials: boolean;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  last_error: string | null;
}

export interface WordPressSiteValidation {
  isValid: boolean;
  normalizedUrl: string | null;
  error: string | null;
}

export interface WordPressDraftResult {
  success: boolean;
  postId: number | null;
  editUrl: string | null;
  viewUrl: string | null;
  error: string | null;
}

export interface WordPressSiteUpdates {
  label?: string | null | undefined;
  is_active?: boolean | undefined;
  username?: string | undefined;
  app_password?: string | undefined;
}

export interface WordPressSiteDeletionResult {
  success: boolean;
  deletedId: string;
}
