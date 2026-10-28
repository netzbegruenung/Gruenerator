// SPDX-License-Identifier: MPL-2.0
import { createContext, useContext } from 'react';

/** Where a block goes: a page (default the active one), centred on the drop point if any. */
export interface BlockTarget {
  pageIndex?: number;
  at?: { clientX: number; clientY: number };
}

/**
 * The host's blocks: ready-made groups of elements, inserted onto a page as one
 * undo step. The editor drops a dragged block (`readElementDrag`'s `blockId`)
 * through `insert`; the host's panels list `bloecke`.
 */
export interface BlockInsertApi<TBlock = unknown> {
  /** The blocks the active page can take, in catalogue order. */
  bloecke: TBlock[];
  isLoading: boolean;
  insert: (blockId: string, target?: BlockTarget) => Promise<boolean>;
}

/** Provided by the host around the editor (`registerEditorShell`); null without blocks. */
export const BlockInsertContext = createContext<BlockInsertApi | null>(null);

export const useBlockInsert = (): BlockInsertApi | null => useContext(BlockInsertContext);
