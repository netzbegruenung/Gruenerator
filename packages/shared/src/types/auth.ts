/**
 * User profile from backend
 */
export interface User {
  id: string;
  email: string;
  display_name?: string;
  avatar_robot_id?: string;
  locale?: 'de-DE' | 'de-AT';
  igel_modus?: boolean;
  user_metadata?: {
    chat_color?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Core authentication state shared across platforms
 */
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isLoggingOut: boolean;
  selectedMessageColor: string;
  igelModus: boolean;
  locale: 'de-DE' | 'de-AT';
}

/**
 * Authentication actions
 */
export interface AuthActions {
  setAuthState: (data: Partial<AuthState> & { user: User }) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setLoggingOut: (loggingOut: boolean) => void;
  clearAuth: () => void;
  updateProfile: (profileData: Partial<User>) => Promise<User>;
  updateAvatar: (avatarRobotId: string) => Promise<User>;
  updateMessageColor: (color: string) => Promise<void>;
  updateLocale: (locale: 'de-DE' | 'de-AT') => Promise<void>;
  updateIgelModus: (enabled: boolean) => Promise<void>;
}

export type AuthStore = AuthState & AuthActions;

/**
 * Configuration for API client
 */
export interface ApiConfig {
  baseURL: string;
  getAuthToken?: () => Promise<string | null>;
  onUnauthorized?: () => void;
}

/**
 * Default auth state values
 */
export const DEFAULT_AUTH_STATE: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  isLoggingOut: false,
  selectedMessageColor: '#008939', // Default Klee
  igelModus: false,
  locale: 'de-DE',
};
