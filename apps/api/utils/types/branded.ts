/**
 * Branded Types for Grünerator
 *
 * Branded types (also called "nominal types" or "opaque types") add compile-time
 * type safety to primitive values like string IDs. They prevent accidentally
 * passing the wrong kind of ID where another is expected — for example, passing
 * a UserId where a DocumentId is required.
 *
 * At runtime, branded types are just regular strings (or numbers). The "brand"
 * exists only in the type system and has zero runtime cost.
 *
 * @example
 * ```typescript
 * import { type UserId, type DocumentId, UserId, DocumentId, fromParam } from '../utils/types/branded.js';
 *
 * // Creating branded IDs
 * const userId = UserId('550e8400-e29b-41d4-a716-446655440000');
 * const docId = DocumentId('7c9e6679-7425-40de-944b-e07fc1f90ae7');
 *
 * // Type error: cannot assign UserId to DocumentId
 * // const wrong: DocumentId = userId;
 *
 * // In Express route handlers, use fromParam to extract from req.params:
 * router.get('/:id', async (req: AuthRequest<{ id: string }>, res) => {
 *   const docId = fromParam<DocumentId>(req.params.id);
 * });
 * ```
 *
 * Adoption is gradual — you can introduce branded types one service at a time
 * without changing existing code.
 */

// ---------------------------------------------------------------------------
// Brand utility
// ---------------------------------------------------------------------------

declare const __brand: unique symbol;

/**
 * Intersects a base type `T` with a phantom brand tag `B`.
 * The brand only exists at the type level — no runtime overhead.
 */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ---------------------------------------------------------------------------
// Branded ID types
// ---------------------------------------------------------------------------

/** profiles.id — UUID */
export type UserId = Brand<string, 'UserId'>;

/** collaborative_documents.id — UUID */
export type DocumentId = Brand<string, 'DocumentId'>;

/** chat_threads.id — UUID */
export type ThreadId = Brand<string, 'ThreadId'>;

/** chat_messages.id — UUID */
export type MessageId = Brand<string, 'MessageId'>;

/** groups.id — UUID */
export type GroupId = Brand<string, 'GroupId'>;

/** notebook_collections.id — UUID */
export type NotebookId = Brand<string, 'NotebookId'>;

/** user_templates.id — UUID */
export type TemplateId = Brand<string, 'TemplateId'>;

/** user_sharepics.id — UUID */
export type SharepicId = Brand<string, 'SharepicId'>;

/** user_sites.id — UUID */
export type SiteId = Brand<string, 'SiteId'>;

// ---------------------------------------------------------------------------
// Constructor functions
// ---------------------------------------------------------------------------

/** Create a {@link UserId} from a raw string. */
export const UserId = (id: string): UserId => id as UserId;

/** Create a {@link DocumentId} from a raw string. */
export const DocumentId = (id: string): DocumentId => id as DocumentId;

/** Create a {@link ThreadId} from a raw string. */
export const ThreadId = (id: string): ThreadId => id as ThreadId;

/** Create a {@link MessageId} from a raw string. */
export const MessageId = (id: string): MessageId => id as MessageId;

/** Create a {@link GroupId} from a raw string. */
export const GroupId = (id: string): GroupId => id as GroupId;

/** Create a {@link NotebookId} from a raw string. */
export const NotebookId = (id: string): NotebookId => id as NotebookId;

/** Create a {@link TemplateId} from a raw string. */
export const TemplateId = (id: string): TemplateId => id as TemplateId;

/** Create a {@link SharepicId} from a raw string. */
export const SharepicId = (id: string): SharepicId => id as SharepicId;

/** Create a {@link SiteId} from a raw string. */
export const SiteId = (id: string): SiteId => id as SiteId;

// ---------------------------------------------------------------------------
// Express param helper
// ---------------------------------------------------------------------------

/**
 * Safely extract a branded ID from an Express 5 route parameter.
 *
 * Express 5 changed `req.params` values from `string` to `string | string[]`.
 * This helper normalises the value, validates it is present, and casts it to
 * the requested branded type.
 *
 * @throws {Error} If the parameter is missing or empty.
 *
 * @example
 * ```typescript
 * router.get('/:id', async (req: AuthRequest<{ id: string }>, res) => {
 *   const docId = fromParam<DocumentId>(req.params.id);
 * });
 * ```
 */
export function fromParam<T extends string>(param: string | string[]): T {
  const value = Array.isArray(param) ? param[0] : param;
  if (!value) throw new Error('Missing required parameter');
  return value as T;
}
