/**
 * Simple Full Canvas Configuration
 * "Text auf Bild" - Headline + Subtext on background image
 */

import type { FullCanvasConfig, LayoutResult, AdditionalText } from './types';
import { TextSection, ImageBackgroundSection, AssetsSection } from '../sidebar/sections';
import type { BalkenMode, BalkenInstance } from '../primitives';
import { PiTextT, PiSquaresFourFill } from 'react-icons/pi';
import { HiPhotograph } from 'react-icons/hi';
import { CANVAS_RECOMMENDED_ASSETS, AssetInstance, createAssetInstance } from '../utils/canvasAssets';
import { SIMPLE_CONFIG, calculateSimpleLayout } from '../utils/simpleLayout';
import { ShapeInstance, ShapeType, createShape } from '../utils/shapes';
import type { IllustrationInstance } from '../utils/illustrations/types';
import { createIllustration } from '../utils/illustrations/registry';
import type { StockImageAttribution } from '../../services/imageSourceService';
import { injectFeatureProps } from './featureInjector';
import { shareTab, createShareSection } from './shareSection';
import { alternativesTab, createAlternativesSection, isAlternativesEmpty } from './alternativesSection';

// ============================================================================
// STATE TYPE
// ============================================================================

export interface SimpleFullState {
    headline: string;
    subtext: string;
    currentImageSrc: string;
    imageOffset: { x: number; y: number };
    imageScale: number;
    gradientOpacity: number;
    customHeadlineFontSize: number | null;
    customSubtextFontSize: number | null;
    headlineOpacity?: number;
    subtextOpacity?: number;
    headlineColor?: string;
    subtextColor?: string;
    assetInstances: AssetInstance[];
    isDesktop: boolean;
    alternatives: string[];
    // Balken state
    balkenInstances: BalkenInstance[];
    // Icon state
    selectedIcons: string[];
    iconStates: Record<string, { x: number, y: number, scale: number, rotation: number, color?: string, opacity?: number }>;
    // Shape state
    shapeInstances: ShapeInstance[];
    // Illustration state
    illustrationInstances: IllustrationInstance[];
    // Additional Texts
    additionalTexts: AdditionalText[];
    // Attribution
    imageAttribution?: StockImageAttribution | null;
}

// ============================================================================
// ACTIONS TYPE
// ============================================================================

export interface SimpleFullActions {
    setHeadline: (val: string) => void;
    setSubtext: (val: string) => void;
    handleHeadlineFontSizeChange: (size: number) => void;
    handleSubtextFontSizeChange: (size: number) => void;
    setImageScale: (scale: number) => void;
    addAsset: (assetId: string) => void;
    updateAsset: (id: string, partial: Partial<AssetInstance>) => void;
    removeAsset: (id: string) => void;
    handleSelectAlternative: (alt: string) => void;
    // Balken actions
    addBalken: (mode: BalkenMode) => void;
    updateBalken: (id: string, partial: Partial<BalkenInstance>) => void;
    removeBalken: (id: string) => void;
    setBalkenText: (id: string, index: number, text: string) => void;
    // Icon actions
    toggleIcon: (id: string, selected: boolean) => void;
    updateIcon: (id: string, partial: { x?: number; y?: number; scale?: number; rotation?: number, color?: string, opacity?: number }) => void;

    // Shape actions
    addShape: (type: ShapeType) => void;
    updateShape: (id: string, partial: Partial<ShapeInstance>) => void;
    removeShape: (id: string) => void;
    // Illustration actions
    addIllustration: (id: string) => void;
    updateIllustration: (id: string, partial: Partial<IllustrationInstance>) => void;
    removeIllustration: (id: string) => void;
    // Additional Text actions
    addHeader: () => void;
    addText: () => void;
    updateAdditionalText: (id: string, partial: Partial<AdditionalText>) => void;
    removeAdditionalText: (id: string) => void;
    // Attribution actions
    setImageAttribution?: (attribution: StockImageAttribution | null) => void;
}

// ============================================================================
// LAYOUT CALCULATOR
// ============================================================================

const calculateLayout = (state: SimpleFullState): LayoutResult => {
    const layout = calculateSimpleLayout(
        state.headline,
        state.subtext,
        state.customHeadlineFontSize ?? undefined,
        state.customSubtextFontSize ?? undefined
    );

    return {
        'headline-text': {
            x: SIMPLE_CONFIG.headline.x,
            y: layout.headlineY,
            width: SIMPLE_CONFIG.headline.maxWidth,
            fontSize: layout.headlineFontSize,
        },
        'subtext-text': {
            x: SIMPLE_CONFIG.subtext.x,
            y: layout.subtextY,
            width: SIMPLE_CONFIG.subtext.maxWidth,
            fontSize: layout.subtextFontSize,
        },
    };
};

