/**
 * Type definitions for Admin Services
 */

/**
 * Grüne API configuration
 */
export interface GrueneApiConfig {
  GRUENE_API_BASEURL: string;
  GRUENE_API_USERNAME?: string | undefined;
  GRUENE_API_PASSWORD?: string | undefined;
  GRUENE_API_KEY?: string | undefined;
  BATCH_SIZE: number;
  REQUEST_LIMIT: number;
}

/**
 * User to be offboarded
 */
export interface OffboardingUser {
  id: string;
  email?: string | undefined;
  username?: string | undefined;
  sherpa_id?: string | undefined;
  [key: string]: unknown;
}

/**
 * API response for offboarding users list
 */
export interface OffboardingUsersResponse {
  data: OffboardingUser[];
  meta?: {
    cursorNext?: string | undefined;
    [key: string]: unknown;
  };
}

/**
 * User processing status
 */
export type UserProcessingStatus = 'deleted' | 'anonymized' | 'not_found' | 'failed';

/**
 * Result of processing a single user
 */
export interface ProcessUserResult {
  status: UserProcessingStatus;
  message: string;
}

/**
 * Batch update entry for API
 */
export interface BatchUpdateEntry {
  id: string;
  status: UserProcessingStatus;
}

/**
 * Profile from database
 */
export interface UserProfile {
  id: string;
  email?: string | undefined;
  username?: string | undefined;
  display_name?: string | undefined;
  keycloak_id?: string | undefined;
  sherpa_id?: string | undefined;
  first_name?: string | undefined;
  last_name?: string | undefined;
  avatar_url?: string | undefined;
  anonymized_at?: string | undefined;
  [key: string]: unknown;
}

/**
 * Result of a complete offboarding run (anonymized — no user data)
 */
export interface OffboardingResult {
  success: boolean;
  /** True when no changes were made — counts reflect what *would* happen. */
  dryRun: boolean;
  processed: number;
  /** Dry-run only: users found in Grünerator that would be deleted/anonymized. 0 on real runs. */
  wouldProcess: number;
  deleted: number;
  anonymized: number;
  notFound: number;
  failed: number;
  retriesProcessed: number;
  durationMs: number;
  timestamp: string;
}

/**
 * Anonymization data
 */
export interface AnonymizationData {
  email: string;
  username: string;
  display_name: string;
  keycloak_id: null;
  sherpa_id: null;
  first_name: null;
  last_name: null;
  avatar_url: null;
  anonymized_at: string;
}
