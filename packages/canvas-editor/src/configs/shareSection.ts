import { stripInlineMarks } from '@ggraphic/schema';
import { FaShare } from 'react-icons/fa';

import { GenericShareSection, type GenericShareSectionProps } from '../sidebar';
import { photoCreditLine, withPhotoCredit } from '../utils/photoCredit';
import { pagePhotoCredits } from '../utils/photoCredits';

import { makeSectionDefiner } from './factory/defineSection';

import type { SectionConfig } from '@ggraphic/editor/configs/types';

export const shareTab = {
  id: 'share' as const,
  icon: FaShare,
  label: 'Teilen',
  ariaLabel: 'Teilen: Bild weitergeben',
};

/**
 * Der Bildtext je Teilen-Abschnitt, damit die Teilen-Leiste oben denselben
 * Text liest wie die Seitenleiste — ein Dreizeiler steht in `line1..3`, nicht
 * in `headline`.
 */
const imageTextReaders = new WeakMap<object, (state: unknown) => string>();

/** Bildtext ohne Auszeichnungsmarker, wie ihn der Teilen-Abschnitt zeigt; `null` ohne einen. */
export function shareImageText(section: object | null, state: unknown): string | null {
  const read = section ? imageTextReaders.get(section) : null;
  return read && state != null ? stripInlineMarks(read(state)) : null;
}

export function createShareSection<TState, TActions = unknown>(
  canvasType: string,
  getCanvasText: (state: TState) => string
): SectionConfig<TState, TActions, GenericShareSectionProps> {
  const section = makeSectionDefiner<TState, TActions>();
  const config = section({
    component: GenericShareSection,
    propsFactory: (state, _actions, context) => {
      // Zum Teilen und Kopieren nur der Text — die Auszeichnungsmarker
      // (`**`, `_`) gehören auf die Leinwand, nicht in einen Beitrag. Der
      // Bildnachweis dagegen gehört hinein (Unsplash verlangt ihn im Post).
      const imageText = stripInlineMarks(getCanvasText(state));
      const canvasText = withPhotoCredit(
        imageText,
        photoCreditLine(pagePhotoCredits(state as Record<string, unknown>))
      );

      // Note: autoSaveStatus removed - DownloadSubsection reads directly from useAutoSaveStore
      return {
        exportedImage: context?.exportedImage ?? null,
        shareToken: context?.shareToken ?? null,
        onCaptureCanvas: context?.onCaptureCanvas ?? (() => {}),
        captureCanvasImage: context?.captureCanvasImage ?? null,
        onDownload: context?.onDownload ?? (() => {}),
        onNavigateToGallery: context?.onNavigateToGallery ?? (() => {}),
        onSaveAsTemplate: context?.onSaveAsTemplate,
        canvasText,
        imageText,
        canvasType,
        pageCount: context?.pageCount as number | undefined,
        onDownloadAllZip: context?.onDownloadAllZip as (() => Promise<void>) | undefined,
        onShareAllPages: context?.onShareAllPages as (() => Promise<void>) | undefined,
        isMultiExporting: context?.isMultiExporting as boolean | undefined,
        exportProgress: context?.exportProgress as { current: number; total: number } | undefined,
        exportError: context?.exportError as string | null | undefined,
        exportNotice: context?.exportNotice as string | null | undefined,
      };
    },
  });
  // Die Grenze ist hier: der Leser gehört zu genau diesem Abschnitt, also zu TState.
  imageTextReaders.set(config, getCanvasText as (state: unknown) => string);
  return config;
}
