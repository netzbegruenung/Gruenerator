/**
 * Typed Route Definitions for Expo Router
 * Provides type-safe navigation helpers
 */

import type { Href } from 'expo-router';

/**
 * All valid app routes as a union type
 */
export type AppRoute =
  // Tab routes
  | '/'
  | '/start'
  | '/profile'
  // Arbeiten (merged Docs + Tools) tab
  | '/(tabs)/(arbeiten)'
  // Tools routes
  | '/(tabs)/(tools)'
  | '/(tabs)/(tools)/reel'
  | '/(tabs)/(tools)/ki-bildgenerierung'
  | '/(tabs)/(tools)/image-studio'
  | '/(tabs)/(tools)/scanner'
  | '/(tabs)/(tools)/vorlagen'
  // Recherche routes
  | '/(tabs)/(recherche)'
  | '/(tabs)/(recherche)/research'
  // Auth routes
  | '/(auth)/login'
  | '/auth/callback'
  // Focused routes
  | '/(focused)/chat-conversation'
  | '/(focused)/notebook-detail'
  | '/(focused)/agents'
  | '/(focused)/gruppen'
  | '/(focused)/bild-editor'
  | '/(focused)/image-studio-create/image'
  | '/(focused)/image-studio-create/style'
  | '/(focused)/image-studio-create/ki-input'
  | '/(focused)/image-studio-create/template-input'
  | '/(focused)/image-studio-create/result'
  // Fullscreen routes
  | '/(fullscreen)/subtitle-editor'
  | '/(fullscreen)/image-studio-editor'
  | '/(fullscreen)/webview-editor';

/**
 * Modal routes that accept parameters
 */
export interface ModalRouteParams {
  '/(focused)/chat-conversation': {
    threadId: string;
    initialMessage?: string;
    notebookId?: string;
    agentId?: string;
    initialComposerText?: string;
  };
  '/(focused)/notebook-detail': {
    notebookId: string;
    title?: string;
    kind: 'system' | 'user';
  };
  '/(fullscreen)/subtitle-editor': {
    projectId: string;
    projectData: string;
    /** '1' opens the share/export sheet immediately (ReelReadyScreen "Teilen"). */
    openShare?: string;
  };
}

/**
 * Type-safe route helper
 * Converts a string route to the Href type expected by Expo Router
 */
export function route(path: AppRoute): Href {
  return path as Href;
}

/**
 * Type-safe route with params helper
 * Creates a properly typed route object for navigation with parameters.
 *
 * Type Safety: The generic constraint ensures:
 * - `pathname` must be a valid key from ModalRouteParams
 * - `params` must match the corresponding parameter interface
 *
 * The double cast through `unknown` is required because expo-router's
 * Href type is a strict union that doesn't overlap with our generic object shape.
 * This is safe because we validate correctness at the function boundary.
 */
export function routeWithParams<T extends keyof ModalRouteParams>(
  pathname: T,
  params: ModalRouteParams[T]
): Href {
  return { pathname, params } as unknown as Href;
}

/**
 * Feature route configuration type
 */
export interface FeatureRouteConfig {
  id: string;
  label: string;
  icon: string;
  route: AppRoute;
}
