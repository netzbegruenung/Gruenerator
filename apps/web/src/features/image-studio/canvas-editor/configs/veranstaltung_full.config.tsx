/**
 * Veranstaltung Full Canvas Configuration
 * Event sharepic with photo, green section, and date circle
 */

import type { FullCanvasConfig, LayoutResult, AdditionalText } from './types';
import { TextSection, ImageBackgroundSection, AssetsSection, AlternativesSection } from '../sidebar/sections';
import { PiTextT, PiTextAa, PiSquaresFourFill } from 'react-icons/pi';
import { HiPhotograph, HiSparkles } from 'react-icons/hi';
import { ALL_ASSETS, CANVAS_RECOMMENDED_ASSETS } from '../utils/canvasAssets';
import { VERANSTALTUNG_CONFIG, calculateVeranstaltungLayout } from '../utils/veranstaltungLayout';
import type { IconType } from '../utils/canvasIcons';
import type { ShapeInstance, ShapeType } from '../utils/shapes';
import { createShape } from '../utils/shapes';
import { IllustrationInstance, createIllustration } from '../utils/canvasIllustrations';
import type { StockImageAttribution } from '../../../services/imageSourceService';

// ============================================================================
// STATE TYPE
// ============================================================================

export interface VeranstaltungFullState {
    eventTitle: string;
    beschreibung: string;
    weekday: string;
    date: string;
    time: string;
    locationName: string;
    address: string;
    currentImageSrc: string;
    imageOffset: { x: number; y: number };
    imageScale: number;
    isBackgroundLocked: boolean;
    customEventTitleFontSize: number | null;
    customBeschreibungFontSize: number | null;
    eventTitleOpacity?: number;
    beschreibungOpacity?: number;
    titleColor?: string;
    beschreibungColor?: string;
    assetVisibility: Record<string, boolean>;
    isDesktop: boolean;
    alternatives: string[];
    // Icons & Shapes
    selectedIcons: string[];
    iconStates: Record<string, { x: number; y: number; scale: number; rotation: number; color?: string; opacity?: number }>;
    shapeInstances: ShapeInstance[];
    selectedShapeId: string | null;
    illustrationInstances: IllustrationInstance[];
    additionalTexts: AdditionalText[];
    // Attribution
    imageAttribution?: StockImageAttribution | null;
}

// ============================================================================
// ACTIONS TYPE
// ============================================================================

