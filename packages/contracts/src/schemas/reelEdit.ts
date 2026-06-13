import { z } from 'zod';

// ── Reel subtitle editing in chat ───────────────────────────────────────────
//
// Schemas for the chat reel-edit branch (see apps/api/routes/chat/services/
// reelEditService.ts): the LLM's structured tool response and the project
// picker payload shown when no reel is attached to the thread yet.

/** One text-only edit to a subtitle segment. Timestamps are never touched. */
export const reelEditOperationSchema = z.object({
  segmentIndex: z.number().int().min(0),
  newText: z.string().min(1).max(500),
});
export type ReelEditOperation = z.infer<typeof reelEditOperationSchema>;

/** Forced-tool response of the reel-edit LLM call. */
export const reelEditResponseSchema = z.object({
  operations: z.array(reelEditOperationSchema).min(1).max(20),
  /** Short user-facing label, e.g. "Tippfehler in Segment 2 korrigiert". */
  summary: z.string().min(1).max(120),
  /** 1–2 friendly sentences shown as the assistant's chat reply. */
  reply: z.string().min(1),
});
export type ReelEditResponse = z.infer<typeof reelEditResponseSchema>;

/** One entry of the reel project picker offered in chat. */
export const reelPickerProjectSchema = z.object({
  projectId: z.string(),
  title: z.string(),
  /** ISO timestamp of the last edit. */
  updatedAt: z.string(),
  thumbnailUrl: z.string().nullable(),
  /** Projects without subtitles are shown disabled in the picker. */
  hasSubtitles: z.boolean(),
});
export type ReelPickerProject = z.infer<typeof reelPickerProjectSchema>;
