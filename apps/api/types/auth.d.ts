export interface User {
  id: string;
  email: string;
  name?: string;
  display_name?: string;
  locale?: string;
  avatar_url?: string;
  role?: string;
  groups?: string[];
  keycloak_id?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface SessionData {
  passport?: {
    user?: User;
  };
  preferredSource?: string;
  returnTo?: string;
  codeVerifier?: string;
  state?: string;
  originalUrl?: string;
}

export interface AuthenticatedRequest {
  user: User;
  isAuthenticated: () => boolean;
}
