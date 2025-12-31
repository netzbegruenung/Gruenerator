export interface User {
  id: string;
  email?: string;
  auth_email?: string;
  display_name?: string;
  avatar_robot_id?: string;
  keycloak_id?: string;
  locale?: 'de-DE' | 'de-AT';
  igel_modus?: boolean;
  user_metadata?: {
    chat_color?: string;
    igel_modus?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isLoggingOut: boolean;
  selectedMessageColor: string;
  igelModus: boolean;
  locale: 'de-DE' | 'de-AT';
  supabaseSession: unknown | null;
}

export interface PersistedAuthState {
  user: User | null;
  isAuthenticated: boolean;
  selectedMessageColor: string;
  igelModus: boolean;
  locale: 'de-DE' | 'de-AT';
}

export interface AuthStorageData {
  authState: PersistedAuthState;
  timestamp: number;
  cacheVersion: string;
}

export interface ProfileData {
  display_name?: string;
  email?: string;
  [key: string]: unknown;
}

export interface DeleteAccountConfirmation {
  confirm?: string;
  password?: string;
  confirmation?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
  [key: string]: unknown;
}
