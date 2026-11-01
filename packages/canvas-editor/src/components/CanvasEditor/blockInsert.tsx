import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import {
  BlockInsertContext,
  type BlockInsertApi as CoreBlockInsertApi,
  type BlockTarget,
} from '@ggraphic/editor/components/CanvasEditor/blockInsertContext';
import {
  sharepicFormatSchema,
  type SharepicBlock,
  type SharepicBrand,
  type SharepicCreatorLocale,
} from '@gruenerator/contracts';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { EditorShellProviderProps } from '@ggraphic/editor/components/CanvasEditor/editorShell';

export type { BlockTarget };

export type BlockInsertApi = CoreBlockInsertApi<SharepicBlock>;

/** Exported for tests; the editor provides it through `BlockInsertProvider`. */
export { BlockInsertContext };

/** The editor's blocks; null outside the editor or without the catalogue and block services. */
export const useBlockInsert = (): BlockInsertApi | null =>
  // Boundary: only `BlockInsertProvider` below provides the context, with Grünerator-Blöcke.
  useContext(BlockInsertContext) as BlockInsertApi | null;

/** The country and design of the blocks a page takes. */
export interface BlockDesign {
  locale: SharepicCreatorLocale;
  brand: SharepicBrand;
}

/**
 * Pages the composer lays blocks out for: a sharepic page of either country
 * and design. A page gets only its own design's blocks, never the other's in
 * the wrong brand.
 */
const BLOCK_DESIGN: Record<string, BlockDesign> = {
  freeform: { locale: 'de-DE', brand: 'gruene' },
  'freeform-at': { locale: 'de-AT', brand: 'gruene' },
  'freeform-gj': { locale: 'de-DE', brand: 'gruene-jugend' },
  'freeform-gj-at': { locale: 'de-AT', brand: 'gruene-jugend' },
};

export const blockDesignOf = (configId: string | undefined): BlockDesign | null =>
  (configId && BLOCK_DESIGN[configId]) || null;

const fits = (block: SharepicBlock, design: BlockDesign | null): boolean =>
  !!design && block.locale === design.locale && (block.brand ?? 'gruene') === design.brand;

const token = () => Math.random().toString(36).slice(2, 8);

type BlockInsertProviderProps = Omit<EditorShellProviderProps, 'configTabIds'>;

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
  const design = blockDesignOf(pages[currentPageIndex]?.configId);
  const brand = design?.brand ?? null;
  const listBloecke = vorlagen?.listBloecke;
  const composeBlock = vorlagen?.composeBlock;
  const enabled = !!(listBloecke && composeBlock && blocks && format && design);

  // Each design's list loads once the first page in it is shown; the host caches it.
  const [loaded, setLoaded] = useState<Partial<Record<SharepicBrand, SharepicBlock[]>>>({});
  const all = brand ? (loaded[brand] ?? null) : null;
  useEffect(() => {
    if (!enabled || !brand || all || !listBloecke) return;
    let live = true;
    const settle = (bloecke: SharepicBlock[]) =>
      live && setLoaded((prev) => ({ ...prev, [brand]: bloecke }));
    listBloecke(brand)
      .then(settle)
      .catch((error: unknown) => {
        console.error('[Blöcke] Liste konnte nicht geladen werden', error);
        settle([]);
      });
    return () => {
      live = false;
    };
  }, [enabled, brand, all, listBloecke]);
  const isLoading = enabled && all === null;

  const insert = useCallback(
    async (blockId: string, target: BlockTarget = {}): Promise<boolean> => {
      const pageIndex = target.pageIndex ?? currentPageIndex;
      const block = all?.find((b) => b.id === blockId);
      const ref = canvasRefsRef.current[pageIndex]?.current;
      if (!block || !ref || !composeBlock || !blocks || !format) return false;
      if (!fits(block, blockDesignOf(pages[pageIndex]?.configId))) return false;
      try {
        return await ref.insertBlock(async (page) => {
          const color = blocks.ground(block.locale, page, block.color, block.brand ?? 'gruene');
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
            bloecke: (all ?? []).filter((b) => fits(b, design)),
            isLoading,
            insert,
          }
        : null,
    [enabled, all, design, isLoading, insert]
  );

  return <BlockInsertContext.Provider value={value}>{children}</BlockInsertContext.Provider>;
}
