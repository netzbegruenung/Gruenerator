import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import {
  sharepicFormatSchema,
  type SharepicBlock,
  type SharepicCreatorLocale,
} from '@gruenerator/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { GenericCanvasRef } from '@ggraphic/editor/components/GenericCanvas';

/** Where a block goes: a page (default the active one), centred on the drop point if any. */
export interface BlockTarget {
  pageIndex?: number;
  at?: { clientX: number; clientY: number };
}

export interface BlockInsertApi {
  /** The blocks the active page can take, in catalogue order. */
  bloecke: SharepicBlock[];
  isLoading: boolean;
  insert: (blockId: string, target?: BlockTarget) => Promise<boolean>;
}

/** Exported for tests; the editor provides it through `BlockInsertProvider`. */
export const BlockInsertContext = createContext<BlockInsertApi | null>(null);

/** The editor's blocks; null outside the editor or without the catalogue and block services. */
export const useBlockInsert = (): BlockInsertApi | null => useContext(BlockInsertContext);

/** Pages the composer lays blocks out for: a sharepic page of either country. */
const BLOCK_LOCALE: Record<string, SharepicCreatorLocale> = {
  freeform: 'de-DE',
  'freeform-at': 'de-AT',
};

export const blockLocaleOf = (configId: string | undefined): SharepicCreatorLocale | null =>
  (configId && BLOCK_LOCALE[configId]) || null;

const token = () => Math.random().toString(36).slice(2, 8);

interface BlockInsertProviderProps {
  pages: readonly { configId: string }[];
  currentPageIndex: number;
  formatId: string | undefined;
  canvasRefsRef: React.MutableRefObject<React.RefObject<GenericCanvasRef | null>[]>;
  children: ReactNode;
}

/**
 * Loads the Grünerator-Blöcke and drops one onto a page: composed by the host
 * for the page's country, format and background, cut loose (the host's
 * `blocks.lift`) and added through the page's canvas handle as one undo step.
 * Without the host's `blocks` service there are no blocks, as without a catalogue.
 */
export function BlockInsertProvider({
  pages,
  currentPageIndex,
  formatId,
  canvasRefsRef,
  children,
}: BlockInsertProviderProps) {
  const { vorlagen, blocks } = useCanvasEditorServices();
  const format = sharepicFormatSchema.safeParse(formatId).data ?? null;
  const locale = blockLocaleOf(pages[currentPageIndex]?.configId);
  const listBloecke = vorlagen?.listBloecke;
  const composeBlock = vorlagen?.composeBlock;
  const enabled = !!(listBloecke && composeBlock && blocks && format && locale);

  // Loaded once the first page that takes blocks is shown; the host caches the list.
  const [all, setAll] = useState<SharepicBlock[] | null>(null);
  useEffect(() => {
    if (!enabled || all || !listBloecke) return;
    let live = true;
    listBloecke()
      .then((bloecke) => live && setAll(bloecke))
      .catch((error: unknown) => {
        console.error('[Blöcke] Liste konnte nicht geladen werden', error);
        if (live) setAll([]);
      });
    return () => {
      live = false;
    };
  }, [enabled, all, listBloecke]);
  const isLoading = enabled && all === null;

  const insert = useCallback(
    async (blockId: string, target: BlockTarget = {}): Promise<boolean> => {
      const pageIndex = target.pageIndex ?? currentPageIndex;
      const pageLocale = blockLocaleOf(pages[pageIndex]?.configId);
      const block = all?.find((b) => b.id === blockId);
      const ref = canvasRefsRef.current[pageIndex]?.current;
      if (!block || !ref || !composeBlock || !blocks || !format || block.locale !== pageLocale)
        return false;
      try {
        return await ref.insertBlock(async (page) => {
          const color = blocks.ground(block.locale, page, block.color);
          const slide = await composeBlock(block, { format, color });
          return blocks.lift(
            slide,
            block.items.map((_, i) => i),
            token()
          );
        }, target.at);
      } catch (error) {
        console.error('[Blöcke] Block konnte nicht eingefügt werden', error);
        return false;
      }
    },
    [all, pages, currentPageIndex, canvasRefsRef, composeBlock, blocks, format]
  );

  const value = useMemo<BlockInsertApi | null>(
    () =>
      enabled
        ? {
            bloecke: (all ?? []).filter((b) => b.locale === locale),
            isLoading,
            insert,
          }
        : null,
    [enabled, all, locale, isLoading, insert]
  );

  return <BlockInsertContext.Provider value={value}>{children}</BlockInsertContext.Provider>;
}
