// SPDX-License-Identifier: MPL-2.0
import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';

/** The Unsplash home page, tagged with the host's `utm_source` (API Terms). */
export function useUnsplashHome(): string {
  const { unsplashUtmSource = 'ggraphic' } = useCanvasEditorServices();
  return `https://unsplash.com/?utm_source=${encodeURIComponent(unsplashUtmSource)}&utm_medium=referral`;
}
