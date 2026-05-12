/**
 * Nextcloud Integration Type Definitions
 */

/**
 * Nextcloud share link object
 */
export interface NextcloudShareLink {
  id: string;
  share_link: string;
  label: string | null;
  base_url: string | null;
  share_token: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string | undefined;
}

/**
 * Share link validation result
 */
export interface ShareLinkValidation {
  isValid: boolean;
  shareToken?: string | undefined;
  baseUrl?: string | undefined;
  error: string | null;
}

/**
 * Share link deletion result
 */
export interface ShareLinkDeletionResult {
  success: boolean;
  deletedId: string;
}

/**
 * Deactivation result
 */
export interface DeactivationResult {
  success: boolean;
  deactivatedCount: number;
}

/**
 * Usage statistics
 */
export interface UsageStats {
  totalLinks: number;
  activeLinks: number;
  inactiveLinks: number;
  oldestLink: Date | null;
  newestLink: Date | null;
}

/**
 * Database state check result
 */
export interface DatabaseStateCheck {
  profileExists: boolean;
  userId: string;
  nextcloud_share_links: NextcloudShareLink[] | null;
}

/**
 * A share link surfaced to a user because it was shared into one of their groups.
 * The link itself belongs to a different user (sharedByUserId).
 */
export interface SharedWithUserLink {
  link: NextcloudShareLink;
  sharedByUserId: string | null;
  sharedByName: string | null;
  groupId: string;
  groupName: string;
  sharedAt: string;
}

/**
 * Share link updates
 */
export interface ShareLinkUpdates {
  share_link?: string | undefined;
  label?: string | null | undefined;
  base_url?: string | null | undefined;
  share_token?: string | null | undefined;
  is_active?: boolean | undefined;
}
