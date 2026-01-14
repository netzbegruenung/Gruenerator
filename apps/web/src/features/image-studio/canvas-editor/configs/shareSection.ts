import { GenericShareSection, type GenericShareSectionProps } from '../sidebar';
import { FaShare } from 'react-icons/fa';
import type { SectionConfig, SectionContext } from './types';

export const shareTab = {
    id: 'share' as const,
    icon: FaShare,
    label: 'Teilen',
    ariaLabel: 'Bild teilen'
};

export function createShareSection<TState, TActions = unknown>(
    canvasType: string,
    getCanvasText: (state: TState) => string
): SectionConfig<TState, TActions, GenericShareSectionProps> {
    return {
        component: GenericShareSection,
        propsFactory: (state: TState, _actions: TActions, context?: SectionContext): GenericShareSectionProps => {
            const canvasText = getCanvasText(state);

            return {
                exportedImage: context?.exportedImage ?? null,
                autoSaveStatus: context?.autoSaveStatus ?? 'idle',
                shareToken: context?.shareToken ?? null,
                onCaptureCanvas: context?.onCaptureCanvas ?? (() => {}),
                onDownload: context?.onDownload ?? (() => {}),
                onNavigateToGallery: context?.onNavigateToGallery ?? (() => {}),
                canvasText,
                canvasType,
            };
        },
    };
}