export interface VeranstaltungFullActions {
    setEventTitle: (val: string) => void;
    setBeschreibung: (val: string) => void;
    handleEventTitleFontSizeChange: (size: number) => void;
    handleBeschreibungFontSizeChange: (size: number) => void;
    setImageScale: (scale: number) => void;
    toggleBackgroundLock: () => void;
    handleAssetToggle: (id: string, visible: boolean) => void;
    handleSelectAlternative: (alt: string) => void;
    // Icons & Shapes
    toggleIcon: (id: string, selected: boolean) => void;
    updateIcon: (id: string, partial: { x?: number; y?: number; scale?: number; rotation?: number, color?: string, opacity?: number }) => void;
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

const calculateLayout = (state: VeranstaltungFullState): LayoutResult => {
    const eventTitleFontSize = state.customEventTitleFontSize ?? VERANSTALTUNG_CONFIG.eventTitle.fontSize;
    const beschreibungFontSize = state.customBeschreibungFontSize ?? VERANSTALTUNG_CONFIG.description.fontSize;
    const layout = calculateVeranstaltungLayout(eventTitleFontSize, beschreibungFontSize);

    // Calculate dynamic positions
    const titleLineHeight = eventTitleFontSize * VERANSTALTUNG_CONFIG.eventTitle.lineHeightRatio;
    const estimatedTitleLines = Math.ceil(state.eventTitle.length / 20);
    const titleHeight = estimatedTitleLines * titleLineHeight;
    const beschreibungY = layout.eventTitle.y + titleHeight + VERANSTALTUNG_CONFIG.eventTitle.gapBelow;

    return {
        'event-title': {
            x: layout.eventTitle.x,
            y: layout.eventTitle.y,
            width: VERANSTALTUNG_CONFIG.text.maxWidth,
            fontSize: eventTitleFontSize,
        },
        'beschreibung': {
            x: layout.description.x,
            y: beschreibungY,
            width: VERANSTALTUNG_CONFIG.text.maxWidth,
            fontSize: beschreibungFontSize,
        },
        'circle': {
            x: layout.circle.x,
            y: layout.circle.y,
        },
        'location': {
            x: layout.footer.x,
            y: layout.footer.y,
        },
    };
};

// ============================================================================
// FULL CONFIG
// ============================================================================

export const veranstaltungFullConfig: FullCanvasConfig<VeranstaltungFullState, VeranstaltungFullActions> = {
    id: 'veranstaltung',

    canvas: {
        width: VERANSTALTUNG_CONFIG.canvas.width,
        height: VERANSTALTUNG_CONFIG.canvas.height,
    },

    features: {
        icons: true,
        shapes: true,
    },

    tabs: [
        { id: 'text', icon: PiTextT, label: 'Text', ariaLabel: 'Text bearbeiten' },

        { id: 'image', icon: HiPhotograph, label: 'Bild', ariaLabel: 'Bild anpassen' },
        { id: 'assets', icon: PiSquaresFourFill, label: 'Elemente', ariaLabel: 'Dekorative Elemente' },
        { id: 'alternatives', icon: HiSparkles, label: 'Alternativen', ariaLabel: 'Alternative Texte' },
    ],

    getVisibleTabs: (state) => {
        if (state.isDesktop) {
            return ['text', 'image', 'assets', 'alternatives'];
        }
        return ['text', 'image', 'assets', 'alternatives'];
    },

    getDisabledTabs: (state) => {
        return state.alternatives.length === 0 ? ['alternatives'] : [];
    },

    sections: {
        text: {
            component: TextSection,
            propsFactory: (state, actions) => ({
                quote: state.eventTitle,
                name: state.beschreibung,
                onQuoteChange: actions.setEventTitle,
                onNameChange: actions.setBeschreibung,
                onAddHeader: actions.addHeader,
                onAddText: actions.addText,
                additionalTexts: state.additionalTexts || [],
                onUpdateAdditionalText: (id: string, text: string) => actions.updateAdditionalText(id, { text }),
                onRemoveAdditionalText: actions.removeAdditionalText,
                quoteFontSize: state.customEventTitleFontSize ?? VERANSTALTUNG_CONFIG.eventTitle.fontSize,
                nameFontSize: state.customBeschreibungFontSize ?? VERANSTALTUNG_CONFIG.description.fontSize,
                onQuoteFontSizeChange: actions.handleEventTitleFontSizeChange,
                onNameFontSizeChange: actions.handleBeschreibungFontSizeChange,
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
                isLocked: state.isBackgroundLocked,
                onToggleLock: actions.toggleBackgroundLock,
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
                recommendedAssetIds: CANVAS_RECOMMENDED_ASSETS['veranstaltung'],
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
            }),
        },
        alternatives: {
            component: AlternativesSection,
            propsFactory: (state, actions) => ({
                alternatives: state.alternatives,
                currentQuote: state.eventTitle,
                onAlternativeSelect: actions.handleSelectAlternative,
            }),
        },
    },

    // Veranstaltung has complex elements (circle with rotated text, clipped photo)
    // that don't fit the generic element model well. Using simplified elements.
    elements: [
        // Green section background
        {
            id: 'green-section',
            type: 'rect',
            x: 0,
            y: VERANSTALTUNG_CONFIG.greenSection.y,
            order: 1,
            width: VERANSTALTUNG_CONFIG.canvas.width,
            height: VERANSTALTUNG_CONFIG.greenSection.height,
            fill: VERANSTALTUNG_CONFIG.greenSection.color,
            listening: false,
        },
        // Event title
        {
            id: 'event-title',
            type: 'text',
            x: (s: any, l: LayoutResult) => l['event-title']?.x ?? VERANSTALTUNG_CONFIG.text.leftMargin,
            y: (s: any, l: LayoutResult) => l['event-title']?.y ?? VERANSTALTUNG_CONFIG.eventTitle.startY,
            order: 3,
            textKey: 'eventTitle',
            width: VERANSTALTUNG_CONFIG.text.maxWidth,
            fontSize: (s: any, l: LayoutResult) => l['event-title']?.fontSize ?? VERANSTALTUNG_CONFIG.eventTitle.fontSize,
            fontFamily: `${VERANSTALTUNG_CONFIG.eventTitle.fontFamily}, Arial, sans-serif`,
            fontStyle: 'bold italic',
            align: 'left',
            lineHeight: VERANSTALTUNG_CONFIG.eventTitle.lineHeightRatio,
            wrap: 'word',
            editable: true,
            draggable: true,
            fontSizeStateKey: 'customEventTitleFontSize',
            opacity: (state: any) => state.eventTitleOpacity ?? 1,
            opacityStateKey: 'eventTitleOpacity',
            fill: (state: any, _layout: any) => state.titleColor ?? '#FFFFFF',
            fillStateKey: 'titleColor',
        },
        // Description
        {
            id: 'beschreibung',
            type: 'text',
            x: (s: any, l: LayoutResult) => l['beschreibung']?.x ?? VERANSTALTUNG_CONFIG.text.leftMargin,
            y: (s: any, l: LayoutResult) => l['beschreibung']?.y ?? 750,
            order: 4,
            textKey: 'beschreibung',
            width: VERANSTALTUNG_CONFIG.text.maxWidth,
            fontSize: (s: any, l: LayoutResult) => l['beschreibung']?.fontSize ?? VERANSTALTUNG_CONFIG.description.fontSize,
            fontFamily: `${VERANSTALTUNG_CONFIG.description.fontFamily}, Arial, sans-serif`,
            fontStyle: 'italic',
            align: 'left',
            lineHeight: VERANSTALTUNG_CONFIG.description.lineHeightRatio,
            wrap: 'word',
            editable: true,
            draggable: true,
            fontSizeStateKey: 'customBeschreibungFontSize',
            opacity: (state: any) => state.beschreibungOpacity ?? 1,
            opacityStateKey: 'beschreibungOpacity',
            fill: (state: any, _layout: any) => state.beschreibungColor ?? '#FFFFFF',
            fillStateKey: 'beschreibungColor',
        },
        // Date circle (simplified as a circle, text would need custom rendering)
        {
            id: 'date-circle',
            type: 'circle',
            x: VERANSTALTUNG_CONFIG.circle.centerX,
            y: VERANSTALTUNG_CONFIG.circle.centerY,
            order: 5,
            radius: VERANSTALTUNG_CONFIG.circle.radius,
            fill: VERANSTALTUNG_CONFIG.circle.backgroundColor,
            rotation: VERANSTALTUNG_CONFIG.circle.rotation,
        },
    ],

    calculateLayout,

    createInitialState: (props) => ({
        eventTitle: props.eventTitle ?? '',
        beschreibung: props.beschreibung ?? '',
        weekday: props.weekday ?? '',
        date: props.date ?? '',
        time: props.time ?? '',
        locationName: props.locationName ?? '',
        address: props.address ?? '',
        currentImageSrc: props.imageSrc ?? '',
        imageOffset: { x: 0, y: 0 },
        imageScale: 1,
        isBackgroundLocked: true,
        customEventTitleFontSize: null,
        customBeschreibungFontSize: null,
        eventTitleOpacity: 1,
        beschreibungOpacity: 1,
        assetVisibility: {},
        isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
        alternatives: props.alternatives?.map((a: any) => a.eventTitle || '') ?? [],
        selectedIcons: [],
        iconStates: {},
        shapeInstances: [],
        selectedShapeId: null,
        illustrationInstances: [],
        additionalTexts: [],
        imageAttribution: null,
    }),

    createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => ({
        setEventTitle: (val: string) => {
            setState((prev) => ({ ...prev, eventTitle: val }));
            callbacks.onEventTitleChange?.(val);
            debouncedSaveToHistory({ ...getState(), eventTitle: val });
        },
        setBeschreibung: (val: string) => {
            setState((prev) => ({ ...prev, beschreibung: val }));
            callbacks.onBeschreibungChange?.(val);
            debouncedSaveToHistory({ ...getState(), beschreibung: val });
        },
        handleEventTitleFontSizeChange: (size: number) => {
            setState((prev) => ({ ...prev, customEventTitleFontSize: size }));
        },
        handleBeschreibungFontSizeChange: (size: number) => {
            setState((prev) => ({ ...prev, customBeschreibungFontSize: size }));
        },
        setImageScale: (scale: number) => {
            setState((prev) => ({ ...prev, imageScale: scale }));
            debouncedSaveToHistory({ ...getState(), imageScale: scale });
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
            setState((prev) => ({ ...prev, eventTitle: alt }));
            callbacks.onEventTitleChange?.(alt);
            saveToHistory({ ...getState(), eventTitle: alt });
            saveToHistory({ ...getState(), eventTitle: alt });
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
                                    x: VERANSTALTUNG_CONFIG.canvas.width / 2,
                                    y: VERANSTALTUNG_CONFIG.canvas.height / 2,
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
            const x = VERANSTALTUNG_CONFIG.canvas.width / 2;
            const y = VERANSTALTUNG_CONFIG.canvas.height / 2;
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
        addIllustration: (id: string) => {
            const newIllustration = createIllustration(
                id,
                VERANSTALTUNG_CONFIG.canvas.width,
                VERANSTALTUNG_CONFIG.canvas.height
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
                x: VERANSTALTUNG_CONFIG.canvas.width / 2,
                y: VERANSTALTUNG_CONFIG.canvas.height / 2,
                width: 400,
                fontSize: VERANSTALTUNG_CONFIG.eventTitle.fontSize,
                fontFamily: `${VERANSTALTUNG_CONFIG.eventTitle.fontFamily}, Arial, sans-serif`,
                fontStyle: 'bold italic',
                fill: VERANSTALTUNG_CONFIG.text.color,
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
                x: VERANSTALTUNG_CONFIG.canvas.width / 2,
                y: VERANSTALTUNG_CONFIG.canvas.height / 2 + 100,
                width: 400,
                fontSize: VERANSTALTUNG_CONFIG.description.fontSize,
                fontFamily: `${VERANSTALTUNG_CONFIG.description.fontFamily}, Arial, sans-serif`,
                fontStyle: 'italic',
                fill: VERANSTALTUNG_CONFIG.text.color,
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
