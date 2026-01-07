/**
 * Zitat Full Canvas Configuration
 * Quote sharepic with background image and gradient overlay
 */

import type { FullCanvasConfig, LayoutResult, AdditionalText } from './types';
import { TextSection, ImageBackgroundSection, AssetsSection } from '../sidebar/sections';
import { PiTextT, PiTextAa, PiSquaresFourFill } from 'react-icons/pi';
import { HiPhotograph, HiSparkles } from 'react-icons/hi';
import { ALL_ASSETS, CANVAS_RECOMMENDED_ASSETS } from '../utils/canvasAssets';
import { ZITAT_CONFIG, calculateZitatLayout } from '../utils/zitatLayout';
import type { IconType } from '../utils/canvasIcons';
import type { ShapeInstance, ShapeType } from '../utils/shapes';
import { createShape } from '../utils/shapes';

// ============================================================================
// STATE TYPE
// ============================================================================

export interface ZitatFullState {
    quote: string;
    name: string;
    currentImageSrc: string;
    imageOffset: { x: number; y: number };
    imageScale: number;
    gradientOpacity: number;
    isBackgroundLocked: boolean;
    customQuoteFontSize: number | null;
    customNameFontSize: number | null;
    assetVisibility: Record<string, boolean>;
    quoteOpacity?: number;
    nameOpacity?: number;
    quoteColor?: string;
    nameColor?: string;
    isDesktop: boolean;
    alternatives: string[];
    // Icons & Shapes
    selectedIcons: string[];
    iconStates: Record<string, { x: number; y: number; scale: number; rotation: number; color?: string; opacity?: number }>;
    shapeInstances: ShapeInstance[];
    selectedShapeId: string | null;
    additionalTexts: AdditionalText[];
}

// ============================================================================
// ACTIONS TYPE
// ============================================================================

export interface ZitatFullActions {
    setQuote: (val: string) => void;
    setName: (val: string) => void;
    handleQuoteFontSizeChange: (size: number) => void;
    handleNameFontSizeChange: (size: number) => void;
    setImageScale: (scale: number) => void;
    setGradientOpacity: (opacity: number) => void;
    toggleBackgroundLock: () => void;
    handleAssetToggle: (id: string, visible: boolean) => void;
    handleSelectAlternative: (alt: string) => void;
    // Icons & Shapes
    toggleIcon: (id: string, selected: boolean) => void;
    updateIcon: (id: string, partial: Partial<{ x: number; y: number; scale: number; rotation: number; color?: string; opacity?: number }>) => void;
    addShape: (type: ShapeType) => void;
    updateShape: (id: string, partial: Partial<ShapeInstance>) => void;
    removeShape: (id: string) => void;
    // Additional Text actions
    addHeader: () => void;
    addText: () => void;
    updateAdditionalText: (id: string, partial: Partial<AdditionalText>) => void;
    removeAdditionalText: (id: string) => void;
}

// ============================================================================
// LAYOUT CALCULATOR
// ============================================================================

const calculateLayout = (state: ZitatFullState): LayoutResult => {
    const fontSize = state.customQuoteFontSize ?? ZITAT_CONFIG.quote.fontSize;
    const layout = calculateZitatLayout(state.quote, fontSize);

    return {
        'quote-mark': {
            x: ZITAT_CONFIG.quotationMark.x,
            y: layout.quoteMarkY,
            width: layout.quoteMarkSize,
            height: layout.quoteMarkSize,
        },
        'quote-text': {
            x: ZITAT_CONFIG.quote.x,
            y: layout.quoteY,
            width: ZITAT_CONFIG.quote.maxWidth,
            fontSize: layout.quoteFontSize,
            lineHeight: layout.lineHeight,
        },
        'name-text': {
            x: ZITAT_CONFIG.author.x,
            y: layout.authorY,
            width: ZITAT_CONFIG.quote.maxWidth,
            fontSize: state.customNameFontSize ?? layout.authorFontSize,
        },
    };
};

// ============================================================================
// FULL CONFIG
// ============================================================================

