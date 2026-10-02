/**
 * Typed Route Definitions for Expo Router
 * Provides type-safe navigation helpers
 */

import type { Href } from 'expo-router';

/**
 * All valid app routes as a union type
 */
export type AppRoute =
  // Home: the Chat | Arbeiten pager
  | '/'
  | '/start'
  // Tools
  | '/(focused)/reel'
  | '/(focused)/scanner'
  | '/(focused)/vorlagen'
  // Wissen
  | '/(focused)/wissen'
  // Auth routes
  | '/(auth)/login'
  | '/(auth)/onboarding'
  | '/auth/callback'
  // Focused routes
  | '/(focused)/chat-conversation'
  // Notebook routes — push with `{ withAnchor: true }` (see `app/notebook/[id]/_layout.tsx`)
  | '/notebook/[id]'
  | '/notebook/[id]/chat'
  | '/(focused)/notebook-reader'
  | '/(focused)/agents'
  | '/(focused)/projekte'
  | '/(focused)/bild-editor'
  // Fullscreen routes
  | '/(fullscreen)/subtitle-editor';

/**
 * Modal routes that accept parameters
 */
export interface ModalRouteParams {
  '/(focused)/chat-conversation': {
    threadId: string;
    initialMessage?: string;
    /** @deprecated Redirects to the notebook chat. */
    notebookId?: string;
    agentId?: string;
    initialComposerText?: string;
  };
  '/notebook/[id]/chat': {
    /** Registry id of a system notebook, or the UUID of a user notebook. */
    id: string;
    /** An existing conversation; omitted for a new one. */
    threadId?: string;
    /** Sent as the first question of a new conversation. */
    initialMessage?: string;
    title?: string;
  };
  '/notebook/[id]': {
    /** Registry id of a system notebook, or the UUID of a user notebook. */
    id: string;
    title?: string;
  };
  '/(focused)/notebook-reader': {
    /** A system document: the hit's `*-system` collection and its URL. */
    collectionId?: string;
    sourceUrl?: string;
    /** A user's own document, read through `notebookId` when it is shared. */
    documentId?: string;
    notebookId?: string;
    /** The search the hit came from — its terms mark the passages. */
    query: string;
    /** Shown while the document loads. */
    title: string;
  };
  '/(fullscreen)/subtitle-editor': {
    projectId: string;
    /** Full project as JSON (reel tool's fast path); absent → fetched by id. */
    projectData?: string;
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
