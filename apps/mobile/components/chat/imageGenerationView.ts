import type { ChatMessageMetadata } from '@gruenerator/chat';

/**
 * Whether the placeholder frame belongs on screen for this turn.
 *
 * The INTENT half of this test is load-bearing, not decoration: sharepics and
 * combined social posts pass through the very same `generating_image` stage and
 * draw their own cards. Dropping the intent check puts a second, empty frame
 * above every one of those.
 *
 * The `generatedImage` half is the other edge: the payload and the stage overlap
 * for a moment, and without it the placeholder briefly sits on top of the
 * finished picture.
 */
export function showsImageGenerationFrame({
  isStreaming,
  generatedImage,
  progress,
}: {
  isStreaming: boolean;
  generatedImage: ChatMessageMetadata['generatedImage'];
  progress: ChatMessageMetadata['progress'];
}): boolean {
  if (!isStreaming || generatedImage) return false;
  if (progress?.stage !== 'generating_image') return false;
  return progress.intent === 'image' || progress.intent === 'image_edit';
}
