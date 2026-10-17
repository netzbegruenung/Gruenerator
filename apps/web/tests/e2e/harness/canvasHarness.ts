/** Bridge between the canvas Vorlagen render harness and the thumbnail script. */
export interface CanvasHarness {
  /** Checks the entry like the API loader, renders its first page and returns a WebP data URL of the given width. */
  render: (entry: unknown, width: number) => Promise<{ image: string } | { error: string }>;
}

declare global {
  interface Window {
    __canvasHarness?: CanvasHarness;
  }
}
