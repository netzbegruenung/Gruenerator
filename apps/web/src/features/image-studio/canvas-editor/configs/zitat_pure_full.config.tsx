/**
 * ZitatPure Full Canvas Configuration
 * Fully config-driven canvas for quote sharepics without background image
 */

import type { FullCanvasConfig, LayoutResult as GenericLayoutResult, AdditionalText } from './types';
import {
    TextSection,
    AssetsSection,
    BackgroundSection
} from '../sidebar/sections';
import { PiTextT, PiTextAa, PiSquaresFourFill } from 'react-icons/pi';
import { HiColorSwatch, HiSparkles, HiPhotograph } from 'react-icons/hi';
import { ALL_ASSETS, CANVAS_RECOMMENDED_ASSETS } from '../utils/canvasAssets';
import type { BackgroundColorOption } from '../sidebar/types';
import { ZITAT_PURE_CONFIG, calculateZitatPureLayout } from '../utils/zitatPureLayout';
import type { IconType } from '../utils/canvasIcons';
import type { ShapeInstance, ShapeType } from '../utils/shapes';
import { createShape } from '../utils/shapes';
import { IllustrationInstance, createIllustration } from '../utils/canvasIllustrations';

// ============================================================================
// CONSTANTS
// ============================================================================

const BACKGROUND_COLORS: BackgroundColorOption[] = [
    { id: 'green', label: 'Grün', color: '#6CCD87' },
    { id: 'sand', label: 'Sand', color: '#F5F1E9' },
];

const FONT_COLORS: Record<string, string> = {
    '#6CCD87': '#005437',
    '#F5F1E9': '#262626',
};

// ============================================================================
// STATE TYPE
// ============================================================================

export interface ZitatPureFullState {
    quote: string;
    name: string;
    backgroundColor: string;
    customQuoteFontSize: number | null;
    customNameFontSize: number | null;
    assetVisibility: Record<string, boolean>;
    sunflowerOpacity?: number;
    sunflowerColor?: string;
    quoteOpacity?: number;
    nameOpacity?: number;
    quoteColor?: string;
    nameColor?: string;
    alternatives: string[];
    isDesktop: boolean;
    // Icons & Shapes
    selectedIcons: string[];
    iconStates: Record<string, { x: number; y: number; scale: number; rotation: number; color?: string; opacity?: number }>;
    shapeInstances: ShapeInstance[];
    selectedShapeId: string | null;
    illustrationInstances: IllustrationInstance[];
    selectedIllustrationId: string | null;
    additionalTexts: AdditionalText[];
    quoteMarkOffset?: { x: number; y: number };
}

// ============================================================================
// ACTIONS TYPE
// ============================================================================

export interface ZitatPureFullActions {
    setQuote: (val: string) => void;
    setName: (val: string) => void;
    handleQuoteFontSizeChange: (size: number) => void;
    handleNameFontSizeChange: (size: number) => void;
    setBackgroundColor: (color: string) => void;
    handleAssetToggle: (id: string, visible: boolean) => void;
    setSunflowerOpacity: (val: number) => void;
    handleSelectAlternative: (alt: string) => void;
    // Icons & Shapes
    toggleIcon: (id: string, selected: boolean) => void;
    updateIcon: (id: string, partial: { x?: number; y?: number; scale?: number; rotation?: number, color?: string, opacity?: number }) => void;
    addShape: (type: ShapeType) => void;
    updateShape: (id: string, partial: Partial<ShapeInstance>) => void;
    removeShape: (id: string) => void;
    duplicateShape: (id: string) => void;
    // Illustration actions
    addIllustration: (id: string) => void;
    updateIllustration: (id: string, partial: Partial<IllustrationInstance>) => void;
    removeIllustration: (id: string) => void;
    duplicateIllustration: (id: string) => void;
    // Additional Text actions
    addHeader: () => void;
    addText: () => void;
    updateAdditionalText: (id: string, partial: Partial<AdditionalText>) => void;
    removeAdditionalText: (id: string) => void;
}

// ============================================================================
// LAYOUT CALCULATOR
// ============================================================================

