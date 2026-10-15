/** Bridge between the print render harness and the thumbnail script. */
export interface PrintHarness {
  /** The registry's Vorlagen, so the script needs no canvas-editor import. */
  vorlagen: () => { id: string; spec: unknown }[];
  /** Renders every page of a print spec, cropped to the trim (no bleed, no guides), as WebP data URLs of the given width. */
  render: (spec: unknown, width: number) => Promise<{ images: string[] } | { error: string }>;
}

declare global {
  interface Window {
    __printHarness?: PrintHarness;
  }
}
