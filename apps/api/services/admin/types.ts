/**
 * Type definitions for Admin Services
 */

/**
 * Grüne API configuration
 */
export interface GrueneApiConfig {
  GRUENE_API_BASEURL: string;
  GRUENE_API_USERNAME?: string;
  GRUENE_API_PASSWORD?: string;
  GRUENE_API_KEY?: string;
  BATCH_SIZE: number;
  REQUEST_LIMIT: number;
}

/**
 * User to be offboarded
 */
export interface OffboardingUser {
  id: string;
  email?: string;
  username?: string;
  sherpa_id?: string;
  [key: string]: any;
}

/**
 * API response for offboarding users list
 */
export interface OffboardingUsersResponse {
  data: OffboardingUser[];
  meta?: {
    cursorNext?: string;
    [key: string]: any;
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
  email?: string;
  username?: string;
  display_name?: string;
  keycloak_id?: string;
  sherpa_id?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  anonymized_at?: string;
  [key: string]: any;
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
