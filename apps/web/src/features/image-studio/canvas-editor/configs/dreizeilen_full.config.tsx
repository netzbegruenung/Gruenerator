/**
 * Dreizeilen Full Canvas Configuration
 *
 * Complete config-driven canvas for the "3 lines on bars" sharepic format.
 * Migrated from monolithic 1,107-line DreizeilenCanvas component.
 */

import type { FullCanvasConfig, LayoutResult as GenericLayoutResult, AdditionalText } from './types';
import type { DreizeilenFullState, DreizeilenFullActions, DreizeilenAlternative } from './dreizeilen.types';
import {
    DreizeilenTextAndFontSection,
    DreizeilenPositionSection,
    AlternativesSection,
    AssetsSection,
    ImageBackgroundSection,
    GenericShareSection
} from '../sidebar';
import { PiTextT, PiSquaresFourFill } from 'react-icons/pi';
import { HiSparkles, HiPhotograph } from 'react-icons/hi';
import { FaShare } from 'react-icons/fa';
import { BalkenIcon } from '../icons';
import { calculateDreizeilenLayout, COLOR_SCHEMES, getColorScheme, DREIZEILEN_CONFIG } from '../utils/dreizeilenLayout';
import { ALL_ASSETS, CANVAS_RECOMMENDED_ASSETS } from '../utils/canvasAssets';
import type { StockImageAttribution } from '../../services/imageSourceService';
import { createShape } from '../utils/shapes';
import type { ShapeType, ShapeInstance } from '../utils/shapes';
import type { BalkenInstance } from '../primitives/BalkenGroup';
import {
    ICON_DEFAULTS,
    SHAPE_DEFAULTS,
    ADDITIONAL_TEXT_DEFAULTS,
} from './dreizeilen.constants';

// ============================================================================
// CONSTANTS
// ============================================================================

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1080;

const SUNFLOWER_CONFIG = {
    src: '/sunflower.svg',
    defaultOpacity: 1,
    defaultSize: 200,
};

// ============================================================================
// HELPER: CREATE BALKEN INSTANCE
// ============================================================================

/**
 * Creates a single BalkenInstance for the 3-bar Dreizeilen canvas
 * This is computed from state rather than being stored directly
 */
function createBalkenInstance(state: Partial<DreizeilenFullState>): BalkenInstance {
    return {
        id: 'dreizeilen-balken',
        mode: 'triple',
        colorSchemeId: state.colorSchemeId ?? 'tanne-sand',
        widthScale: state.balkenWidthScale ?? 1,
        offset: state.balkenOffset ?? { x: 0, y: 0 },
        scale: 1,
        texts: [
            state.line1 ?? '',
            state.line2 ?? '',
            state.line3 ?? '',
        ],
        rotation: 0,
        opacity: state.balkenOpacity ?? 1,
        barOffsets: state.barOffsets,
    };
}

// ============================================================================
// LAYOUT CALCULATOR
// ============================================================================

const calculateLayout = (state: DreizeilenFullState): GenericLayoutResult => {
    const layoutResult = calculateDreizeilenLayout(
        [state.line1, state.line2, state.line3],
        state.fontSize,
        state.barOffsets,
        [state.balkenOffset.x, state.balkenOffset.y],
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
        state.balkenWidthScale
    );

    const colorScheme = getColorScheme(state.colorSchemeId);

    return {
        // Balken (bars) layouts
        balken1: {
            x: layoutResult.balkenLayouts[0]?.x ?? 0,
            y: layoutResult.balkenLayouts[0]?.y ?? 200,
            width: layoutResult.balkenLayouts[0]?.width ?? 800,
            height: layoutResult.balkenLayouts[0]?.height ?? 100,
        },
        balken2: {
            x: layoutResult.balkenLayouts[1]?.x ?? 0,
            y: layoutResult.balkenLayouts[1]?.y ?? 400,
            width: layoutResult.balkenLayouts[1]?.width ?? 800,
            height: layoutResult.balkenLayouts[1]?.height ?? 100,
        },
        balken3: {
            x: layoutResult.balkenLayouts[2]?.x ?? 0,
            y: layoutResult.balkenLayouts[2]?.y ?? 600,
            width: layoutResult.balkenLayouts[2]?.width ?? 800,
            height: layoutResult.balkenLayouts[2]?.height ?? 100,
        },
        // Sunflower default position
        sunflower: {
            x: layoutResult.sunflowerDefaultPos?.x ?? CANVAS_WIDTH - 150,
            y: layoutResult.sunflowerDefaultPos?.y ?? CANVAS_HEIGHT - 150,
            width: layoutResult.sunflowerSize ?? SUNFLOWER_CONFIG.defaultSize,
            height: layoutResult.sunflowerSize ?? SUNFLOWER_CONFIG.defaultSize,
        },
        _meta: {
            colorScheme,
            textBlockBounds: layoutResult.textBlockBounds,
            balkenLayouts: layoutResult.balkenLayouts,
        } as any,
    };
};

