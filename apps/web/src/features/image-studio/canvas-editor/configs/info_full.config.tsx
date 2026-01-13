/**
 * Info Full Canvas Configuration
 * Info sharepic with header, arrow, and body text
 */

import type { FullCanvasConfig, LayoutResult, AdditionalText } from './types';
import { TextSection, BackgroundSection, AssetsSection, AlternativesSection } from '../sidebar/sections';
import type { BalkenMode, BalkenInstance } from '../primitives';
import { PiTextT, PiTextAa, PiSquaresFourFill } from 'react-icons/pi';
import { HiSparkles, HiPhotograph } from 'react-icons/hi';
import { ALL_ASSETS, CANVAS_RECOMMENDED_ASSETS } from '../utils/canvasAssets';
import { INFO_CONFIG, calculateInfoLayout } from '../utils/infoLayout';
import type { BackgroundColorOption } from '../sidebar/types';
import { ShapeInstance, ShapeType, createShape } from '../utils/shapes';
import type { IllustrationInstance } from '../utils/illustrations/types';
import { createIllustration } from '../utils/illustrations/registry';
import { injectFeatureProps } from './featureInjector';

// ============================================================================
// CONSTANTS
// ============================================================================

const BACKGROUND_COLORS: BackgroundColorOption[] = [
    { id: 'tanne', label: 'Tanne', color: '#005538' },
    { id: 'sand', label: 'Sand', color: '#F5F1E9' },
];

const TEXT_COLORS: Record<string, string> = {
    '#005538': '#ffffff',
    '#F5F1E9': '#005538',
};

const BACKGROUND_IMAGES: Record<string, string> = {
    '#005538': '/Info_bg_tanne.png',
    '#F5F1E9': '/Info_bg_sand.png',
};

// ============================================================================
// STATE TYPE
// ============================================================================

export interface InfoFullState {
    header: string;
    body: string;
    backgroundColor: string;
    customHeaderFontSize: number | null;
    customBodyFontSize: number | null;
    sunflowerOpacity?: number;
    sunflowerColor?: string;
    arrowOpacity?: number;
    arrowColor?: string;
    headerOpacity?: number;
    bodyOpacity?: number;
    headerColor?: string;
    bodyColor?: string;
    assetVisibility: Record<string, boolean>;
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
}

// ============================================================================
// ACTIONS TYPE
// ============================================================================

export interface InfoFullActions {
    setHeader: (val: string) => void;
    setBody: (val: string) => void;
    handleHeaderFontSizeChange: (size: number) => void;
    handleBodyFontSizeChange: (size: number) => void;
    setBackgroundColor: (color: string) => void;
    handleAssetToggle: (id: string, visible: boolean) => void;
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
}

// ============================================================================
// LAYOUT CALCULATOR
// ============================================================================

const calculateLayout = (state: InfoFullState): LayoutResult => {
    const headerFontSize = state.customHeaderFontSize ?? INFO_CONFIG.header.fontSize;
    const bodyFontSize = state.customBodyFontSize ?? INFO_CONFIG.body.fontSize;
    const layout = calculateInfoLayout(headerFontSize, bodyFontSize);

    const fontColor = TEXT_COLORS[state.backgroundColor] ?? '#ffffff';
    const bgImage = BACKGROUND_IMAGES[state.backgroundColor] ?? '/Info_bg_tanne.png';

    // Estimate header height for arrow positioning
    const headerLineHeight = headerFontSize * INFO_CONFIG.header.lineHeightRatio;
    const estimatedHeaderLines = Math.ceil(state.header.length / 30);
    const headerHeight = estimatedHeaderLines * headerLineHeight;
    const arrowY = layout.header.y + headerHeight + INFO_CONFIG.header.bottomSpacing;
    const bodyY = arrowY;

    return {
        'header-text': {
            x: layout.header.x,
            y: layout.header.y,
            width: layout.header.maxWidth,
            fontSize: headerFontSize,
        },
        'arrow': {
            x: INFO_CONFIG.arrow.x,
            y: arrowY,
            width: INFO_CONFIG.arrow.size,
            height: INFO_CONFIG.arrow.size,
        },
        'body-text': {
            x: layout.body.x,
            y: layout.body.y,
            width: layout.body.maxWidth,
            fontSize: bodyFontSize,
        },
        _meta: {
            fontColor,
            bgImage,
        } as Record<string, unknown>,
    };
};

