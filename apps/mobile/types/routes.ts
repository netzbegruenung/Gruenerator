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
  // Texte routes
  | '/(tabs)/(texte)/presse'
  | '/(tabs)/(texte)/antrag'
  | '/(tabs)/(texte)/universal'
  // Media routes
  | '/(tabs)/(media)/reel'
  | '/(tabs)/(media)/image-studio'
  | '/(tabs)/(media)/image-studio/input'
  | '/(tabs)/(media)/image-studio/image'
  | '/(tabs)/(media)/image-studio/text'
  | '/(tabs)/(media)/image-studio/ki-input'
  | '/(tabs)/(media)/image-studio/result'
  // Tools routes
  | '/(tabs)/(tools)/suche'
  | '/(tabs)/(tools)/texteditor'
  | '/(tabs)/(tools)/barrierefreiheit'
  // Notebooks routes
  | '/(tabs)/(notebooks)'
  | '/(tabs)/(notebooks)/gruenerator'
  | '/(tabs)/(notebooks)/gruene'
  | '/(tabs)/(notebooks)/bundestagsfraktion'
  | '/(tabs)/(notebooks)/oesterreich'
  // Modal routes
  | '/(modals)/gruenerator-chat'
  | '/(modals)/edit-chat'
  // Auth routes
  | '/(auth)/login'
  | '/auth/callback'
  // Fullscreen routes
  | '/(fullscreen)/subtitle-editor'
  | '/(fullscreen)/image-studio-editor'
  | '/(fullscreen)/webview-editor';

/**
 * Modal routes that accept parameters
 */
export interface ModalRouteParams {
  '/(modals)/edit-chat': {
    componentName: string;
  };
  '/(modals)/gruenerator-chat': {
    initialMessage?: string;
  };
  '/(fullscreen)/subtitle-editor': {
    projectId: string;
    projectData: string;
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
