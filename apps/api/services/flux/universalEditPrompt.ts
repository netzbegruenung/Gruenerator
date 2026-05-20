/**
 * Universal Edit Prompt Builder
 *
 * Builds a structured FLUX image-to-image prompt that uses the user's
 * natural-language edit instruction as-is. Used for arbitrary chat-driven
 * image edits where the user, not a branded preset, defines the change.
 *
 * Shared between the ChatGraph imageEditNode/edit_image tool and the
 * /flux/imageEditing REST route.
 */

export function buildUniversalPrompt(userText: string): string {
  const trimmed = (userText || '').toString().trim();

  const promptStructure = {
    edit: trimmed,
    style: 'Photorealistic, maintaining original image quality',
    constraints: {
      preserve: ['Aspects not mentioned in edit instruction'],
      match: ['Original lighting, shadows, and textures'],
    },
    quality: 'Photorealistic edit',
  };

  return JSON.stringify(promptStructure, null, 2);
}
