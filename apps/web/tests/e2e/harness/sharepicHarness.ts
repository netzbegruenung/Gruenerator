/**
 * Bridge between the sharepic render harness and its callers (the visual spec
 * and the Vorlagen thumbnail script). Own module so they get the types without
 * importing the canvas editor.
 */
export interface SharepicHarnessInput {
  /** A creator spec (`SharepicSpec`), validated on the page. */
  spec: unknown;
}

export interface SharepicHarness {
  /** The composer's public fixture specs that render without a backend (no scenes, no uploads). */
  fixtures: () => string[];
  /** Renders a fixture; its made-up photo names are swapped for one stock photo. */
  renderFixture: (name: string) => Promise<{ images: string[] } | { error: string }>;
  /** Renders every slide; PNG data URLs in slide order, or the error text. */
  render: (input: SharepicHarnessInput) => Promise<{ images: string[] } | { error: string }>;
  /** Re-encodes a rendered slide as WebP of the given width (for thumbnails). */
  toWebp: (dataUrl: string, width: number) => Promise<string>;
}

declare global {
  interface Window {
    __sharepicHarness?: SharepicHarness;
  }
}