const calculateLayout = (state: ZitatPureFullState): GenericLayoutResult => {
    const config = ZITAT_PURE_CONFIG;
    const layoutResult = calculateZitatPureLayout(state.quote);

    const fontColor = FONT_COLORS[state.backgroundColor] ?? FONT_COLORS['#6CCD87'];

    return {
        'quote-mark': {
            x: config.quotationMark.x,
            y: layoutResult.quoteMarkY,
            width: config.quotationMark.size,
            height: config.quotationMark.size,
        },
        'quote-text': {
            x: config.quote.x,
            y: layoutResult.quoteY,
            width: config.quote.maxWidth,
            fontSize: state.customQuoteFontSize ?? layoutResult.quoteFontSize,
        },
        'name-text': {
            x: config.author.x,
            y: layoutResult.authorY,
            width: config.quote.maxWidth,
            fontSize: state.customNameFontSize ?? layoutResult.authorFontSize,
        },
        'sunflower': {
            x: config.sunflower.x,
            y: config.sunflower.y,
            width: config.sunflower.size,
            height: config.sunflower.size,
        },
        _meta: {
            fontColor,
            quoteFontSize: layoutResult.quoteFontSize,
            authorFontSize: layoutResult.authorFontSize,
        } as any,
    };
};

// ============================================================================
// FULL CONFIG
// ============================================================================

