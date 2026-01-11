
import {
    DreizeilenTextAndFontSection,
    DreizeilenPositionSection,
    AlternativesSection,
    AssetsSection,
    ImageBackgroundSection,
    GenericShareSection
} from '../sidebar';
import type { DreizeilenAlternative } from './dreizeilen.types';
import type { ShapeInstance, ShapeType } from '../utils/shapes';
import type { CanvasConfig, AdditionalText } from './types';
import type { DreizeilenState } from '../composed/DreizeilenCanvas';
import type { StockImageAttribution } from '../../services/imageSourceService';
import { PiTextT, PiSquaresFourFill } from 'react-icons/pi';
import { HiSparkles, HiPhotograph } from 'react-icons/hi';
import { FaShare } from 'react-icons/fa';
import { BalkenIcon } from '../icons';
import { COLOR_SCHEMES, getColorScheme } from '../utils/dreizeilenLayout';
import { ALL_ASSETS, CANVAS_RECOMMENDED_ASSETS } from '../utils/canvasAssets';

// Types for actions
interface DreizeilenActions {
    setLine1: (val: string) => void;
    setLine2: (val: string) => void;
    setLine3: (val: string) => void;
    setFontSize: (val: number) => void;
    setColorSchemeId: (val: string) => void;
    setBalkenWidthScale: (val: number) => void;
    setBarOffsets: (offsets: [number, number, number]) => void;
    setSunflowerVisible: (visible: boolean) => void;
    setCurrentImageSrc: (src: string) => void;
    setImageScale: (scale: number) => void;
    setImageAttribution?: (attribution: StockImageAttribution | null) => void;
    handleReset: () => void;
    handleSelectAlternative: (alt: DreizeilenAlternative) => void;
    handleAssetToggle: (id: string, visible: boolean) => void;
    toggleIcon: (id: string, selected: boolean) => void;
    addShape: (type: ShapeType) => void;
    // Additional Texts
    addHeader: () => void;
    addText: () => void;
    updateAdditionalText: (id: string, partial: Partial<AdditionalText>) => void;
    removeAdditionalText: (id: string) => void;
}

