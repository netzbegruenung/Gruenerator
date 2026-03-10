import { FaShare } from 'react-icons/fa';

import { GenericShareSection, type GenericShareSectionProps } from '../sidebar';

import type { SectionConfig, SectionContext } from './types';

export const shareTab = {
  id: 'share' as const,
  icon: FaShare,
  label: 'Teilen',
  ariaLabel: 'Bild teilen',
};

export function createShareSection<TState, TActions = unknown>(
  canvasType: string,
  getCanvasText: (state: TState) => string
): SectionConfig<TState, TActions, GenericShareSectionProps> {
  return {
    component: GenericShareSection,
    propsFactory: (
      state: TState,
      _actions: TActions,
      context?: SectionContext
    ): GenericShareSectionProps => {
      const canvasText = getCanvasText(state);

      // Note: autoSaveStatus removed - DownloadSubsection reads directly from useAutoSaveStore
      return {
        exportedImage: context?.exportedImage ?? null,
        shareToken: context?.shareToken ?? null,
        onCaptureCanvas: context?.onCaptureCanvas ?? (() => {}),
        onDownload: context?.onDownload ?? (() => {}),
        onNavigateToGallery: context?.onNavigateToGallery ?? (() => {}),
        canvasText,
        canvasType,
        pageCount: context?.pageCount as number | undefined,
        onDownloadAllZip: context?.onDownloadAllZip as (() => Promise<void>) | undefined,
        onShareAllPages: context?.onShareAllPages as (() => Promise<void>) | undefined,
        isMultiExporting: context?.isMultiExporting as boolean | undefined,
        exportProgress: context?.exportProgress as { current: number; total: number } | undefined,
      };
    },
  };
}