// ============================================================================
// FULL CONFIG
// ============================================================================

export const dreizeilenFullConfig: FullCanvasConfig<DreizeilenFullState, DreizeilenFullActions> = {
    id: 'dreizeilen',

    canvas: {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
    },

    features: {
        icons: true,
        shapes: true,
    },

    fonts: {
        primary: 'GrueneTypeNeue',
        fontSize: 75,
        requireFontLoad: true,
    },

    tabs: [
        { id: 'text', icon: PiTextT, label: 'Text', ariaLabel: 'Text bearbeiten' },
        { id: 'image-background', icon: HiPhotograph, label: 'Hintergrund', ariaLabel: 'Hintergrundbild ändern' },
        { id: 'position', icon: BalkenIcon, label: 'Balken', ariaLabel: 'Balken-Einstellungen' },
        { id: 'assets', icon: PiSquaresFourFill, label: 'Elemente', ariaLabel: 'Elemente hinzufügen' },
        { id: 'alternatives', icon: HiSparkles, label: 'Alternativen', ariaLabel: 'Alternative Texte' },
        { id: 'share', icon: FaShare, label: 'Teilen', ariaLabel: 'Bild teilen' },
    ],

    getVisibleTabs: (state) => {
        return ['text', 'image-background', 'position', 'assets', 'alternatives', 'share'];
    },

    getDisabledTabs: (state) => {
        const disabled: string[] = [];
        if (!state.alternatives || state.alternatives.length === 0) {
            disabled.push('alternatives');
        }
        return disabled as any;
    },

    sections: {
        text: {
            component: DreizeilenTextAndFontSection,
            propsFactory: (state, actions) => ({
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
                onUpdateAdditionalText: (id: string, text: string) =>
                    actions.updateAdditionalText(id, { text }),
                onRemoveAdditionalText: actions.removeAdditionalText,
            }),
        },

        position: {
            component: DreizeilenPositionSection,
            propsFactory: (state, actions) => ({
                widthScale: state.balkenWidthScale,
                onWidthScaleChange: actions.setBalkenWidthScale,
                barOffsets: state.barOffsets,
                onBarOffsetChange: (index: number, offset: number) => {
                    const newOffsets = [...state.barOffsets] as [number, number, number];
                    newOffsets[index] = offset;
                    actions.setBarOffsets(newOffsets);
                },
                colorScheme: getColorScheme(state.colorSchemeId),
                colorSchemes: COLOR_SCHEMES,
                activeSchemeId: state.colorSchemeId,
                onSchemeChange: actions.setColorSchemeId,
                onReset: actions.handleReset,
            }),
        },

        'image-background': {
            component: ImageBackgroundSection,
            propsFactory: (state, actions) => ({
                currentImageSrc: state.currentImageSrc,
                onImageChange: (file: File | null, objectUrl?: string, attribution?: StockImageAttribution | null) => {
                    actions.setCurrentImageSrc(file, objectUrl, attribution);
                },
                scale: state.imageScale,
                onScaleChange: actions.setImageScale,
                imageAttribution: state.imageAttribution,
            }),
        },

        assets: {
            component: AssetsSection,
            propsFactory: (state, actions, context) => ({
                assets: ALL_ASSETS.map(asset => ({
                    ...asset,
                    visible: asset.id === 'sunflower' ? state.sunflowerVisible : false,
                })),
                onAssetToggle: (id: string, visible: boolean) => {
                    if (id === 'sunflower') {
                        actions.setSunflowerVisible(visible);
                    }
                },
                recommendedAssetIds: CANVAS_RECOMMENDED_ASSETS['dreizeilen'],
                selectedIcons: state.selectedIcons,
                onIconToggle: actions.toggleIcon,
                onAddShape: actions.addShape,
                shapeInstances: state.shapeInstances,
                selectedShapeId: context?.selectedElement,
                onUpdateShape: actions.updateShape,
                onRemoveShape: actions.removeShape,
            }),
        },

        alternatives: {
            component: AlternativesSection,
            propsFactory: (state, actions) => ({
                alternatives: state.alternatives || [],
                currentLine1: state.line1,
                currentLine2: state.line2,
                currentLine3: state.line3,
                onSelectAlternative: actions.handleSelectAlternative,
            }),
        },

        share: {
            component: GenericShareSection,
            propsFactory: (state, actions, context) => {
                const canvasText = `${state.line1}\n${state.line2}\n${state.line3}`.trim();

                // Extract shareProps from context (3rd parameter) with default values
                const shareProps = context || {
                    exportedImage: null,
                    autoSaveStatus: 'idle' as const,
                    shareToken: null,
                    onCaptureCanvas: undefined,
                    onDownload: undefined,
                    onNavigateToGallery: undefined,
                    selectedElement: null,
                };

                return {
                    exportedImage: shareProps.exportedImage || null,
                    autoSaveStatus: shareProps.autoSaveStatus || 'idle',
                    shareToken: shareProps.shareToken || null,
                    onCaptureCanvas: shareProps.onCaptureCanvas || (() => {
                        console.error('[dreizeilen_full] onCaptureCanvas missing from shareProps!');
                    }),
                    onDownload: shareProps.onDownload || (() => {}),
                    onNavigateToGallery: shareProps.onNavigateToGallery || (() => {}),
                    canvasText,
                    canvasType: 'dreizeilen',
                };
            },
        },
    },

    elements: [
        // Background Image
        {
            id: 'background-image',
            type: 'image',
            x: 0,
            y: 0,
            order: 0,
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            srcKey: 'currentImageSrc',
            offsetKey: 'imageOffset',
            scaleKey: 'imageScale',
            draggable: true,
            transformable: true,
            visible: (state: DreizeilenFullState) => state.hasBackgroundImage,
        },

        // Sunflower
        {
            id: 'sunflower',
            type: 'image',
            x: (state: DreizeilenFullState, layout: GenericLayoutResult) =>
                state.sunflowerPos?.x ?? layout.sunflower?.x ?? CANVAS_WIDTH - 150,
            y: (state: DreizeilenFullState, layout: GenericLayoutResult) =>
                state.sunflowerPos?.y ?? layout.sunflower?.y ?? CANVAS_HEIGHT - 150,
            order: 1,
            width: (state: DreizeilenFullState, layout: GenericLayoutResult) =>
                state.sunflowerSize?.w ?? layout.sunflower?.width ?? SUNFLOWER_CONFIG.defaultSize,
            height: (state: DreizeilenFullState, layout: GenericLayoutResult) =>
                state.sunflowerSize?.h ?? layout.sunflower?.height ?? SUNFLOWER_CONFIG.defaultSize,
            src: SUNFLOWER_CONFIG.src,
            draggable: true,
            transformable: true,
            listening: true,
            visible: (state: DreizeilenFullState) => state.sunflowerVisible,
            opacity: (state: DreizeilenFullState) => state.sunflowerOpacity,
            opacityStateKey: 'sunflowerOpacity',
        },

        // Note: Balken (parallelogram bars with text) are NOT included in elements
        // They require custom rendering logic and will be handled separately in DreizeilenCanvas
        // This is because each Balken is a complex group with:
        // - Gradient-filled parallelogram shape
        // - Text with specific positioning inside the bar
        // - Individual drag/transform handlers
        // - Color scheme-dependent gradients
    ],

    calculateLayout,

    createInitialState: (props: Record<string, unknown>) => ({
        // Text Content
        line1: (props.line1 as string | undefined) ?? '',
        line2: (props.line2 as string | undefined) ?? '',
        line3: (props.line3 as string | undefined) ?? '',

        // Text Formatting
        colorSchemeId: (props.colorSchemeId as string | undefined) ?? 'tanne-sand',
        fontSize: (props.fontSize as number | undefined) ?? 60,
        balkenWidthScale: (props.balkenWidthScale as number | undefined) ?? 1,
        barOffsets: (props.barOffsets as [number, number, number] | undefined) ?? DREIZEILEN_CONFIG.defaults.balkenOffset,

        // Balken Position
        balkenOffset: (props.balkenOffset as { x: number; y: number } | undefined) ?? { x: 0, y: 0 },
        balkenOpacity: (props.balkenOpacity as number | undefined) ?? 1,

        // Sunflower
        sunflowerPos: (props.sunflowerPos as { x: number; y: number } | null | undefined) ?? null,
        sunflowerSize: (props.sunflowerSize as { w: number; h: number } | null | undefined) ?? null,
        sunflowerVisible: (props.sunflowerVisible as boolean | undefined) ?? true,
        sunflowerOpacity: (props.sunflowerOpacity as number | undefined) ?? SUNFLOWER_CONFIG.defaultOpacity,

        // Background Image
        currentImageSrc: props.currentImageSrc as string | undefined,
        imageOffset: (props.imageOffset as { x: number; y: number } | undefined) ?? { x: 0, y: 0 },
        imageScale: (props.imageScale as number | undefined) ?? 1,
        imageAttribution: (props.imageAttribution as StockImageAttribution | null | undefined) ?? null,
        hasBackgroundImage: !!props.currentImageSrc,
        bgImageDimensions: (props.bgImageDimensions as { width: number; height: number } | null | undefined) ?? null,

        // Icons & Shapes
        selectedIcons: (props.selectedIcons as string[] | undefined) ?? [],
        iconStates: (props.iconStates as Record<string, { x: number; y: number; scale: number; rotation: number; color?: string; opacity?: number }> | undefined) ?? {},
        shapeInstances: (props.shapeInstances as ShapeInstance[] | undefined) ?? [],
        selectedShapeId: null,

        // Additional Texts
        additionalTexts: (props.additionalTexts as AdditionalText[] | undefined) ?? [],

        // Balken Instances (computed from state)
        balkenInstances: (props.balkenInstances as BalkenInstance[] | undefined) ?? [
            createBalkenInstance({
                line1: (props.line1 as string | undefined) ?? '',
                line2: (props.line2 as string | undefined) ?? '',
                line3: (props.line3 as string | undefined) ?? '',
                colorSchemeId: (props.colorSchemeId as string | undefined) ?? 'tanne-sand',
                balkenWidthScale: (props.balkenWidthScale as number | undefined) ?? 1,
                balkenOffset: (props.balkenOffset as { x: number; y: number } | undefined) ?? { x: 0, y: 0 },
                balkenOpacity: (props.balkenOpacity as number | undefined) ?? 1,
            })
        ],

        // Layer Ordering
        layerOrder: (props.layerOrder as string[] | undefined) ?? [],

        // UI State
        isDesktop: (props.isDesktop as boolean | undefined) ?? (typeof window !== 'undefined' && window.innerWidth >= 900),
        alternatives: (props.alternatives as { id: string; line1: string; line2: string; line3: string }[] | undefined) ?? [],
    }),

    createActions: (getState, setState, saveToHistory, debouncedSaveToHistory, callbacks) => {
        // Helper: Update balken instances when balken-related state changes
        const updateBalkenInstances = (state: DreizeilenFullState): BalkenInstance[] => {
            return [createBalkenInstance(state)];
        };

        return {
        // === Text Actions ===
        setLine1: (text: string) => {
            setState(prev => {
                const newState = { ...prev, line1: text };
                return { ...newState, balkenInstances: updateBalkenInstances(newState) };
            });
            callbacks.onLine1Change?.(text);
            debouncedSaveToHistory(getState());
        },

        setLine2: (text: string) => {
            setState(prev => {
                const newState = { ...prev, line2: text };
                return { ...newState, balkenInstances: updateBalkenInstances(newState) };
            });
            callbacks.onLine2Change?.(text);
            debouncedSaveToHistory(getState());
        },

        setLine3: (text: string) => {
            setState(prev => {
                const newState = { ...prev, line3: text };
                return { ...newState, balkenInstances: updateBalkenInstances(newState) };
            });
            callbacks.onLine3Change?.(text);
            debouncedSaveToHistory(getState());
        },

        setFontSize: (size: number) => {
            setState(prev => ({ ...prev, fontSize: size }));
            callbacks.onFontSizeChange?.(size);
            debouncedSaveToHistory({ ...getState(), fontSize: size });
        },

        setColorSchemeId: (id: string) => {
            setState(prev => {
                const newState = { ...prev, colorSchemeId: id };
                return { ...newState, balkenInstances: updateBalkenInstances(newState) };
            });
            callbacks.onColorSchemeChange?.(id);
            saveToHistory(getState());
        },

        handleSelectAlternative: (alt: DreizeilenAlternative) => {
            setState(prev => {
                const newState = {
                    ...prev,
                    line1: alt.line1,
                    line2: alt.line2,
                    line3: alt.line3,
                };
                return { ...newState, balkenInstances: updateBalkenInstances(newState) };
            });
            callbacks.onLine1Change?.(alt.line1);
            callbacks.onLine2Change?.(alt.line2);
            callbacks.onLine3Change?.(alt.line3);
            saveToHistory(getState());
        },

        // === Balken Actions ===
        setBalkenWidthScale: (scale: number) => {
            setState(prev => {
                const newState = { ...prev, balkenWidthScale: scale };
                return { ...newState, balkenInstances: updateBalkenInstances(newState) };
            });
            debouncedSaveToHistory(getState());
        },

        setBarOffsets: (offsets: [number, number, number]) => {
            setState(prev => {
                const newState = { ...prev, barOffsets: offsets };
                return { ...newState, balkenInstances: updateBalkenInstances(newState) };
            });
            debouncedSaveToHistory(getState());
        },

        setBalkenOffset: (offset: { x: number; y: number }) => {
            setState(prev => {
                const newState = { ...prev, balkenOffset: offset };
                return { ...newState, balkenInstances: updateBalkenInstances(newState) };
            });
            debouncedSaveToHistory(getState());
        },

        setBalkenOpacity: (opacity: number) => {
            setState(prev => {
                const newState = { ...prev, balkenOpacity: opacity };
                return { ...newState, balkenInstances: updateBalkenInstances(newState) };
            });
            debouncedSaveToHistory(getState());
        },

        // === Sunflower Actions ===
        setSunflowerVisible: (visible: boolean) => {
            setState(prev => ({ ...prev, sunflowerVisible: visible }));
            saveToHistory({ ...getState(), sunflowerVisible: visible });
        },

        setSunflowerOpacity: (opacity: number) => {
            setState(prev => ({ ...prev, sunflowerOpacity: opacity }));
        },

        handleSunflowerDragEnd: (x: number, y: number) => {
            setState(prev => ({ ...prev, sunflowerPos: { x, y } }));
            saveToHistory({ ...getState(), sunflowerPos: { x, y } });
        },

        handleSunflowerTransformEnd: (width: number, height: number) => {
            setState(prev => ({ ...prev, sunflowerSize: { w: width, h: height } }));
            saveToHistory({ ...getState(), sunflowerSize: { w: width, h: height } });
        },

        // === Background Image Actions ===
        setCurrentImageSrc: (file: File | null, objectUrl?: string, attribution?: StockImageAttribution | null) => {
            const src = file ? objectUrl : undefined;
            setState(prev => ({
                ...prev,
                currentImageSrc: src,
                imageAttribution: attribution ?? null,
                hasBackgroundImage: !!src,
            }));
            callbacks.onImageChange?.(file);
            saveToHistory({
                ...getState(),
                currentImageSrc: src,
                imageAttribution: attribution ?? null,
                hasBackgroundImage: !!src,
            });
        },

        setImageScale: (scale: number) => {
            setState(prev => ({ ...prev, imageScale: scale }));
            debouncedSaveToHistory({ ...getState(), imageScale: scale });
        },

        handleBackgroundImageDragEnd: (x: number, y: number) => {
            setState(prev => ({ ...prev, imageOffset: { x, y } }));
            saveToHistory({ ...getState(), imageOffset: { x, y } });
        },

        handleBackgroundImageTransformEnd: (width: number, height: number) => {
            setState(prev => ({ ...prev, bgImageDimensions: { width, height } }));
            saveToHistory({ ...getState(), bgImageDimensions: { width, height } });
        },

        // === Icon Actions ===
        toggleIcon: (iconId: string, selected: boolean) => {
            setState(prev => {
                if (selected && !prev.iconStates[iconId]) {
                    return {
                        ...prev,
                        selectedIcons: [...prev.selectedIcons, iconId],
                        iconStates: {
                            ...prev.iconStates,
                            [iconId]: {
                                x: ICON_DEFAULTS.x(CANVAS_WIDTH),
                                y: ICON_DEFAULTS.y(CANVAS_HEIGHT),
                                scale: ICON_DEFAULTS.scale,
                                rotation: ICON_DEFAULTS.rotation,
                                color: ICON_DEFAULTS.color,
                                opacity: ICON_DEFAULTS.opacity,
                            },
                        },
                    };
                } else if (!selected) {
                    const newSelectedIcons = prev.selectedIcons.filter(id => id !== iconId);
                    const newIconStates = { ...prev.iconStates };
                    delete newIconStates[iconId];
                    return {
                        ...prev,
                        selectedIcons: newSelectedIcons,
                        iconStates: newIconStates,
                    };
                }
                return prev;
            });
            saveToHistory(getState());
        },

        updateIcon: (iconId: string, partial: Partial<DreizeilenFullState['iconStates'][string]>) => {
            setState(prev => ({
                ...prev,
                iconStates: {
                    ...prev.iconStates,
                    [iconId]: { ...prev.iconStates[iconId], ...partial },
                },
            }));
            debouncedSaveToHistory(getState());
        },

        handleIconDragEnd: (iconId: string, x: number, y: number) => {
            setState(prev => ({
                ...prev,
                iconStates: {
                    ...prev.iconStates,
                    [iconId]: { ...prev.iconStates[iconId], x, y },
                },
            }));
            saveToHistory(getState());
        },

        // === Shape Actions ===
        addShape: (type: ShapeType) => {
            const x = SHAPE_DEFAULTS.x(CANVAS_WIDTH);
            const y = SHAPE_DEFAULTS.y(CANVAS_HEIGHT);
            const newShape = createShape(type, x, y, SHAPE_DEFAULTS.fill);
            setState(prev => ({
                ...prev,
                shapeInstances: [...prev.shapeInstances, newShape],
                selectedShapeId: newShape.id,
            }));
            saveToHistory({
                ...getState(),
                shapeInstances: [...getState().shapeInstances, newShape],
            });
        },

        updateShape: (shapeId: string, partial) => {
            setState(prev => ({
                ...prev,
                shapeInstances: prev.shapeInstances.map(s =>
                    s.id === shapeId ? { ...s, ...partial } : s
                ),
            }));
            debouncedSaveToHistory(getState());
        },

        removeShape: (shapeId: string) => {
            setState(prev => ({
                ...prev,
                shapeInstances: prev.shapeInstances.filter(s => s.id !== shapeId),
                selectedShapeId: prev.selectedShapeId === shapeId ? null : prev.selectedShapeId,
            }));
            saveToHistory(getState());
        },

        // === Additional Text Actions ===
        addHeader: () => {
            const id = `text-${Date.now()}`;
            const layout = calculateLayout(getState());
            const colorScheme = (layout._meta as any)?.colorScheme;

            const newText = {
                id,
                text: ADDITIONAL_TEXT_DEFAULTS.header.defaultText,
                type: 'header' as const,
                x: CANVAS_WIDTH / 2,
                y: ADDITIONAL_TEXT_DEFAULTS.header.offsetY,
                width: ADDITIONAL_TEXT_DEFAULTS.header.width,
                fontSize: ADDITIONAL_TEXT_DEFAULTS.header.fontSize,
                fontFamily: 'Arvo, serif',
                fontStyle: ADDITIONAL_TEXT_DEFAULTS.header.fontStyle,
                fill: colorScheme?.fontColor ?? '#FFFFFF',
                rotation: 0,
                scale: 1,
            };

            setState(prev => ({
                ...prev,
                additionalTexts: [...prev.additionalTexts, newText],
            }));
            saveToHistory({
                ...getState(),
                additionalTexts: [...getState().additionalTexts, newText],
            });
        },

        addText: () => {
            const id = `text-${Date.now()}`;
            const layout = calculateLayout(getState());
            const colorScheme = (layout._meta as any)?.colorScheme;

            const newText = {
                id,
                text: ADDITIONAL_TEXT_DEFAULTS.body.defaultText,
                type: 'body' as const,
                x: CANVAS_WIDTH / 2,
                y: ADDITIONAL_TEXT_DEFAULTS.body.offsetY,
                width: ADDITIONAL_TEXT_DEFAULTS.body.width,
                fontSize: ADDITIONAL_TEXT_DEFAULTS.body.fontSize,
                fontFamily: 'Arvo, serif',
                fontStyle: ADDITIONAL_TEXT_DEFAULTS.body.fontStyle,
                fill: colorScheme?.fontColor ?? '#FFFFFF',
                rotation: 0,
                scale: 1,
            };

            setState(prev => ({
                ...prev,
                additionalTexts: [...prev.additionalTexts, newText],
            }));
            saveToHistory({
                ...getState(),
                additionalTexts: [...getState().additionalTexts, newText],
            });
        },

        updateAdditionalText: (textId: string, partial) => {
            setState(prev => ({
                ...prev,
                additionalTexts: prev.additionalTexts.map(t =>
                    t.id === textId ? { ...t, ...partial } : t
                ),
            }));
            debouncedSaveToHistory(getState());
        },

        removeAdditionalText: (textId: string) => {
            setState(prev => ({
                ...prev,
                additionalTexts: prev.additionalTexts.filter(t => t.id !== textId),
            }));
            saveToHistory(getState());
        },

        // === Layer Actions ===
        moveLayerUp: (itemId: string) => {
            setState(prev => {
                const currentIndex = prev.layerOrder.indexOf(itemId);
                if (currentIndex === -1 || currentIndex === prev.layerOrder.length - 1) {
                    return prev;
                }
                const newOrder = [...prev.layerOrder];
                [newOrder[currentIndex], newOrder[currentIndex + 1]] =
                    [newOrder[currentIndex + 1], newOrder[currentIndex]];
                return { ...prev, layerOrder: newOrder };
            });
            saveToHistory(getState());
        },

        moveLayerDown: (itemId: string) => {
            setState(prev => {
                const currentIndex = prev.layerOrder.indexOf(itemId);
                if (currentIndex <= 0) {
                    return prev;
                }
                const newOrder = [...prev.layerOrder];
                [newOrder[currentIndex], newOrder[currentIndex - 1]] =
                    [newOrder[currentIndex - 1], newOrder[currentIndex]];
                return { ...prev, layerOrder: newOrder };
            });
            saveToHistory(getState());
        },

        bringToFront: (itemId: string) => {
            setState(prev => {
                const filtered = prev.layerOrder.filter(id => id !== itemId);
                return { ...prev, layerOrder: [...filtered, itemId] };
            });
            saveToHistory(getState());
        },

        sendToBack: (itemId: string) => {
            setState(prev => {
                const filtered = prev.layerOrder.filter(id => id !== itemId);
                return { ...prev, layerOrder: [itemId, ...filtered] };
            });
            saveToHistory(getState());
        },

        // === Reset ===
        handleReset: () => {
            const initialState = dreizeilenFullConfig.createInitialState({});
            setState(initialState);
            callbacks.onReset?.(undefined);
            saveToHistory(initialState);
        },
    };
},

    assets: {
        textColors: {},
    },
};
