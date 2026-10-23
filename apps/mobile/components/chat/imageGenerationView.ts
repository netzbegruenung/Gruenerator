import type { ChatMessageMetadata } from '@gruenerator/chat';

/** Which placeholder frame a streaming turn shows: a picture's, a sharepic's, or none. */
export type GenerationFrame = 'image' | 'sharepic' | null;

/**
 * The placeholder for a picture that does not exist yet.
 *
 * The INTENT half of this test is load-bearing, not decoration: sharepics and
 * combined social posts pass through the very same `generating_image` stage.
 * A sharepic gets its own frame (its card's 4:5 shape) only until its card
 * arrives — after that the card itself shows the drawing, and a frame above it
 * would be a second, empty one. A social post draws its own card and gets none.
 *
 * The `generatedImage` half is the other edge: the payload and the stage overlap
 * for a moment, and without it the placeholder briefly sits on top of the
 * finished picture.
 */
export function generationFrameFor({
  isStreaming,
  generatedImage,
  sharepicData,
  progress,
}: {
  isStreaming: boolean;
  generatedImage: ChatMessageMetadata['generatedImage'];
  sharepicData: ChatMessageMetadata['sharepicData'];
  progress: ChatMessageMetadata['progress'];
}): GenerationFrame {
  if (!isStreaming || generatedImage) return null;
  if (progress?.stage !== 'generating_image') return null;
  if (progress.intent === 'image' || progress.intent === 'image_edit') return 'image';
  if (progress.intent === 'sharepic' && !sharepicData) return 'sharepic';
  return null;
}
