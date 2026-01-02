/**
 * Canva Integration Type Definitions
 */

/**
 * Canva OAuth token data from API response
 */
export interface CanvaTokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

/**
 * Canva user profile data
 */
export interface CanvaProfile {
  canva_access_token: string | null;
  canva_refresh_token: string | null;
  canva_token_expires_at: string | null;
  canva_scopes: string[] | null;
  canva_user_id?: string | null;
  canva_display_name?: string | null;
  canva_email?: string | null;
}

/**
 * Canva token update data
 */
export interface CanvaTokenUpdate {
  canva_access_token: string;
  canva_refresh_token: string;
  canva_token_expires_at: string;
  canva_scopes: string[];
}

/**
 * Canva token clear data
 */
export interface CanvaTokenClear {
  canva_access_token: null;
  canva_refresh_token: null;
  canva_token_expires_at: null;
  canva_user_id: null;
  canva_display_name: null;
  canva_email: null;
  canva_scopes: null;
}
