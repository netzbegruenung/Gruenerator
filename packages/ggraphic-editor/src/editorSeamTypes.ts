// SPDX-License-Identifier: MPL-2.0
/**
 * Types at the seam between the editor core and its host: the multi-page
 * page shape, the spec-edit bridge and the alt-text tool's pages. They sit
 * below `configs/types.ts` and `CanvasEditorProvider.tsx`, which both
 * re-export them, so neither has to import the other.
 */
import type { ReplaceDeckOps } from './collab/pagesDoc';

/**
 * A page in a heterogeneous multi-page document. `TConfigId` is the host's
 * template id union; the core only knows a string, the host's own
 * multi-page editor uses `HeterogeneousPage<CanvasConfigId>`.
 */
export interface HeterogeneousPage<TConfigId extends string = string> {
  /** Unique identifier for this page */
  id: string;
  /** Config type for this page (determines which template to use) */
  configId: TConfigId;
  /** Runtime state - config interprets this based on its state type */
  state: Record<string, unknown>;
}

/**
 * Spec path: creator pages carry a `sharepicSource`, so the host can revise
 * their spec and replace the whole deck. Reads are live (at call time).
 */
export interface CanvasSpecEditBridge {
  getPages: () => HeterogeneousPage[];
  getActivePageId: () => string | null;
  /** One page-level undo step; returns the inserted page ids. */
  replaceDeck: (ops: ReplaceDeckOps) => string[];
}

/** Which pages the alt-text tool describes. */
export type AltTextScope = 'all' | 'active';

/** One page for the alt-text tool: its image and the texts the editor knows it shows. */
export interface AltTextPage {
  /** 1-based, as the page strip numbers it. */
  pageNumber: number;
  image: string;
  texts: string[];
}
