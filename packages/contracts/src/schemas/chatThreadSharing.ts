/**
 * Schemas for chat thread sharing: group shares (read-write vs read-only),
 * the authenticated link share ("Thread-Archiv"), and forking a shared
 * thread into an own copy.
 */
import { z } from 'zod';

/** Per-group share mode: 'write' = Mitarbeiten, 'read' = Nur lesen. */
export const groupShareModeSchema = z.enum(['read', 'write']);
export type GroupShareMode = z.infer<typeof groupShareModeSchema>;

/** Link share state of a thread. 'authenticated' = readable by any logged-in
 *  user holding the /chat/geteilt/<slug> link. */
export const threadShareModeSchema = z.enum(['private', 'authenticated']);
export type ThreadShareMode = z.infer<typeof threadShareModeSchema>;

export const threadGroupShareSchema = z.object({
  groupId: z.string(),
  groupName: z.string(),
  mode: groupShareModeSchema,
  sharedAt: z.string(),
});
export type ThreadGroupShare = z.infer<typeof threadGroupShareSchema>;

export const threadGroupSharesResponseSchema = z.array(threadGroupShareSchema);

export const shareWithGroupBodySchema = z.object({
  groupId: z.string().min(1),
  mode: groupShareModeSchema,
});

export const sharingUserGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
});
export const sharingUserGroupsResponseSchema = z.array(sharingUserGroupSchema);

export const updateShareModeBodySchema = z.object({
  shareMode: threadShareModeSchema,
});

export const shareModeResponseSchema = z.object({
  shareMode: threadShareModeSchema,
  slugSuffix: z.string().nullable(),
  title: z.string().nullable(),
});

/** Resolved shared-thread metadata for the read-only archive view AND the
 *  owner's share dialog (which needs shareMode + slugSuffix for the link). */
export const resolveSharedThreadResponseSchema = z.object({
  id: z.string(),
  slugSuffix: z.string().nullable(),
  title: z.string().nullable(),
  /** Display name of the thread owner; null when the profile is gone. */
  ownerName: z.string().nullable(),
  accessLevel: z.enum(['read', 'write', 'owner']),
  shareMode: threadShareModeSchema,
  agentId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ResolveSharedThreadResponse = z.infer<typeof resolveSharedThreadResponseSchema>;

export const forkThreadResponseSchema = z.object({
  threadId: z.string(),
  slugSuffix: z.string().nullable(),
  title: z.string().nullable(),
});
export type ForkThreadResponse = z.infer<typeof forkThreadResponseSchema>;