export const zitatPureFullConfig: FullCanvasConfig<ZitatPureFullState, ZitatPureFullActions> = {
    id: 'zitat-pure',

    canvas: {
        width: ZITAT_PURE_CONFIG.canvas.width,
        height: ZITAT_PURE_CONFIG.canvas.height,
    },

    features: {
        icons: true,
        shapes: true,
    },

    tabs: [
        { id: 'text', icon: PiTextT, label: 'Text', ariaLabel: 'Text bearbeiten' },

        { id: 'background', icon: HiPhotograph, label: 'Hintergrund', ariaLabel: 'Hintergrundfarbe wählen' },
        { id: 'assets', icon: PiSquaresFourFill, label: 'Elemente', ariaLabel: 'Dekorative Elemente' },
    ],

    getVisibleTabs: (state) => {
        if (state.isDesktop) {
            return ['text', 'background', 'assets'];
        }
        return ['text', 'background', 'assets'];
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
                    quoteFontSize: state.customQuoteFontSize ?? (layout._meta as any)?.quoteFontSize ?? ZITAT_PURE_CONFIG.quote.fontSize,
                    nameFontSize: state.customNameFontSize ?? (layout._meta as any)?.authorFontSize ?? ZITAT_PURE_CONFIG.author.fontSize,
                    onQuoteFontSizeChange: actions.handleQuoteFontSizeChange,
                    onNameFontSizeChange: actions.handleNameFontSizeChange,
                    onUpdateAdditionalTextFontSize: (id: string, size: number) => actions.updateAdditionalText(id, { fontSize: size }),
                    alternatives: state.alternatives,
                    onAlternativeSelect: actions.handleSelectAlternative,
                };
            },
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
                recommendedAssetIds: CANVAS_RECOMMENDED_ASSETS['zitat-pure'],
                selectedIcons: state.selectedIcons,
                onIconToggle: actions.toggleIcon,
                onAddShape: actions.addShape,
                shapeInstances: state.shapeInstances,
                selectedShapeId: context?.selectedElement,
                onUpdateShape: actions.updateShape,
                onRemoveShape: actions.removeShape,
                // Illustrations
                illustrationInstances: state.illustrationInstances,
                selectedIllustrationId: context?.selectedElement,
                onAddIllustration: actions.addIllustration,
                onUpdateIllustration: actions.updateIllustration,
                onRemoveIllustration: actions.removeIllustration,
                onDuplicateIllustration: actions.duplicateIllustration,
                onDuplicateShape: actions.duplicateShape,
            }),
        },

    },

    elements: [
        // Background
        {
            id: 'background',
            type: 'background',
            x: 0,
            y: 0,
            order: 0,
            width: ZITAT_PURE_CONFIG.canvas.width,
            height: ZITAT_PURE_CONFIG.canvas.height,
            colorKey: 'backgroundColor',
        },
        // Sunflower decoration
        {
            id: 'sunflower',
            type: 'image',
            x: ZITAT_PURE_CONFIG.sunflower.x,
            y: ZITAT_PURE_CONFIG.sunflower.y,
            order: 1,
            width: ZITAT_PURE_CONFIG.sunflower.size,
            height: ZITAT_PURE_CONFIG.sunflower.size,
            src: ZITAT_PURE_CONFIG.sunflower.src,
            listening: true,
            visible: (state) => state.assetVisibility['sunflower'] ?? true,
            draggable: true,
            opacity: (state) => state.sunflowerOpacity ?? 0.06,
            opacityStateKey: 'sunflowerOpacity',
            fill: (state, _layout) => state.sunflowerColor ?? '#FFFFFF',
            fillStateKey: 'sunflowerColor',
        },
        // Quote mark
        {
            id: 'quote-mark',
            type: 'image',
            x: (state: any, layout: GenericLayoutResult) => layout['quote-mark']?.x ?? ZITAT_PURE_CONFIG.quotationMark.x,
            y: (state: any, layout: GenericLayoutResult) => layout['quote-mark']?.y ?? 120,
            order: 2,
            width: ZITAT_PURE_CONFIG.quotationMark.size,
            height: ZITAT_PURE_CONFIG.quotationMark.size,
            src: ZITAT_PURE_CONFIG.quotationMark.src,
            listening: true,
            visible: (state) => state.assetVisibility['quote-mark'] ?? true,
            draggable: true,
            offsetKey: 'quoteMarkOffset',
        },
        // Quote text
        {
            id: 'quote-text',
            type: 'text',
            x: (state: any, layout: GenericLayoutResult) => layout['quote-text']?.x ?? ZITAT_PURE_CONFIG.quote.x,
            y: (state: any, layout: GenericLayoutResult) => layout['quote-text']?.y ?? 200,
            order: 3,
            textKey: 'quote',
            width: ZITAT_PURE_CONFIG.quote.maxWidth,
            fontSize: (state: any, layout: GenericLayoutResult) => layout['quote-text']?.fontSize ?? ZITAT_PURE_CONFIG.quote.fontSize,
            fontFamily: `${ZITAT_PURE_CONFIG.quote.fontFamily}, Arial, sans-serif`,
            fontStyle: ZITAT_PURE_CONFIG.quote.fontStyle,
            align: 'left',
            lineHeight: ZITAT_PURE_CONFIG.quote.lineHeight,
            wrap: 'word',
            padding: 0,
            editable: true,
            draggable: true,
            fontSizeStateKey: 'customQuoteFontSize',
            opacity: (state: any) => state.quoteOpacity ?? 1,
            opacityStateKey: 'quoteOpacity',
            fill: (state: any, layout: any) => state.quoteColor ?? layout._meta.fontColor,
            fillStateKey: 'quoteColor',
        },
        // Author name
        {
            id: 'name-text',
            type: 'text',
            x: (state: any, layout: GenericLayoutResult) => layout['name-text']?.x ?? ZITAT_PURE_CONFIG.author.x,
            y: (state: any, layout: GenericLayoutResult) => layout['name-text']?.y ?? 500,
            order: 4,
            textKey: 'name',
            width: ZITAT_PURE_CONFIG.quote.maxWidth,
            fontSize: (state: any, layout: GenericLayoutResult) => layout['name-text']?.fontSize ?? ZITAT_PURE_CONFIG.author.fontSize,
            fontFamily: `${ZITAT_PURE_CONFIG.author.fontFamily}, Arial, sans-serif`,
            fontStyle: ZITAT_PURE_CONFIG.author.fontStyle,
            align: 'left',
            padding: 0,
            editable: true,
            draggable: true,
            fontSizeStateKey: 'customNameFontSize',
            opacity: (state: any) => state.nameOpacity ?? 1,
            opacityStateKey: 'nameOpacity',
            fill: (state: any, layout: any) => state.nameColor ?? layout._meta.fontColor,
            fillStateKey: 'nameColor',
        },
    ],

    calculateLayout,

    createInitialState: (props) => ({
        quote: props.quote ?? '',
        name: props.name ?? '',
        backgroundColor: ZITAT_PURE_CONFIG.background.color,
        customQuoteFontSize: null,
        customNameFontSize: null,
        assetVisibility: {
            sunflower: true,
            'quote-mark': true,
        },
        sunflowerOpacity: 0.06,
        sunflowerColor: '#FFFFFF',
        quoteOpacity: 1,
        nameOpacity: 1,
        alternatives: props.alternatives ?? [],
        isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
        selectedIcons: [],
        iconStates: {},
        shapeInstances: [],
        selectedShapeId: null,
        illustrationInstances: [],
        selectedIllustrationId: null,
        additionalTexts: [],
        quoteMarkOffset: { x: 0, y: 0 },
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
        setSunflowerOpacity: (val: number) => {
            setState((prev) => ({ ...prev, sunflowerOpacity: val }));
            // No history needed for rapid slider changes if handled by component state, 
            // but for safety in generic we might rely on it. Generic wrapper handles state updates via opacityStateKey directly.
            // So this action might not be called directly by slider, but is good for consistency.
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
                                    x: ZITAT_PURE_CONFIG.canvas.width / 2,
                                    y: ZITAT_PURE_CONFIG.canvas.height / 2,
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
            const x = ZITAT_PURE_CONFIG.canvas.width / 2;
            const y = ZITAT_PURE_CONFIG.canvas.height / 2;
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
        duplicateShape: (id) => {
            const shape = getState().shapeInstances.find(s => s.id === id);
            if (!shape) return;
            const newShape: ShapeInstance = {
                ...shape,
                id: `shape-${Date.now()}`,
                x: shape.x + 20,
                y: shape.y + 20,
            };
            setState((prev) => ({
                ...prev,
                shapeInstances: [...prev.shapeInstances, newShape],
            }));
            saveToHistory({ ...getState(), shapeInstances: [...getState().shapeInstances, newShape] });
        },
        // Illustration actions
        addIllustration: (id: string) => {
            const newIllustration = createIllustration(
                id,
                ZITAT_PURE_CONFIG.canvas.width,
                ZITAT_PURE_CONFIG.canvas.height
            );
            setState((prev) => ({
                ...prev,
                illustrationInstances: [...prev.illustrationInstances, newIllustration],
            }));
            saveToHistory({ ...getState(), illustrationInstances: [...getState().illustrationInstances, newIllustration] });
        },
        updateIllustration: (id, partial) => {
            setState((prev) => ({
                ...prev,
                illustrationInstances: prev.illustrationInstances.map(i =>
                    i.id === id ? { ...i, ...partial } : i
                ) as IllustrationInstance[],
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
        duplicateIllustration: (id) => {
            const ill = getState().illustrationInstances.find(i => i.id === id);
            if (!ill) return;
            const newIll: IllustrationInstance = {
                ...ill,
                id: `ill-${Date.now()}`,
                x: ill.x + 20,
                y: ill.y + 20,
            } as IllustrationInstance;
            setState((prev) => ({
                ...prev,
                illustrationInstances: [...prev.illustrationInstances, newIll],
            }));
            saveToHistory({ ...getState(), illustrationInstances: [...getState().illustrationInstances, newIll] });
        },
        // Additional Text actions
        addHeader: () => {
            const id = `text-${Date.now()}`;
            const newText: AdditionalText = {
                id,
                text: 'Neue Überschrift',
                type: 'header',
                x: ZITAT_PURE_CONFIG.canvas.width / 2,
                y: ZITAT_PURE_CONFIG.canvas.height / 2,
                width: 400,
                fontSize: ZITAT_PURE_CONFIG.quote.fontSize,
                fontFamily: `${ZITAT_PURE_CONFIG.quote.fontFamily}, Arial, sans-serif`,
                fontStyle: ZITAT_PURE_CONFIG.quote.fontStyle,
                fill: FONT_COLORS[getState().backgroundColor] || '#005437',
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
                x: ZITAT_PURE_CONFIG.canvas.width / 2,
                y: ZITAT_PURE_CONFIG.canvas.height / 2 + 100,
                width: 400,
                fontSize: ZITAT_PURE_CONFIG.author.fontSize,
                fontFamily: `${ZITAT_PURE_CONFIG.author.fontFamily}, Arial, sans-serif`,
                fontStyle: 'normal',
                fill: FONT_COLORS[getState().backgroundColor] || '#005437',
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
        backgroundImages: {},
        textColors: FONT_COLORS,
    },
};