// ============================================================================
// FULL CONFIG
// ============================================================================

export const infoFullConfig: FullCanvasConfig<InfoFullState, InfoFullActions> = {
    id: 'info',

    canvas: {
        width: INFO_CONFIG.canvas.width,
        height: INFO_CONFIG.canvas.height,
    },

    tabs: [
        { id: 'text', icon: PiTextT, label: 'Text', ariaLabel: 'Text bearbeiten' },

        { id: 'background', icon: HiPhotograph, label: 'Farben', ariaLabel: 'Farben ändern' },
        { id: 'assets', icon: PiSquaresFourFill, label: 'Elemente', ariaLabel: 'Grafiken verwalten' },
        { id: 'alternatives', icon: HiSparkles, label: 'Alternativen', ariaLabel: 'Alternative Texte' },
    ],

    getVisibleTabs: (state) => {
        if (state.isDesktop) {
            return ['text', 'background', 'assets', 'alternatives'];
        }
        return ['text', 'background', 'assets', 'alternatives'];
    },

    getDisabledTabs: (state) => {
        return state.alternatives.length === 0 ? ['alternatives'] : [];
    },

    sections: {
        text: {
            component: TextSection,
            propsFactory: (state, actions) => ({
                quote: state.header,
                name: state.body,
                onQuoteChange: actions.setHeader,
                onNameChange: actions.setBody,
                onAddHeader: actions.addHeader,
                onAddText: actions.addText,
                additionalTexts: state.additionalTexts || [],
                onUpdateAdditionalText: (id: string, text: string) => actions.updateAdditionalText(id, { text }),
                onRemoveAdditionalText: actions.removeAdditionalText,
                quoteFontSize: state.customHeaderFontSize ?? INFO_CONFIG.header.fontSize,
                nameFontSize: state.customBodyFontSize ?? INFO_CONFIG.body.fontSize,
                onQuoteFontSizeChange: actions.handleHeaderFontSizeChange,
                onNameFontSizeChange: actions.handleBodyFontSizeChange,
                onUpdateAdditionalTextFontSize: (id: string, size: number) => actions.updateAdditionalText(id, { fontSize: size }),
            }),
        },

        background: {
            component: BackgroundSection,
            propsFactory: (state, actions) => ({
                currentColor: state.backgroundColor,
                colors: BACKGROUND_COLORS,
                onColorChange: actions.setBackgroundColor,
            }),
        },
        assets: {
            component: AssetsSection,
            propsFactory: (state, actions, context) => ({
                assets: ALL_ASSETS.map(asset => ({
                    ...asset,
                    visible: state.assetVisibility[asset.id] ?? false,
                })),
                onAssetToggle: actions.handleAssetToggle,
                recommendedAssetIds: CANVAS_RECOMMENDED_ASSETS['info'],

                // Auto-inject all feature props (icons, shapes, illustrations, balken)
                ...injectFeatureProps(state, actions, context),
            }),
        },
        alternatives: {
            component: AlternativesSection,
            propsFactory: (state, actions) => ({
                alternatives: state.alternatives,
                currentQuote: state.header,
                onAlternativeSelect: actions.handleSelectAlternative,
            }),
        },
    },

    elements: [
        // Sunflower
        {
            id: 'sunflower',
            type: 'image',
            x: INFO_CONFIG.sunflower.x,
            y: INFO_CONFIG.sunflower.y,
            order: 1,
            width: INFO_CONFIG.sunflower.size,
            height: INFO_CONFIG.sunflower.size,
            src: INFO_CONFIG.sunflower.src,
            draggable: true,
            opacity: (state: InfoFullState) => state.sunflowerOpacity ?? 0.04,
            opacityStateKey: 'sunflowerOpacity',
            fill: (state: InfoFullState) => state.sunflowerColor ?? '#FFFFFF',
            fillStateKey: 'sunflowerColor',
        },
        // Header text
        {
            id: 'header-text',
            type: 'text',
            x: (s: InfoFullState, l: LayoutResult) => l['header-text']?.x ?? INFO_CONFIG.header.x,
            y: (s: InfoFullState, l: LayoutResult) => l['header-text']?.y ?? INFO_CONFIG.margin.headerStartY,
            order: 2,
            textKey: 'header',
            width: INFO_CONFIG.header.maxWidth,
            fontSize: (s: InfoFullState, l: LayoutResult) => l['header-text']?.fontSize ?? INFO_CONFIG.header.fontSize,
            fontFamily: `${INFO_CONFIG.header.fontFamily}, Arial, sans-serif`,
            fontStyle: INFO_CONFIG.header.fontStyle,
            fill: (state: InfoFullState, layout: LayoutResult) => state.headerColor ?? (layout._meta as Record<string, unknown>)?.fontColor,
            fillStateKey: 'headerColor',
            align: 'left',
            lineHeight: INFO_CONFIG.header.lineHeightRatio,
            wrap: 'word',
            editable: true,
            draggable: true,
            fontSizeStateKey: 'customHeaderFontSize',
            opacity: (state: InfoFullState) => state.headerOpacity ?? 1,
            opacityStateKey: 'headerOpacity',
        },
        // Arrow
        {
            id: 'arrow',
            type: 'image',
            x: (s: InfoFullState, l: LayoutResult) => l['arrow']?.x ?? INFO_CONFIG.arrow.x,
            y: (s: InfoFullState, l: LayoutResult) => l['arrow']?.y ?? 400,
            order: 3,
            width: INFO_CONFIG.arrow.size,
            height: INFO_CONFIG.arrow.size,
            src: INFO_CONFIG.arrow.src,
            draggable: true,
            opacity: (state: InfoFullState) => state.arrowOpacity ?? 1,
            opacityStateKey: 'arrowOpacity',
            fill: (state: InfoFullState) => state.arrowColor ?? '#FFFFFF',
            fillStateKey: 'arrowColor',
        },
        // Body text
        {
            id: 'body-text',
            type: 'text',
            x: (s: InfoFullState, l: LayoutResult) => l['body-text']?.x ?? INFO_CONFIG.body.leftMargin,
            y: (s: InfoFullState, l: LayoutResult) => l['body-text']?.y ?? 400,
            order: 4,
            textKey: 'body',
            width: INFO_CONFIG.body.maxWidth,
            fontSize: (s: InfoFullState, l: LayoutResult) => l['body-text']?.fontSize ?? INFO_CONFIG.body.fontSize,
            fontFamily: `${INFO_CONFIG.body.remainingFont}, Arial, sans-serif`,
            fill: (state: InfoFullState, layout: LayoutResult) => state.bodyColor ?? (layout._meta as Record<string, unknown>)?.fontColor,
            fillStateKey: 'bodyColor',
            align: 'left',
            lineHeight: INFO_CONFIG.body.lineHeightRatio,
            wrap: 'word',
            editable: true,
            draggable: true,
            fontSizeStateKey: 'customBodyFontSize',
            opacity: (state: InfoFullState) => state.bodyOpacity ?? 1,
            opacityStateKey: 'bodyOpacity',
        },
    ],

    calculateLayout,

    createInitialState: (props: Record<string, unknown>) => ({
        header: (props.header as string | undefined) ?? '',
        body: (props.body as string | undefined) ?? '',
        backgroundColor: '#005538',
        customHeaderFontSize: null,
        customBodyFontSize: null,
        sunflowerOpacity: 0.04,
        sunflowerColor: '#FFFFFF',
        arrowOpacity: 1,
        arrowColor: '#FFFFFF',
        headerOpacity: 1,
        bodyOpacity: 1,
        assetVisibility: {},
        isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
        alternatives: (props.alternatives as Array<Record<string, unknown>> | undefined)?.map((a: Record<string, unknown>) => String(a.header) || '') ?? [],
        // Balken initial state
        balkenInstances: [],
        selectedIcons: [],
        iconStates: {},
        shapeInstances: [],
        illustrationInstances: [],
        additionalTexts: [],
    }),

    createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => ({
        setHeader: (val: string) => {
            setState((prev) => ({ ...prev, header: val }));
            callbacks.onHeaderChange?.(val);
            debouncedSaveToHistory({ ...getState(), header: val });
        },
        setBody: (val: string) => {
            setState((prev) => ({ ...prev, body: val }));
            callbacks.onBodyChange?.(val);
            debouncedSaveToHistory({ ...getState(), body: val });
        },
        handleHeaderFontSizeChange: (size: number) => {
            setState((prev) => ({ ...prev, customHeaderFontSize: size }));
        },
        handleBodyFontSizeChange: (size: number) => {
            setState((prev) => ({ ...prev, customBodyFontSize: size }));
        },
        setBackgroundColor: (color: string) => {
            setState((prev) => ({ ...prev, backgroundColor: color }));
            saveToHistory({ ...getState(), backgroundColor: color });
        },
        handleAssetToggle: (id: string, visible: boolean) => {
            setState((prev) => ({
                ...prev,
                assetVisibility: { ...prev.assetVisibility, [id]: visible },
            }));
        },
        handleSelectAlternative: (alt: string) => {
            setState((prev) => ({ ...prev, header: alt }));
            callbacks.onHeaderChange?.(alt);
            saveToHistory({ ...getState(), header: alt });
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
                                    x: INFO_CONFIG.canvas.width / 2,
                                    y: INFO_CONFIG.canvas.height / 2,
                                    scale: 1,
                                    rotation: 0,
                                    color: '#005538'
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
            const x = INFO_CONFIG.canvas.width / 2;
            const y = INFO_CONFIG.canvas.height / 2;
            const newShape = createShape(type, x, y, '#316049');
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
                INFO_CONFIG.canvas.width,
                INFO_CONFIG.canvas.height
            );
            setState((prev) => ({
                ...prev,
                illustrationInstances: [...prev.illustrationInstances, newIllustration],
            }));
            saveToHistory({ ...getState(), illustrationInstances: [...getState().illustrationInstances, newIllustration] });
        },
        updateIllustration: (id, partial) => {
            setState((prev): InfoFullState => ({
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
                x: INFO_CONFIG.canvas.width / 2,
                y: INFO_CONFIG.canvas.height / 2,
                width: 400,
                fontSize: INFO_CONFIG.header.fontSize,
                fontFamily: `${INFO_CONFIG.header.fontFamily}, Arial, sans-serif`,
                fontStyle: INFO_CONFIG.header.fontStyle,
                fill: INFO_CONFIG.header.color || '#000000',
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
                x: INFO_CONFIG.canvas.width / 2,
                y: INFO_CONFIG.canvas.height / 2 + 100,
                width: 400,
                fontSize: INFO_CONFIG.body.fontSize,
                fontFamily: `${INFO_CONFIG.body.remainingFont}, Arial, sans-serif`,
                fontStyle: 'normal',
                fill: '#000000',
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
    }),

    assets: {
        backgroundImages: BACKGROUND_IMAGES,
        textColors: TEXT_COLORS,
    },
};
