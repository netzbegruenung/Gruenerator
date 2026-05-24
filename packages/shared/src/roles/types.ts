/**
 * A single user role used by the profile "Deine Rollen" feature. Mirrors the
 * shape in @gruenerator/chat's userProfileStore; defined here so consumers
 * (notably the mobile app, whose @gruenerator/chat native entry doesn't
 * re-export it) can depend on the shared roles module alone.
 */
export interface UserRole {
  ebene: string;
  rolle: string;
  bundesland?: string;
  gliederung?: string;
  abgeordnete?: string;
  instructions?: string;
  systemPrompt?: string;
}