export const zitatFullConfig: FullCanvasConfig<ZitatFullState, ZitatFullActions> = {
    id: 'zitat',

    canvas: {
        width: ZITAT_CONFIG.canvas.width,
        height: ZITAT_CONFIG.canvas.height,
    },

    features: {
        icons: true,
        shapes: true,
    },

    tabs: [
        { id: 'text', icon: PiTextT, label: 'Text', ariaLabel: 'Text bearbeiten' },

        { id: 'image', icon: HiPhotograph, label: 'Bild', ariaLabel: 'Bild anpassen' },
        { id: 'assets', icon: PiSquaresFourFill, label: 'Elemente', ariaLabel: 'Dekorative Elemente' },
    ],

    getVisibleTabs: (state) => {
        if (state.isDesktop) {
            return ['text', 'image', 'assets'];
        }
        return ['text', 'image', 'assets'];
    },

    getDisabledTabs: (state) => {
        return [];
    },

    sections: {
        text: {
            component: TextSection,
            propsFactory: (state, actions) => {
                const layout = calculateLayout(state);
                return {
                    quote: state.quote,
                    name: state.name,
                    onQuoteChange: actions.setQuote,
                    onNameChange: actions.setName,
                    onAddHeader: actions.addHeader,
                    onAddText: actions.addText,
                    additionalTexts: state.additionalTexts || [],
                    onUpdateAdditionalText: (id: string, text: string) => actions.updateAdditionalText(id, { text }),
                    onRemoveAdditionalText: actions.removeAdditionalText,
                    quoteFontSize: layout['quote-text']?.fontSize ?? ZITAT_CONFIG.quote.fontSize,
                    nameFontSize: layout['name-text']?.fontSize ?? 40,
                    onQuoteFontSizeChange: actions.handleQuoteFontSizeChange,
                    onNameFontSizeChange: actions.handleNameFontSizeChange,
                    onUpdateAdditionalTextFontSize: (id: string, size: number) => actions.updateAdditionalText(id, { fontSize: size }),
                    alternatives: state.alternatives,
                    onAlternativeSelect: actions.handleSelectAlternative,
                };
            },
        },

        image: {
            component: ImageBackgroundSection,
            propsFactory: (state, actions) => ({
                currentImageSrc: state.currentImageSrc,
                onImageChange: () => { },
                scale: state.imageScale,
                onScaleChange: actions.setImageScale,
                gradientOpacity: state.gradientOpacity,
                onGradientOpacityChange: actions.setGradientOpacity,
                isLocked: state.isBackgroundLocked,
                onToggleLock: actions.toggleBackgroundLock,
            }),
        },
        assets: {
            component: AssetsSection,
            propsFactory: (state, actions) => ({
                assets: ALL_ASSETS.map(asset => ({
                    ...asset,
                    visible: state.assetVisibility[asset.id] ?? false,
                })),
                onAssetToggle: actions.handleAssetToggle,
                recommendedAssetIds: CANVAS_RECOMMENDED_ASSETS['zitat'],
                selectedIcons: state.selectedIcons,
                onIconToggle: actions.toggleIcon,
                onAddShape: actions.addShape,
            }),
        },

    },

    elements: [
        // Background image
        {
            id: 'background-image',
            type: 'image',
            x: 0,
            y: 0,
            order: 0,
            width: ZITAT_CONFIG.canvas.width,
            height: ZITAT_CONFIG.canvas.height,
            srcKey: 'currentImageSrc',
            offsetKey: 'imageOffset',
            scaleKey: 'imageScale',
            lockedKey: 'isBackgroundLocked',
            draggable: true,
            transformable: true,
        },
        // Gradient overlay
        {
            id: 'gradient-overlay',
            type: 'rect',
            x: 0,
            y: 0,
            order: 1,
            width: ZITAT_CONFIG.canvas.width,
            height: ZITAT_CONFIG.canvas.height,
            fill: (state: ZitatFullState) => `rgba(0,0,0,${state.gradientOpacity})`,
            listening: false,
        },
        // Quote mark
        {
            id: 'quote-mark',
            type: 'image',
            x: (s: any, l: LayoutResult) => l['quote-mark']?.x ?? ZITAT_CONFIG.quotationMark.x,
            y: (s: any, l: LayoutResult) => l['quote-mark']?.y ?? ZITAT_CONFIG.quotationMark.y,
            order: 2,
            width: (s: any, l: LayoutResult) => l['quote-mark']?.width ?? 100,
            height: (s: any, l: LayoutResult) => l['quote-mark']?.height ?? 100,
            src: ZITAT_CONFIG.quotationMark.src,
            listening: false,
        },
        // Quote text
        {
            id: 'quote-text',
            type: 'text',
            x: (s: any, l: LayoutResult) => l['quote-text']?.x ?? ZITAT_CONFIG.quote.x,
            y: (s: any, l: LayoutResult) => l['quote-text']?.y ?? 800,
            order: 3,
            textKey: 'quote',
            width: ZITAT_CONFIG.quote.maxWidth,
            fontSize: (s: any, l: LayoutResult) => l['quote-text']?.fontSize ?? ZITAT_CONFIG.quote.fontSize,
            fontFamily: `${ZITAT_CONFIG.quote.fontFamily}, Arial, sans-serif`,
            fontStyle: ZITAT_CONFIG.quote.fontStyle,
            align: 'left',
            lineHeight: ZITAT_CONFIG.quote.lineHeightRatio,
            wrap: 'word',
            editable: true,
            draggable: true,
            fontSizeStateKey: 'customQuoteFontSize',
            opacity: (state: any) => state.quoteOpacity ?? 1,
            opacityStateKey: 'quoteOpacity',
            fill: (state: any, _layout: any) => state.quoteColor ?? ZITAT_CONFIG.quote.color,
            fillStateKey: 'quoteColor',
        },
        // Author name
        {
            id: 'name-text',
            type: 'text',
            x: (s: any, l: LayoutResult) => l['name-text']?.x ?? ZITAT_CONFIG.author.x,
            y: (s: any, l: LayoutResult) => l['name-text']?.y ?? 1000,
            order: 4,
            textKey: 'name',
            width: ZITAT_CONFIG.quote.maxWidth,
            fontSize: (s: any, l: LayoutResult) => l['name-text']?.fontSize ?? 40,
            fontFamily: `${ZITAT_CONFIG.author.fontFamily}, Arial, sans-serif`,
            fontStyle: ZITAT_CONFIG.author.fontStyle,
            align: 'left',
            editable: true,
            draggable: true,
            fontSizeStateKey: 'customNameFontSize',
            opacity: (state: any) => state.nameOpacity ?? 1,
            opacityStateKey: 'nameOpacity',
            fill: (state: any, _layout: any) => state.nameColor ?? ZITAT_CONFIG.author.color,
            fillStateKey: 'nameColor',
        },
    ],

    calculateLayout,

    createInitialState: (props) => ({
        quote: props.quote ?? '',
        name: props.name ?? '',
        currentImageSrc: props.imageSrc ?? '',
        imageOffset: { x: 0, y: 0 },
        imageScale: 1,
        gradientOpacity: ZITAT_CONFIG.gradient.bottomOpacity,
        isBackgroundLocked: true,
        customQuoteFontSize: null,
        customNameFontSize: null,
        assetVisibility: {},
        quoteOpacity: 1,
        nameOpacity: 1,
        isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
        alternatives: props.alternatives ?? [],
        selectedIcons: [],
        iconStates: {},
        shapeInstances: [],
        selectedShapeId: null,
        additionalTexts: [],
    }),

    createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => ({
        setQuote: (val: string) => {
            setState((prev) => ({ ...prev, quote: val }));
            callbacks.onQuoteChange?.(val);
            debouncedSaveToHistory({ ...getState(), quote: val });
        },
        setName: (val: string) => {
            setState((prev) => ({ ...prev, name: val }));
            callbacks.onNameChange?.(val);
            debouncedSaveToHistory({ ...getState(), name: val });
        },
        handleQuoteFontSizeChange: (size: number) => {
            setState((prev) => ({ ...prev, customQuoteFontSize: size }));
        },
        handleNameFontSizeChange: (size: number) => {
            setState((prev) => ({ ...prev, customNameFontSize: size }));
        },
        setImageScale: (scale: number) => {
            setState((prev) => ({ ...prev, imageScale: scale }));
            debouncedSaveToHistory({ ...getState(), imageScale: scale });
        },
        setGradientOpacity: (opacity: number) => {
            setState((prev) => ({ ...prev, gradientOpacity: opacity }));
        },
        toggleBackgroundLock: () => {
            setState((prev) => ({ ...prev, isBackgroundLocked: !prev.isBackgroundLocked }));
        },
        handleAssetToggle: (id: string, visible: boolean) => {
            setState((prev) => ({
                ...prev,
                assetVisibility: { ...prev.assetVisibility, [id]: visible },
            }));
        },
        handleSelectAlternative: (alt: string) => {
            setState((prev) => ({ ...prev, quote: alt }));
            callbacks.onQuoteChange?.(alt);
            saveToHistory({ ...getState(), quote: alt });
        },
        toggleIcon: (id: string, selected: boolean) => {
            setState((prev) => {
                const current = new Set(prev.selectedIcons);
                if (selected) {
                    current.add(id);
                    // Initialize position/color if not exists
                    if (!prev.iconStates[id]) {
                        return {
                            ...prev,
                            selectedIcons: Array.from(current),
                            iconStates: {
                                ...prev.iconStates,
                                [id]: {
                                    x: ZITAT_CONFIG.canvas.width / 2,
                                    y: ZITAT_CONFIG.canvas.height / 2,
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
        addShape: (type: ShapeType) => {
            const x = ZITAT_CONFIG.canvas.width / 2;
            const y = ZITAT_CONFIG.canvas.height / 2;
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
        // Additional Text actions
        addHeader: () => {
            const id = `text-${Date.now()}`;
            const newText: AdditionalText = {
                id,
                text: 'Neue Überschrift',
                type: 'header',
                x: ZITAT_CONFIG.canvas.width / 2,
                y: ZITAT_CONFIG.canvas.height / 2,
                width: 400,
                fontSize: ZITAT_CONFIG.quote.fontSize,
                fontFamily: `${ZITAT_CONFIG.quote.fontFamily}, Arial, sans-serif`,
                fontStyle: ZITAT_CONFIG.quote.fontStyle,
                fill: ZITAT_CONFIG.quote.color,
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
                x: ZITAT_CONFIG.canvas.width / 2,
                y: ZITAT_CONFIG.canvas.height / 2 + 100,
                width: 400,
                fontSize: 40,
                fontFamily: `${ZITAT_CONFIG.author.fontFamily}, Arial, sans-serif`,
                fontStyle: 'normal',
                fill: ZITAT_CONFIG.author.color,
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
};
