import { GenericShareSection } from '../sidebar';
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
): SectionConfig<TState, TActions, Record<string, unknown>> {
    return {
        component: GenericShareSection,
        propsFactory: (state: TState, _actions: TActions, context?: SectionContext) => {
            const canvasText = getCanvasText(state);
            const shareProps = context || {};

            return {
                exportedImage: shareProps.exportedImage || null,
                autoSaveStatus: shareProps.autoSaveStatus || 'idle',
                shareToken: shareProps.shareToken || null,
                onCaptureCanvas: shareProps.onCaptureCanvas || (() => {}),
                onDownload: shareProps.onDownload || (() => {}),
                onNavigateToGallery: shareProps.onNavigateToGallery || (() => {}),
                canvasText,
                canvasType,
            };
        },
    };
}