// ============================================================================
// FULL CONFIG
// ============================================================================

export const simpleFullConfig: FullCanvasConfig<SimpleFullState, SimpleFullActions> = {
    id: 'simple',

    canvas: {
        width: SIMPLE_CONFIG.canvas.width,
        height: SIMPLE_CONFIG.canvas.height,
    },

    tabs: [
        { id: 'text', icon: PiTextT, label: 'Text', ariaLabel: 'Text bearbeiten' },
        { id: 'image', icon: HiPhotograph, label: 'Bild', ariaLabel: 'Bild anpassen' },
        { id: 'assets', icon: PiSquaresFourFill, label: 'Elemente', ariaLabel: 'Dekorative Elemente' },
        alternativesTab,
        shareTab,
    ],

    getVisibleTabs: () => ['text', 'image', 'assets', 'alternatives', 'share'],

    getDisabledTabs: (state) =>
        isAlternativesEmpty(state, s => s.alternatives) ? ['alternatives'] : [],

    sections: {
        text: {
            component: TextSection,
            propsFactory: (state, actions) => ({
                quote: state.headline,
                name: state.subtext,
                onQuoteChange: actions.setHeadline,
                onNameChange: actions.setSubtext,
                onAddHeader: actions.addHeader,
                onAddText: actions.addText,
                additionalTexts: state.additionalTexts || [],
                onUpdateAdditionalText: (id: string, text: string) => actions.updateAdditionalText(id, { text }),
                onRemoveAdditionalText: actions.removeAdditionalText,
                quoteFontSize: state.customHeadlineFontSize ?? SIMPLE_CONFIG.headline.fontSize,
                nameFontSize: state.customSubtextFontSize ?? SIMPLE_CONFIG.subtext.fontSize,
                onQuoteFontSizeChange: actions.handleHeadlineFontSizeChange,
                onNameFontSizeChange: actions.handleSubtextFontSizeChange,
                onUpdateAdditionalTextFontSize: (id: string, size: number) => actions.updateAdditionalText(id, { fontSize: size }),
            }),
        },

        image: {
            component: ImageBackgroundSection,
            propsFactory: (state, actions) => ({
                currentImageSrc: state.currentImageSrc,
                onImageChange: (_: File | null, url?: string, attribution?: StockImageAttribution | null) => {
                    // Note: setCurrentImageSrc is handled by GenericCanvas file upload logic
                    // Only handle attribution here
                    if (attribution !== undefined) actions.setImageAttribution?.(attribution);
                },
                scale: state.imageScale,
                onScaleChange: actions.setImageScale,
            }),
        },
        assets: {
            component: AssetsSection,
            propsFactory: (state, actions, context) => ({
                // Asset instance props
                onAddAsset: actions.addAsset,
                recommendedAssetIds: CANVAS_RECOMMENDED_ASSETS['simple'],

                // Auto-inject all feature props (icons, shapes, illustrations, balken)
                ...injectFeatureProps(state, actions, context),
            }),
        },
        alternatives: createAlternativesSection<SimpleFullState, SimpleFullActions>({
            type: 'string',
            getAlternatives: (s) => s.alternatives,
            getCurrentValue: (s) => s.headline,
            getSelectAction: (a) => a.handleSelectAlternative,
        }),
        share: createShareSection<SimpleFullState>('simple', (state) =>
            `${state.headline}\n${state.subtext}`.trim()
        ),
    },

    assets: {
        backgroundImages: {},
        textColors: {},
    },
    elements: [
        // Background image
        {
            id: 'background-image',
            type: 'image',
            x: 0,
            y: 0,
            order: 0,
            width: SIMPLE_CONFIG.canvas.width,
            height: SIMPLE_CONFIG.canvas.height,
            srcKey: 'currentImageSrc',
            offsetKey: 'imageOffset',
            scaleKey: 'imageScale',
            draggable: true,
            transformable: true,
        },
        // Gradient overlay (using rect with opacity)
        {
            id: 'gradient-overlay',
            type: 'rect',
            x: 0,
            y: 0,
            order: 1,
            width: SIMPLE_CONFIG.canvas.width,
            height: SIMPLE_CONFIG.canvas.height,
            fill: 'rgba(0,0,0,0.3)',
            listening: false,
        },
        {
            id: 'headline-text',
            type: 'text',
            x: (_s: SimpleFullState, l: LayoutResult) => {
                const elem = l['headline-text'] as { x?: number; y?: number; fontSize?: number } | undefined;
                return elem?.x ?? SIMPLE_CONFIG.headline.x;
            },
            y: (_s: SimpleFullState, l: LayoutResult) => {
                const elem = l['headline-text'] as { x?: number; y?: number; fontSize?: number } | undefined;
                return elem?.y ?? SIMPLE_CONFIG.headline.y;
            },
            order: 2,
            textKey: 'headline',
            width: SIMPLE_CONFIG.headline.maxWidth,
            fontSize: (_s: SimpleFullState, l: LayoutResult) => {
                const elem = l['headline-text'] as { x?: number; y?: number; fontSize?: number } | undefined;
                return elem?.fontSize ?? SIMPLE_CONFIG.headline.fontSize;
            },
            fontFamily: `${SIMPLE_CONFIG.headline.fontFamily}, Arial, sans-serif`,
            fontStyle: SIMPLE_CONFIG.headline.fontStyle,
            align: 'left',
            lineHeight: SIMPLE_CONFIG.headline.lineHeightRatio,
            wrap: 'word',
            editable: true,
            draggable: true,
            fontSizeStateKey: 'customHeadlineFontSize',
            opacity: (state: SimpleFullState) => state.headlineOpacity ?? 1,
            opacityStateKey: 'headlineOpacity',
            fill: (state: SimpleFullState, _layout: LayoutResult) => state.headlineColor ?? SIMPLE_CONFIG.headline.color,
            fillStateKey: 'headlineColor',
        },
        {
            id: 'subtext-text',
            type: 'text',
            x: (_s: SimpleFullState, l: LayoutResult) => {
                const elem = l['subtext-text'] as { x?: number; y?: number; fontSize?: number } | undefined;
                return elem?.x ?? SIMPLE_CONFIG.subtext.x;
            },
            y: (_s: SimpleFullState, l: LayoutResult) => {
                const elem = l['subtext-text'] as { x?: number; y?: number; fontSize?: number } | undefined;
                return elem?.y ?? 200;
            },
            order: 3,
            textKey: 'subtext',
            width: SIMPLE_CONFIG.subtext.maxWidth,
            fontSize: (_s: SimpleFullState, l: LayoutResult) => {
                const elem = l['subtext-text'] as { x?: number; y?: number; fontSize?: number } | undefined;
                return elem?.fontSize ?? SIMPLE_CONFIG.subtext.fontSize;
            },
            fontFamily: `${SIMPLE_CONFIG.subtext.fontFamily}, Arial, sans-serif`,
            fontStyle: SIMPLE_CONFIG.subtext.fontStyle,
            align: 'left',
            lineHeight: SIMPLE_CONFIG.subtext.lineHeightRatio,
            wrap: 'word',
            editable: true,
            draggable: true,
            fontSizeStateKey: 'customSubtextFontSize',
            opacity: (state: SimpleFullState) => state.subtextOpacity ?? 1,
            opacityStateKey: 'subtextOpacity',
            fill: (state: SimpleFullState, _layout: LayoutResult) => state.subtextColor ?? SIMPLE_CONFIG.subtext.color,
            fillStateKey: 'subtextColor',
        },
    ],

    calculateLayout,

    createInitialState: (props: Record<string, unknown>) => ({
        headline: (props.headline as string | undefined) ?? '',
        subtext: (props.subtext as string | undefined) ?? '',
        currentImageSrc: (props.imageSrc as string | undefined) ?? '',
        imageOffset: { x: 0, y: 0 },
        imageScale: 1,
        gradientOpacity: 0.3,
        customHeadlineFontSize: null,
        customSubtextFontSize: null,
        headlineOpacity: 1,
        subtextOpacity: 1,
        assetInstances: [],
        isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
        alternatives: (props.alternatives as string[] | undefined) ?? [],
        // Balken initial state
        balkenInstances: [],
        selectedIcons: [],

        iconStates: {},
        shapeInstances: [],
        selectedShapeId: null,
        illustrationInstances: [],
        additionalTexts: [],
        imageAttribution: null,
    }),

    createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => ({
        setHeadline: (val: string) => {
            setState((prev) => ({ ...prev, headline: val }));
            callbacks.onHeadlineChange?.(val);
            debouncedSaveToHistory({ ...getState(), headline: val });
        },
        setSubtext: (val: string) => {
            setState((prev) => ({ ...prev, subtext: val }));
            callbacks.onSubtextChange?.(val);
            debouncedSaveToHistory({ ...getState(), subtext: val });
        },
        handleHeadlineFontSizeChange: (size: number) => {
            setState((prev) => ({ ...prev, customHeadlineFontSize: size }));
        },
        handleSubtextFontSizeChange: (size: number) => {
            setState((prev) => ({ ...prev, customSubtextFontSize: size }));
        },
        setImageScale: (scale: number) => {
            setState((prev) => ({ ...prev, imageScale: scale }));
            debouncedSaveToHistory({ ...getState(), imageScale: scale });
        },
        addAsset: (assetId: string) => {
            const newAsset = createAssetInstance(assetId, SIMPLE_CONFIG.canvas.width, SIMPLE_CONFIG.canvas.height);
            setState((prev) => ({
                ...prev,
                assetInstances: [...prev.assetInstances, newAsset],
            }));
            saveToHistory({ ...getState(), assetInstances: [...getState().assetInstances, newAsset] });
        },
        updateAsset: (id: string, partial: Partial<AssetInstance>) => {
            setState((prev) => ({
                ...prev,
                assetInstances: prev.assetInstances.map(a =>
                    a.id === id ? { ...a, ...partial } : a
                ),
            }));
            debouncedSaveToHistory({ ...getState() });
        },
        removeAsset: (id: string) => {
            setState((prev) => ({
                ...prev,
                assetInstances: prev.assetInstances.filter(a => a.id !== id),
            }));
            saveToHistory({ ...getState() });
        },
        handleSelectAlternative: (alt: string) => {
            setState((prev) => ({ ...prev, headline: alt }));
            callbacks.onHeadlineChange?.(alt);
            saveToHistory({ ...getState(), headline: alt });
        },
        // Balken actions
        addBalken: (mode: BalkenMode) => {
            const id = `balken-${Date.now()}`;
            const newBalken: BalkenInstance = {
                id,
                mode,
                colorSchemeId: 'tanne-sand',
                widthScale: 1,
                offset: { x: 0, y: 0 },
                scale: 1,
                texts: [],
                rotation: 0,
            };
            setState((prev) => ({
                ...prev,
                balkenInstances: [...prev.balkenInstances, newBalken],
            }));
            saveToHistory({ ...getState(), balkenInstances: [...getState().balkenInstances, newBalken] });
        },
        updateBalken: (id: string, partial: Partial<BalkenInstance>) => {
            setState((prev) => ({
                ...prev,
                balkenInstances: prev.balkenInstances.map((b) =>
                    b.id === id ? { ...b, ...partial } : b
                ),
            }));
            // Use debounced save for rapid updates (drag/scale), regular for others?
            // Since we don't distinguish here, use debounced for safety on drag.
            // But mode/color changes should be instant?
            // Let's use debounced for general updates.
            debouncedSaveToHistory({ ...getState() });
        },
        removeBalken: (id: string) => {
            setState((prev) => ({
                ...prev,
                balkenInstances: prev.balkenInstances.filter((b) => b.id !== id),
            }));
            saveToHistory({ ...getState() });
        },
        setBalkenText: (id: string, index: number, text: string) => {
            setState((prev) => ({
                ...prev,
                balkenInstances: prev.balkenInstances.map((b) => {
                    if (b.id !== id) return b;
                    const newTexts = [...b.texts];
                    newTexts[index] = text;
                    return { ...b, texts: newTexts };
                }),
            }));
            debouncedSaveToHistory({ ...getState() });
        },
        // Icon actions
        // Icon actions
        toggleIcon: (id: string, selected: boolean) => {
            setState((prev) => {
                const current = new Set(prev.selectedIcons);
                if (selected) {
                    current.add(id);
                    // Initialize position if not exists
                    if (!prev.iconStates[id]) {
                        return {
                            ...prev,
                            selectedIcons: Array.from(current),
                            iconStates: {
                                ...prev.iconStates,
                                [id]: {
                                    x: SIMPLE_CONFIG.canvas.width / 2,
                                    y: SIMPLE_CONFIG.canvas.height / 2,
                                    scale: 1,
                                    rotation: 0,
                                    color: '#005538' // Default to Tanne
                                }
                            }
                        };
                    }
                } else {
                    current.delete(id);
                }
                return { ...prev, selectedIcons: Array.from(current) };
            });
            saveToHistory({ ...getState() });
        },
        updateIcon: (id: string, partial) => {
            setState((prev) => ({
                ...prev,
                iconStates: {
                    ...prev.iconStates,
                    [id]: { ...prev.iconStates[id], ...partial }
                }
            }));
            debouncedSaveToHistory({ ...getState() });
        },

        // Shape actions
        addShape: (type: ShapeType) => {
            const x = SIMPLE_CONFIG.canvas.width / 2;
            const y = SIMPLE_CONFIG.canvas.height / 2;
            const newShape = createShape(type, x, y, '#316049'); // Default to primary green
            setState((prev) => ({
                ...prev,
                shapeInstances: [...prev.shapeInstances, newShape],
            }));
            saveToHistory({ ...getState(), shapeInstances: [...getState().shapeInstances, newShape] });
        },
        updateShape: (id, partial) => {
            setState((prev) => ({
                ...prev,
                shapeInstances: prev.shapeInstances.map(s =>
                    s.id === id ? { ...s, ...partial } : s
                ),
            }));
            debouncedSaveToHistory({ ...getState() });
        },
        removeShape: (id) => {
            setState((prev) => ({
                ...prev,
                shapeInstances: prev.shapeInstances.filter(s => s.id !== id),
            }));
            saveToHistory({ ...getState() });
        },

        // Illustration actions
        addIllustration: async (id: string) => {
            const newIllustration = await createIllustration(
                id,
                SIMPLE_CONFIG.canvas.width,
                SIMPLE_CONFIG.canvas.height
            );
            setState((prev) => ({
                ...prev,
                illustrationInstances: [...prev.illustrationInstances, newIllustration],
            }));
            saveToHistory({ ...getState(), illustrationInstances: [...getState().illustrationInstances, newIllustration] });
        },
        updateIllustration: (id, partial) => {
            setState((prev): SimpleFullState => ({
                ...prev,
                illustrationInstances: prev.illustrationInstances.map((i): IllustrationInstance =>
                    i.id === id ? { ...i, ...partial } as IllustrationInstance : i
                ),
            }));
            debouncedSaveToHistory({ ...getState() });
        },
        removeIllustration: (id) => {
            setState((prev) => ({
                ...prev,
                illustrationInstances: prev.illustrationInstances.filter(i => i.id !== id),
            }));
            saveToHistory({ ...getState() });
        },

        // Additional Text actions
        addHeader: () => {
            const id = `text-${Date.now()}`;
            const newText: AdditionalText = {
                id,
                text: 'Neue Überschrift',
                type: 'header',
                x: SIMPLE_CONFIG.canvas.width / 2 - 200,
                y: SIMPLE_CONFIG.canvas.height / 2,
                width: 400,
                fontSize: SIMPLE_CONFIG.headline.fontSize,
                fontFamily: `${SIMPLE_CONFIG.headline.fontFamily}, Arial, sans-serif`,
                fontStyle: 'bold',
                fill: SIMPLE_CONFIG.headline.color,
                rotation: 0,
                scale: 1
            };
            setState((prev) => ({
                ...prev,
                additionalTexts: [...(prev.additionalTexts || []), newText],
            }));
            saveToHistory({ ...getState(), additionalTexts: [...(getState().additionalTexts || []), newText] });
        },
        addText: () => {
            const id = `text-${Date.now()}`;
            const newText: AdditionalText = {
                id,
                text: 'Neuer Text',
                type: 'body',
                x: SIMPLE_CONFIG.canvas.width / 2 - 200,
                y: SIMPLE_CONFIG.canvas.height / 2 + 100,
                width: 400,
                fontSize: SIMPLE_CONFIG.subtext.fontSize,
                fontFamily: `${SIMPLE_CONFIG.subtext.fontFamily}, Arial, sans-serif`,
                fontStyle: 'normal',
                fill: SIMPLE_CONFIG.subtext.color,
                rotation: 0,
                scale: 1
            };
            setState((prev) => ({
                ...prev,
                additionalTexts: [...(prev.additionalTexts || []), newText],
            }));
            saveToHistory({ ...getState(), additionalTexts: [...(getState().additionalTexts || []), newText] });
        },
        updateAdditionalText: (id, partial) => {
            setState((prev) => ({
                ...prev,
                additionalTexts: (prev.additionalTexts || []).map(t =>
                    t.id === id ? { ...t, ...partial } : t
                ),
            }));
            debouncedSaveToHistory({ ...getState() });
        },
        removeAdditionalText: (id) => {
            setState((prev) => ({
                ...prev,
                additionalTexts: (prev.additionalTexts || []).filter(t => t.id !== id),
            }));
            saveToHistory({ ...getState() });
        },
        setImageAttribution: (attribution: StockImageAttribution | null) => {
            setState((prev) => ({ ...prev, imageAttribution: attribution }));
            debouncedSaveToHistory({ ...getState(), imageAttribution: attribution });
        },
    }),
};