export const dreizeilenConfig: CanvasConfig<DreizeilenState, DreizeilenActions> = {
    tabs: [
        { id: 'text', icon: PiTextT, label: 'Text', ariaLabel: 'Text bearbeiten' },
        { id: 'image-background', icon: HiPhotograph, label: 'Hintergrund', ariaLabel: 'Hintergrundbild ändern' },
        { id: 'position', icon: BalkenIcon, label: 'Balken', ariaLabel: 'Balken-Einstellungen' },
        { id: 'assets', icon: PiSquaresFourFill, label: 'Elemente', ariaLabel: 'Sonnenblume ein/aus' },
        { id: 'alternatives', icon: HiSparkles, label: 'Alternativen', ariaLabel: 'Alternative Texte' },
        { id: 'share', icon: FaShare, label: 'Teilen', ariaLabel: 'Bild teilen' },
    ],
    sections: {
        text: {
            component: DreizeilenTextAndFontSection,
            propsFactory: (state, actions: DreizeilenActions) => ({
                line1: state.line1,
                line2: state.line2,
                line3: state.line3,
                onLine1Change: actions.setLine1,
                onLine2Change: actions.setLine2,
                onLine3Change: actions.setLine3,
                fontSize: state.fontSize,
                onFontSizeChange: actions.setFontSize,
                additionalTexts: state.additionalTexts || [],
                onAddHeader: actions.addHeader,
                onAddText: actions.addText,
                onUpdateAdditionalText: (id: string, text: string) => actions.updateAdditionalText?.(id, { text }),
                onRemoveAdditionalText: actions.removeAdditionalText,
            }),
        },
        position: {
            component: DreizeilenPositionSection,
            propsFactory: (state, actions: DreizeilenActions) => ({
                widthScale: state.balkenWidthScale,
                onWidthScaleChange: actions.setBalkenWidthScale,
                barOffsets: state.barOffsets,
                onBarOffsetChange: (_index: number, offset: number) => {
                    // Wrapper to match signature if needed, or update store to support index
                    const newOffsets = [...state.barOffsets];
                    newOffsets[_index] = offset;
                    actions.setBarOffsets(newOffsets as [number, number, number]);
                },
                colorScheme: getColorScheme(state.colorSchemeId),
                // For now, let's assume the component helps or we pass activeSchemeId
                colorSchemes: COLOR_SCHEMES,
                activeSchemeId: state.colorSchemeId,
                onSchemeChange: actions.setColorSchemeId,
                onReset: actions.handleReset,
            }),
        },
        assets: {
            component: AssetsSection,
            propsFactory: (state, actions: DreizeilenActions) => ({
                assets: ALL_ASSETS.map(asset => ({
                    ...asset,
                    visible: asset.id === 'sunflower' ? state.sunflowerVisible : false,
                })),
                onAssetToggle: actions.handleAssetToggle,
                recommendedAssetIds: CANVAS_RECOMMENDED_ASSETS['dreizeilen'],
                selectedIcons: state.selectedIcons || [],
                onIconToggle: actions.toggleIcon,
                onAddShape: actions.addShape,
            }),
        },
        alternatives: {
            component: AlternativesSection,
            propsFactory: (state, actions: DreizeilenActions) => ({
                alternatives: [], // The alternatives are passed as props to the canvas, not stored in state usually? 
                // Wait, they were props in DreizeilenCanvas. We need access to them.
                // We might need to extend the "State" idea to include "Context" or "Props".
                // For now, let's assume we can pass them via a closure or enriched state.
                currentLine1: state.line1,
                currentLine2: state.line2,
                currentLine3: state.line3,
                onSelectAlternative: actions.handleSelectAlternative,
            }),
        },
        'image-background': {
            component: ImageBackgroundSection,
            propsFactory: (state, actions: DreizeilenActions) => ({
                currentImageSrc: state.currentImageSrc,
                onImageChange: (_: File | null, url?: string, attribution?: StockImageAttribution | null) => {
                    if (url) actions.setCurrentImageSrc(url);
                    if (attribution !== undefined) actions.setImageAttribution?.(attribution);
                },
                scale: state.imageScale,
                onScaleChange: actions.setImageScale,
            }),
        },
        share: {
            component: GenericShareSection,
            propsFactory: (state, actions: DreizeilenActions, shareProps) => {
                // Extract text from Dreizeilen canvas state
                const canvasText = `${state.line1}\n${state.line2}\n${state.line3}`.trim();

                console.log('[dreizeilen.config] share propsFactory called with:', {
                    shareProps: shareProps ? 'exists' : 'null',
                    onCaptureCanvas: shareProps?.onCaptureCanvas ? typeof shareProps.onCaptureCanvas : 'missing',
                });

                const props = {
                    exportedImage: shareProps?.exportedImage || null,
                    autoSaveStatus: shareProps?.autoSaveStatus || 'idle',
                    shareToken: shareProps?.shareToken || null,
                    onCaptureCanvas: shareProps?.onCaptureCanvas || (() => {
                        console.error('[dreizeilen.config] onCaptureCanvas fallback called - shareProps missing!');
                    }),
                    onDownload: shareProps?.onDownload || (() => {}),
                    onNavigateToGallery: shareProps?.onNavigateToGallery || (() => {}),
                    canvasText,
                    canvasType: 'dreizeilen',
                };

                console.log('[dreizeilen.config] returning props:', {
                    ...props,
                    onCaptureCanvas: typeof props.onCaptureCanvas,
                });

                return props;
            },
        }
    },
    getDisabledTabs: (state) => {
        // We need to know if alternatives are empty. 
        // Since that comes from props, we might need to inject it.
        return [];
    }
};
