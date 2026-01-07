/**
 * DreizeilenCanvas - 1:1 match with backend dreizeilen_canvas.ts
 * Renders 3-line slogan with skewed parallelogram bars
 */

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import useImage from 'use-image';
import { Group, Line, Text, Rect, Transformer } from 'react-konva';
import type Konva from 'konva';

import { CanvasStage, CanvasImage, SnapGuidelines, CanvasText } from '../primitives';
import { IconPrimitive } from '../primitives/IconPrimitive';
import { ShapePrimitive } from '../primitives/ShapePrimitive';
import { FloatingTapBar } from '../components/FloatingTapBar/FloatingTapBar';
import { FloatingColorPicker } from '../components/FloatingTapBar/modules/FloatingColorPicker';
import { FloatingLayerControls } from '../components/FloatingTapBar/modules/FloatingLayerControls';
import { FloatingOpacityControl } from '../components/FloatingTapBar/modules/FloatingOpacityControl';
import { FloatingFontSizeControl } from '../components/FloatingTapBar/modules/FloatingFontSizeControl';
import { calculateElementSnapPosition } from '../utils/snapping';
import { createShape } from '../utils/shapes';
import type { ShapeInstance, ShapeType } from '../utils/shapes';

import { GenericCanvasEditor } from '../components/GenericCanvasEditor';
import { dreizeilenConfig } from '../configs/dreizeilen.config';
import type { DreizeilenAlternative } from '../sidebar/sections/dreizeilen';
import type { AdditionalText } from '../configs/types';
import { useCanvasInteractions, useCanvasStoreSetup, useCanvasHistorySetup, useImageCoverFit } from '../hooks';
import type { CanvasStageRef } from '../primitives/CanvasStage';
import { DREIZEILEN_CONFIG, calculateDreizeilenLayout, getColorScheme, COLORS, calculateParallelogramPoints, flattenPoints } from '../utils/dreizeilenLayout';
import { ALL_ASSETS, CANVAS_RECOMMENDED_ASSETS } from '../utils/canvasAssets';
import { useCanvasEditorStore, useSnapGuides, useSnapLines } from '../../../../stores/canvasEditorStore';
import { PiTextT } from 'react-icons/pi';
import { HiSparkles, HiPhotograph } from 'react-icons/hi';
import { GiSunflower } from 'react-icons/gi';
import { BalkenIcon } from '../icons';
import './DreizeilenCanvas.css';

export type { DreizeilenAlternative } from '../sidebar/sections/dreizeilen';

export interface DreizeilenState {
  line1: string;
  line2: string;
  line3: string;
  colorSchemeId: string;
  fontSize: number;
  sunflowerPos: { x: number; y: number } | null;
  sunflowerSize: { w: number; h: number } | null;
  sunflowerVisible: boolean;
  sunflowerOpacity: number;
  balkenOpacity: number;
  imageOffset: { x: number; y: number };
  imageScale: number;
  balkenOffset: { x: number; y: number };
  balkenScale: number;
  balkenWidthScale: number;
  barOffsets: [number, number, number];
  currentImageSrc?: string;
  // Icons & Shapes
  selectedIcons: string[];
  iconStates: Record<string, { x: number; y: number; scale: number; rotation: number; color?: string; opacity?: number }>;
  shapeInstances: ShapeInstance[];
  selectedShapeId: string | null;
  layerOrder: string[];
  additionalTexts: AdditionalText[];
}

export interface DreizeilenCanvasProps {
  line1: string;
  line2: string;
  line3: string;
  imageSrc?: string;
  alternatives?: DreizeilenAlternative[];
  onExport: (base64: string) => void;
  onSave?: (base64: string) => void;
  onCancel: () => void;
  onLine1Change?: (line: string) => void;
  onLine2Change?: (line: string) => void;
  onLine3Change?: (line: string) => void;
  onImageSrcChange?: (src: string) => void;
  onStateChange?: (state: DreizeilenState) => void;
}

type SelectedElement = 'sunflower' | 'background' | 'balken' | 'icon' | 'shape' | null;


export function DreizeilenCanvas({
  line1: initialLine1,
  line2: initialLine2,
  line3: initialLine3,
  imageSrc,
  alternatives = [],
  onExport,
  onSave,
  onCancel,
  onLine1Change,
  onLine2Change,
  onLine3Change,
  onImageSrcChange,
}: DreizeilenCanvasProps) {
  const config = DREIZEILEN_CONFIG;
  const stageRef = useRef<CanvasStageRef>(null);
  const balkenGroupRef = useRef<Konva.Group>(null);
  const balkenTransformerRef = useRef<Konva.Transformer>(null);

  // Shared hooks
  useCanvasStoreSetup('dreizeilen', stageRef);

  const {
    selectedElement,
    setSelectedElement,
    handleStageClick,
    handleSnapChange,
    handlePositionChange,
    handleExport,
    handleSave,
    getSnapTargets,
  } = useCanvasInteractions<SelectedElement>({ stageRef, onExport, onSave });

  const snapGuides = useSnapGuides();
  const snapLines = useSnapLines();
  const { setSnapLines, updateElementPosition } = useCanvasEditorStore();

  // Content state
  const [line1, setLine1] = useState(initialLine1);
  const [line2, setLine2] = useState(initialLine2);
  const [line3, setLine3] = useState(initialLine3);
  const [colorSchemeId, setColorSchemeId] = useState('tanne-sand');
  const [fontSize, setFontSize] = useState<number>(config.text.defaultFontSize);
  const [sunflowerPos, setSunflowerPos] = useState<{ x: number; y: number } | null>(null);
  const [sunflowerSize, setSunflowerSize] = useState<{ w: number; h: number } | null>(null);
  const [sunflowerVisible, setSunflowerVisible] = useState(true);
  const [sunflowerOpacity, setSunflowerOpacity] = useState(1);
  const [balkenOpacity, setBalkenOpacity] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [imageScale, setImageScale] = useState(1);
  const [balkenOffset, setBalkenOffset] = useState({ x: 0, y: 0 });
  const [balkenScale, setBalkenScale] = useState<number>(1.0);
  const [balkenWidthScale, setBalkenWidthScale] = useState<number>(1.0);
  const [barOffsets, setBarOffsets] = useState<[number, number, number]>([0, 0, 0]);
  const [currentImageSrc, setCurrentImageSrc] = useState(imageSrc);
  const [fontLoaded, setFontLoaded] = useState(false);
  const [selectedIcons, setSelectedIcons] = useState<string[]>([]);
  const [iconStates, setIconStates] = useState<Record<string, { x: number; y: number; scale: number; rotation: number; color?: string; opacity?: number }>>({});
  const [shapeInstances, setShapeInstances] = useState<ShapeInstance[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [layerOrder, setLayerOrder] = useState<string[]>([]);
  const [additionalTexts, setAdditionalTexts] = useState<AdditionalText[]>([]);

  // Wait for GrueneTypeNeue font to load before calculating layout
  useEffect(() => {
    if (typeof document === 'undefined') {
      setFontLoaded(true);
      return;
    }

    let cancelled = false;

    const loadFont = async () => {
      try {
        const fontSpec = `${config.text.defaultFontSize}px ${config.text.fontFamily}`;
        await document.fonts.load(fontSpec, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
        await document.fonts.ready;
        if (!cancelled) setFontLoaded(true);
      } catch (error) {
        console.warn('Font loading failed, polling:', error);
        const fontSpec = `${config.text.defaultFontSize}px ${config.text.fontFamily}`;
        let attempts = 0;
        const maxAttempts = 30;
        const poll = () => {
          if (cancelled) return;
          attempts++;
          if (document.fonts.check(fontSpec) || attempts >= maxAttempts) {
            setFontLoaded(true);
          } else {
            setTimeout(poll, 50);
          }
        };
        poll();
      }
    };
    loadFont();
    return () => { cancelled = true; };
  }, [config.text.fontFamily, config.text.defaultFontSize]);

  const handleRestore = useCallback((state: Record<string, unknown>) => {
    if (state.line1 !== undefined) setLine1(state.line1 as string);
    if (state.line2 !== undefined) setLine2(state.line2 as string);
    if (state.line3 !== undefined) setLine3(state.line3 as string);
    if (state.colorSchemeId !== undefined) setColorSchemeId(state.colorSchemeId as string);
    if (state.fontSize !== undefined) setFontSize(state.fontSize as number);
    if (state.sunflowerPos !== undefined) setSunflowerPos(state.sunflowerPos as { x: number; y: number } | null);
    if (state.sunflowerSize !== undefined) setSunflowerSize(state.sunflowerSize as { w: number; h: number } | null);
    if (state.sunflowerVisible !== undefined) setSunflowerVisible(state.sunflowerVisible as boolean);
    if (state.sunflowerOpacity !== undefined) setSunflowerOpacity(state.sunflowerOpacity as number);
    if (state.balkenOpacity !== undefined) setBalkenOpacity(state.balkenOpacity as number);
    if (state.imageOffset !== undefined) setImageOffset(state.imageOffset as { x: number; y: number });
    if (state.imageScale !== undefined) setImageScale(state.imageScale as number);
    if (state.balkenOffset !== undefined) setBalkenOffset(state.balkenOffset as { x: number; y: number });
    if (state.balkenScale !== undefined) setBalkenScale(state.balkenScale as number);
    if (state.balkenWidthScale !== undefined) setBalkenWidthScale(state.balkenWidthScale as number);
    if (state.barOffsets !== undefined) setBarOffsets(state.barOffsets as [number, number, number]);
    if (state.currentImageSrc !== undefined) setCurrentImageSrc(state.currentImageSrc as string);
    if (state.selectedIcons !== undefined) setSelectedIcons(state.selectedIcons as string[]);
    if (state.iconStates !== undefined) setIconStates(state.iconStates as any);
    if (state.shapeInstances !== undefined) setShapeInstances(state.shapeInstances as any);
    if (state.selectedShapeId !== undefined) setSelectedShapeId(state.selectedShapeId as string | null);
    if (state.layerOrder !== undefined) setLayerOrder(state.layerOrder as string[]);
    if (state.additionalTexts !== undefined) setAdditionalTexts(state.additionalTexts as AdditionalText[]);
  }, []);

  const collectState = useCallback(() => {
    return {
      line1, line2, line3, colorSchemeId, fontSize, sunflowerPos, sunflowerSize,
      sunflowerVisible,
      sunflowerOpacity,
      balkenOpacity,
      imageOffset,
      imageScale,
      balkenOffset,
      balkenScale,
      balkenWidthScale,
      barOffsets,
      currentImageSrc,
      selectedIcons,
      iconStates,
      shapeInstances,
      selectedShapeId,
      layerOrder: layerOrder || [],
      additionalTexts: additionalTexts || [],
    };
  }, [
    line1, line2, line3, colorSchemeId, fontSize, sunflowerPos, sunflowerSize,
    sunflowerVisible, sunflowerOpacity, balkenOpacity, imageOffset, imageScale,
    balkenOffset, balkenScale, balkenWidthScale, barOffsets, currentImageSrc,
    selectedIcons, iconStates, shapeInstances, selectedShapeId, layerOrder, additionalTexts
  ]);

  const { saveToHistory, debouncedSaveToHistory, collectStateRef } = useCanvasHistorySetup(collectState, handleRestore, 500);

  // Computed values
  const layout = useMemo(() => {
    if (!fontLoaded) {
      return {
        balkenLayouts: [],
        textBlockBounds: { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 },
        sunflowerSize: 0,
        sunflowerDefaultPos: { x: 0, y: 0 },
      };
    }
    return calculateDreizeilenLayout([line1, line2, line3], fontSize, config.defaults.balkenOffset, config.defaults.balkenGruppenOffset, config.canvas.width, config.canvas.height, balkenWidthScale);
  }, [line1, line2, line3, fontSize, config.defaults.balkenOffset, config.defaults.balkenGruppenOffset, config.canvas.width, config.canvas.height, balkenWidthScale, fontLoaded]);

  const colorScheme = useMemo(() => getColorScheme(colorSchemeId), [colorSchemeId]);
  const [sunflowerImage] = useImage(config.sunflower.src, 'anonymous');
  const [backgroundImage] = useImage(currentImageSrc || '', 'anonymous');
  const hasBackgroundImage = !!currentImageSrc && !!backgroundImage;
  const bgImageDimensions = useImageCoverFit(backgroundImage, config.canvas.width, config.canvas.height, imageScale);

  // Snapping update
  useEffect(() => {
    if (layout.sunflowerSize > 0) {
      updateElementPosition('sunflower', sunflowerPos?.x ?? layout.sunflowerDefaultPos.x, sunflowerPos?.y ?? layout.sunflowerDefaultPos.y, sunflowerSize?.w ?? layout.sunflowerSize, sunflowerSize?.h ?? layout.sunflowerSize);
    }
  }, [layout, updateElementPosition, sunflowerPos, sunflowerSize]);

  // Actions
  const handleLine1Change = useCallback((newText: string) => {
    setLine1(newText);
    onLine1Change?.(newText);
    debouncedSaveToHistory({ ...collectStateRef.current(), line1: newText });
  }, [onLine1Change, debouncedSaveToHistory, collectStateRef]);

  const handleLine2Change = useCallback((newText: string) => {
    setLine2(newText);
    onLine2Change?.(newText);
    debouncedSaveToHistory({ ...collectStateRef.current(), line2: newText });
  }, [onLine2Change, debouncedSaveToHistory, collectStateRef]);

  const handleLine3Change = useCallback((newText: string) => {
    setLine3(newText);
    onLine3Change?.(newText);
    debouncedSaveToHistory({ ...collectStateRef.current(), line3: newText });
  }, [onLine3Change, debouncedSaveToHistory, collectStateRef]);

  const handleFontSizeChange = useCallback((newSize: number) => {
    setFontSize(newSize);
    debouncedSaveToHistory({ ...collectStateRef.current(), fontSize: newSize });
  }, [debouncedSaveToHistory, collectStateRef]);

  const handleColorSchemeChange = useCallback((schemeId: string) => {
    setColorSchemeId(schemeId);
    saveToHistory({ ...collectStateRef.current(), colorSchemeId: schemeId });
  }, [saveToHistory, collectStateRef]);

  const handleSunflowerSelect = useCallback(() => setSelectedElement('sunflower'), [setSelectedElement]);
  const handleSunflowerDragEnd = useCallback((x: number, y: number) => {
    const newPos = { x, y };
    setSunflowerPos(newPos);
    saveToHistory({ ...collectStateRef.current(), sunflowerPos: newPos });
  }, [saveToHistory, collectStateRef]);

  const handleSunflowerTransformEnd = useCallback((x: number, y: number, w: number, h: number) => {
    const newPos = { x, y };
    const newSize = { w, h };
    setSunflowerPos(newPos);
    setSunflowerSize(newSize);
    saveToHistory({ ...collectStateRef.current(), sunflowerPos: newPos, sunflowerSize: newSize });
  }, [saveToHistory, collectStateRef]);

  const handleAssetToggle = useCallback((assetId: string, visible: boolean) => {
    if (assetId === 'sunflower') {
      setSunflowerVisible(visible);
      saveToHistory({ ...collectStateRef.current(), sunflowerVisible: visible });
    }
  }, [saveToHistory, collectStateRef]);

  const handleToggleIcon = useCallback((iconId: string, selected: boolean) => {
    setSelectedIcons(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(iconId);
        // Init state if needed
        if (!iconStates[iconId]) {
          const newState = {
            ...iconStates,
            [iconId]: {
              x: config.canvas.width / 2,
              y: config.canvas.height / 2,
              scale: 1,
              rotation: 0,
              color: '#005538'
            }
          };
          setIconStates(newState);
        }
      } else {
        next.delete(iconId);
      }
      return Array.from(next);
    });
    // Save history handled by useCanvasHistory's atomic updates if we used that pattern, 
    // but here we manually save. Ideally we batch updates.
    // Simplifying for now.
    setTimeout(() => saveToHistory(collectStateRef.current()), 0);
  }, [iconStates, config.canvas.width, config.canvas.height, saveToHistory, collectStateRef]);

  const handleIconUpdate = useCallback((id: string, partial: any) => {
    setIconStates(prev => ({
      ...prev,
      [id]: { ...prev[id], ...partial }
    }));
    debouncedSaveToHistory({ ...collectStateRef.current(), iconStates: { ...iconStates, [id]: { ...iconStates[id], ...partial } } });
  }, [debouncedSaveToHistory, collectStateRef, iconStates]);

  const handleAddShape = useCallback((type: ShapeType) => {
    const newShape = createShape(type, config.canvas.width / 2, config.canvas.height / 2, '#316049');
    setShapeInstances(prev => [...prev, newShape]);
    setSelectedShapeId(newShape.id);
    saveToHistory({ ...collectStateRef.current(), shapeInstances: [...shapeInstances, newShape] });
  }, [config.canvas.width, config.canvas.height, saveToHistory, collectStateRef, shapeInstances]);

  const handleUpdateShape = useCallback((id: string, partial: Partial<ShapeInstance>) => {
    setShapeInstances(prev => prev.map(s => s.id === id ? { ...s, ...partial } : s));
    debouncedSaveToHistory({ ...collectStateRef.current() }); // Warning: capture fresh state?
  }, [debouncedSaveToHistory, collectStateRef]);

  // Additional Text Actions
  const handleAddHeader = useCallback(() => {
    const id = `text-${Date.now()}`;
    const newText: AdditionalText = {
      id,
      text: 'Neue Überschrift',
      type: 'header',
      x: config.canvas.width / 2,
      y: config.canvas.height / 2,
      width: 400,
      fontSize: 60,
      fontFamily: `${config.text.fontFamily}, Arial, sans-serif`,
      fontStyle: 'bold',
      fill: '#005538',
      rotation: 0,
      scale: 1,
      opacity: 1,
    };
    setAdditionalTexts(prev => [...prev, newText]);
    saveToHistory({ ...collectStateRef.current(), additionalTexts: [...additionalTexts, newText] });
  }, [saveToHistory, collectStateRef, additionalTexts, config]);

  const handleAddText = useCallback(() => {
    const id = `text-${Date.now()}`;
    const newText: AdditionalText = {
      id,
      text: 'Neuer Text',
      type: 'body',
      x: config.canvas.width / 2,
      y: config.canvas.height / 2 + 100,
      width: 400,
      fontSize: 30,
      fontFamily: `${config.text.fontFamily}, Arial, sans-serif`,
      fontStyle: 'normal',
      fill: '#005538',
      rotation: 0,
      scale: 1,
      opacity: 1,
    };
    setAdditionalTexts(prev => [...prev, newText]);
    saveToHistory({ ...collectStateRef.current(), additionalTexts: [...additionalTexts, newText] });
  }, [saveToHistory, collectStateRef, additionalTexts, config]);

  const handleUpdateAdditionalText = useCallback((id: string, partial: Partial<AdditionalText>) => {
    setAdditionalTexts(prev => prev.map(t => t.id === id ? { ...t, ...partial } : t));
    debouncedSaveToHistory({ ...collectStateRef.current() });
  }, [debouncedSaveToHistory, collectStateRef]);

  const handleRemoveAdditionalText = useCallback((id: string) => {
    setAdditionalTexts(prev => prev.filter(t => t.id !== id));
    saveToHistory({ ...collectStateRef.current() });
  }, [saveToHistory, collectStateRef]);

  // Floating Bar Logic
  const activeFloatingModule = useMemo(() => {
    // Check shape
    if (selectedShapeId) {
      const shape = shapeInstances.find(s => s.id === selectedShapeId);
      if (shape) return { type: 'shape', data: shape };
    }
    // Check icon (last selected?)
    // This logic is a bit simple, 'selectedElement' in GenericCanvas was explicit. 
    // Here we need to know WHICH icon is selected.
    // 'selectedElement' hook state tracks 'icon' string, but not WHICH icon.
    // We need to track 'selectedIconId' separately or imply it.
    // For now, let's skip floating bar for icons unless we add selectedIconId state.
    // BUT! IconPrimitive has `onSelect={() => setSelectedElement('icon')}`.
    // It implies we need a way to know WHICH one.
    // GenericCanvas uses `selectedElement` === id logic. 
    // Here `selectedElement` is a type string.
    // We should probably change `selectedElement` to be the ID string!
    return null;
  }, [selectedShapeId, shapeInstances]);

  // FIX: We need robust selection state. 
  // In GenericCanvas, selectedElement is the ID string.
  // In DreizeilenCanvas, selectedElement is the TYPE string ('balken', 'background').
  // We need to align this or handle it.
  // Let's stick to current pattern for now and add `focusedItemId` state for icons/shapes.
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);

  const handleActiveColorChange = useCallback((color: string) => {
    if (activeFloatingModule?.type === 'shape' && selectedShapeId) {
      handleUpdateShape(selectedShapeId, { fill: color });
    }
    // logic for icon...
    if (focusedItemId && selectedIcons.includes(focusedItemId)) {
      handleIconUpdate(focusedItemId, { color });
    }
  }, [activeFloatingModule, selectedShapeId, handleUpdateShape, focusedItemId, selectedIcons, handleIconUpdate]);


  const handleBackgroundSelect = useCallback(() => setSelectedElement('background'), [setSelectedElement]);
  const handleBackgroundDragEnd = useCallback((x: number, y: number) => {
    if (!bgImageDimensions) return;
    const centerX = (config.canvas.width - bgImageDimensions.displayWidth) / 2;
    const centerY = (config.canvas.height - bgImageDimensions.displayHeight) / 2;
    const newOffset = { x: x - centerX, y: y - centerY };
    setImageOffset(newOffset);
    saveToHistory({ ...collectStateRef.current(), imageOffset: newOffset });
  }, [bgImageDimensions, config.canvas.width, config.canvas.height, saveToHistory, collectStateRef]);

  const handleImageScaleChange = useCallback((scale: number) => {
    setImageScale(scale);
    debouncedSaveToHistory({ ...collectStateRef.current(), imageScale: scale });
  }, [debouncedSaveToHistory, collectStateRef]);

  const handleBackgroundImageChange = useCallback((file: File | null, objectUrl?: string) => {
    if (objectUrl) {
      setCurrentImageSrc(objectUrl);
      onImageSrcChange?.(objectUrl);
      saveToHistory({ ...collectStateRef.current(), currentImageSrc: objectUrl });
    }
  }, [onImageSrcChange, saveToHistory, collectStateRef]);

  const handleBalkenSelect = useCallback(() => { setSelectedElement('balken'); }, [setSelectedElement]);

  const handleBalkenDragEnd = useCallback((x: number, y: number) => {
    const newOffset = { x, y };
    setBalkenOffset(newOffset);
    handleSnapChange(false, false);
    setSnapLines([]);
    saveToHistory({ ...collectStateRef.current(), balkenOffset: newOffset });
  }, [saveToHistory, collectStateRef, handleSnapChange, setSnapLines]);

  const handleBalkenDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target as Konva.Group;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const contentLeft = layout.textBlockBounds.left * scaleX;
    const contentTop = layout.textBlockBounds.top * scaleY;
    const contentWidth = layout.textBlockBounds.width * scaleX;
    const contentHeight = layout.textBlockBounds.height * scaleY;
    const currentAbsX = node.x() + contentLeft;
    const currentAbsY = node.y() + contentTop;

    const result = calculateElementSnapPosition(
      currentAbsX, currentAbsY, contentWidth, contentHeight,
      getSnapTargets('balken'), config.canvas.width, config.canvas.height
    );

    node.position({ x: result.x - contentLeft, y: result.y - contentTop });
    handleSnapChange(result.snapH, result.snapV);
    setSnapLines(result.snapLines);
  }, [layout, config, getSnapTargets, handleSnapChange, setSnapLines]);

  const handleBalkenWidthScaleChange = useCallback((scale: number) => {
    setBalkenWidthScale(scale);
    debouncedSaveToHistory({ ...collectStateRef.current(), balkenWidthScale: scale });
  }, [debouncedSaveToHistory, collectStateRef]);

  const handleBarOffsetChange = useCallback((index: number, offset: number) => {
    const newOffsets: [number, number, number] = [...barOffsets] as [number, number, number];
    newOffsets[index] = offset;
    setBarOffsets(newOffsets);
    debouncedSaveToHistory({ ...collectStateRef.current(), barOffsets: newOffsets });
  }, [barOffsets, debouncedSaveToHistory, collectStateRef]);

  const handleBalkenTransformEnd = useCallback(() => {
    const node = balkenGroupRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const newScale = Math.max(scaleX, scaleY);
    node.scaleX(1);
    node.scaleY(1);
    const newOffset = { x: node.x(), y: node.y() };
    setBalkenOffset(newOffset);
    setBalkenScale(newScale);
    saveToHistory({ ...collectStateRef.current(), balkenOffset: newOffset, balkenScale: newScale });
  }, [saveToHistory, collectStateRef]);

  useEffect(() => {
    if (selectedElement === 'balken' && balkenGroupRef.current && balkenTransformerRef.current) {
      balkenTransformerRef.current.nodes([balkenGroupRef.current]);
      balkenTransformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedElement]);

  const handleSelectAlternative = useCallback((alt: DreizeilenAlternative) => {
    if (alt.line1 !== undefined) { setLine1(alt.line1); onLine1Change?.(alt.line1); }
    if (alt.line2 !== undefined) { setLine2(alt.line2); onLine2Change?.(alt.line2); }
    if (alt.line3 !== undefined) { setLine3(alt.line3); onLine3Change?.(alt.line3); }
    saveToHistory({ ...collectStateRef.current(), line1: alt.line1 ?? line1, line2: alt.line2 ?? line2, line3: alt.line3 ?? line3 });
  }, [onLine1Change, onLine2Change, onLine3Change, saveToHistory, collectStateRef, line1, line2, line3]);

  const handleReset = useCallback(() => {
    setBalkenWidthScale(1);
    setBalkenScale(1);
    setBalkenOffset({ x: 0, y: 0 });
    setBarOffsets([0, 0, 0]);
    saveToHistory({ ...collectStateRef.current(), balkenWidthScale: 1, balkenScale: 1, balkenOffset: { x: 0, y: 0 }, barOffsets: [0, 0, 0] });
  }, [saveToHistory, collectStateRef]);

  // Actions object to pass to GenericCanvasEditor
  const actions = useMemo(() => ({
    setLine1: handleLine1Change,
    setLine2: handleLine2Change,
    setLine3: handleLine3Change,
    setFontSize: handleFontSizeChange,
    setColorSchemeId: handleColorSchemeChange,
    setBalkenWidthScale: handleBalkenWidthScaleChange,
    setBarOffsets: (offsets: [number, number, number]) => {
      // Assuming logic is handled inside parent or we just pass the new offset array
      // But wait, the config calls setBarOffsets with the array directly? 
      // Actually in config I wrote a wrapper to handle index.
      setBarOffsets(offsets);
      debouncedSaveToHistory({ ...collectStateRef.current(), barOffsets: offsets });
    },
    setSunflowerVisible: (visible: boolean) => handleAssetToggle('sunflower', visible),
    setCurrentImageSrc: handleBackgroundImageChange as any, // TS might complain about signature mismatch if not careful
    setImageScale: handleImageScaleChange,
    handleReset,
    handleSelectAlternative,
    handleAssetToggle,
    toggleIcon: handleToggleIcon,
    addShape: handleAddShape,
    // Text Actions
    addHeader: handleAddHeader,
    addText: handleAddText,
    updateAdditionalText: handleUpdateAdditionalText,
    removeAdditionalText: handleRemoveAdditionalText,
  }), [handleLine1Change, handleLine2Change, handleLine3Change, handleFontSizeChange, handleColorSchemeChange, handleBalkenWidthScaleChange, handleReset, handleSelectAlternative, handleAssetToggle, handleToggleIcon, handleAddShape, handleBackgroundImageChange, handleImageScaleChange, debouncedSaveToHistory, collectStateRef, handleAddHeader, handleAddText, handleUpdateAdditionalText, handleRemoveAdditionalText]);

  const state = {
    line1, line2, line3, colorSchemeId, fontSize, sunflowerPos, sunflowerSize, sunflowerVisible,
    sunflowerOpacity, balkenOpacity,
    imageOffset, imageScale, balkenOffset, balkenScale, balkenWidthScale, barOffsets, currentImageSrc,
    selectedIcons, iconStates, shapeInstances, selectedShapeId, layerOrder, additionalTexts
  };

  const sunflowerWidth = sunflowerSize?.w ?? layout.sunflowerSize;
  const sunflowerHeight = sunflowerSize?.h ?? layout.sunflowerSize;
  const sunflowerX = sunflowerPos?.x ?? layout.sunflowerDefaultPos.x;
  const sunflowerY = sunflowerPos?.y ?? layout.sunflowerDefaultPos.y;

  // Unified Render List
  const canvasItems = useMemo(() => {
    const items: { id: string; type: 'background' | 'sunflower' | 'balken' | 'icon' | 'shape' | 'additional-text'; data?: any }[] = [];

    // Background
    items.push({ id: 'background', type: 'background' });

    // Sunflower
    if (sunflowerVisible) {
      items.push({ id: 'sunflower', type: 'sunflower' });
    }

    // Balken (Group)
    if (layout.balkenLayouts.length > 0) {
      items.push({ id: 'balken', type: 'balken' });
    }

    // Icons
    selectedIcons.forEach(id => items.push({ id, type: 'icon' }));

    // Shapes
    shapeInstances.forEach(s => items.push({ id: s.id, type: 'shape', data: s }));

    // Additional Texts
    additionalTexts.forEach(t => items.push({ id: t.id, type: 'additional-text', data: t }));

    return items;
  }, [sunflowerVisible, layout.balkenLayouts.length, selectedIcons, shapeInstances, additionalTexts]);

  const sortedRenderList = useMemo(() => {
    const currentOrder = layerOrder.length > 0 ? layerOrder : []; // Default empty means implicit order?
    // If empty, we start with implicit order: Background, Sunflower, Balken, Icons, Shapes
    // Or we verify if ID is in list.

    const pendingItems = [...canvasItems];
    const result: typeof canvasItems = [];

    // Add ordered items
    currentOrder.forEach(id => {
      const idx = pendingItems.findIndex(i => i.id === id);
      if (idx !== -1) {
        result.push(pendingItems[idx]);
        pendingItems.splice(idx, 1);
      }
    });

    // Append remaining (e.g. newly added)
    result.push(...pendingItems);

    return result;
  }, [canvasItems, layerOrder]);

  const handleMoveLayer = useCallback((direction: 'up' | 'down') => {
    const itemId = focusedItemId || (selectedElement === 'background' || selectedElement === 'sunflower' || selectedElement === 'balken' ? selectedElement : null);

    if (!itemId) return;

    const currentOrder = layerOrder.length > 0 ? [...layerOrder] : sortedRenderList.map(i => i.id);
    const currentIndex = currentOrder.indexOf(itemId);

    if (currentIndex === -1) {
      // If we haven't tracked it yet, initializes.
      // But we should be careful. 
      // If layerOrder was empty, we just populated it via sortedRenderList map above physically? No.
      // We need to set it.
    }

    const newOrder = [...currentOrder];

    if (direction === 'up') {
      if (currentIndex < newOrder.length - 1) {
        [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];
      }
    } else {
      if (currentIndex > 0) {
        [newOrder[currentIndex], newOrder[currentIndex - 1]] = [newOrder[currentIndex - 1], newOrder[currentIndex]];
      }
    }

    setLayerOrder(newOrder);
    saveToHistory({ ...collectStateRef.current(), layerOrder: newOrder });
  }, [focusedItemId, selectedElement, layerOrder, sortedRenderList, saveToHistory, collectStateRef]);

  const canMoveUp = useMemo(() => {
    const itemId = focusedItemId || (selectedElement === 'background' || selectedElement === 'sunflower' || selectedElement === 'balken' ? selectedElement : null);
    if (!itemId) return false;
    const idx = sortedRenderList.findIndex(i => i.id === itemId);
    return idx !== -1 && idx < sortedRenderList.length - 1;
  }, [focusedItemId, selectedElement, sortedRenderList]);

  const canMoveDown = useMemo(() => {
    const itemId = focusedItemId || (selectedElement === 'background' || selectedElement === 'sunflower' || selectedElement === 'balken' ? selectedElement : null);
    if (!itemId) return false;
    const idx = sortedRenderList.findIndex(i => i.id === itemId);
    return idx > 0;
  }, [focusedItemId, selectedElement, sortedRenderList]);

  return (
    <GenericCanvasEditor
      config={dreizeilenConfig}
      state={state}
      actions={actions}
      onExport={handleExport}
      onSave={handleSave}
    >
      <div className="dreizeilen-canvas-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {(focusedItemId || additionalTexts.some(t => t.id === selectedElement)) && (
          <FloatingTapBar visible={true}>
            {/* Color Picker for Icon, Shape, or Additional Text */}
            <FloatingColorPicker
              currentColor={
                shapeInstances.find(s => s.id === focusedItemId)?.fill ||
                iconStates[focusedItemId || '']?.color ||
                additionalTexts.find(t => t.id === selectedElement)?.fill ||
                '#000000'
              }
              onColorSelect={(color) => {
                if (focusedItemId) {
                  handleActiveColorChange?.(color);
                } else if (selectedElement) {
                  handleUpdateAdditionalText(selectedElement as string, { fill: color });
                }
              }}
            />
            <div className="floating-separator" />

            {/* Font Size for Additional Text */}
            {additionalTexts.find(t => t.id === selectedElement) && (
              <>
                <FloatingFontSizeControl
                  fontSize={additionalTexts.find(t => t.id === selectedElement)?.fontSize || 24}
                  onFontSizeChange={(size) => handleUpdateAdditionalText(selectedElement as string, { fontSize: size })}
                />
                <div className="floating-separator" />
              </>
            )}

            <FloatingOpacityControl
              opacity={
                shapeInstances.find(s => s.id === focusedItemId)?.opacity ??
                iconStates[focusedItemId || '']?.opacity ??
                additionalTexts.find(t => t.id === selectedElement)?.opacity ??
                1
              }
              onOpacityChange={(val) => {
                if (focusedItemId) {
                  if (selectedIcons.includes(focusedItemId!)) {
                    handleIconUpdate(focusedItemId!, { opacity: val });
                  } else {
                    handleUpdateShape(focusedItemId!, { opacity: val });
                  }
                } else if (selectedElement) {
                  handleUpdateAdditionalText(selectedElement as string, { opacity: val });
                }
              }}
            />
            <div className="floating-separator" />
            <FloatingLayerControls
              onMoveUp={() => handleMoveLayer('up')}
              onMoveDown={() => handleMoveLayer('down')}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
            />
          </FloatingTapBar>
        )}
        { /* Layer controls for non-icon/shape items (e.g. background, balken, sunflower) if selected */}
        {!focusedItemId && (selectedElement === 'balken' || selectedElement === 'sunflower' || selectedElement === 'background') && (
          <FloatingTapBar visible={true}>
            {selectedElement === 'sunflower' && (
              <>
                <FloatingOpacityControl
                  opacity={sunflowerOpacity}
                  onOpacityChange={(val) => {
                    setSunflowerOpacity(val);
                    saveToHistory({ ...collectStateRef.current(), sunflowerOpacity: val });
                  }}
                />
                <div className="floating-separator" />
              </>
            )}
            {selectedElement === 'balken' && (
              <>
                <FloatingOpacityControl
                  opacity={balkenOpacity}
                  onOpacityChange={(val) => {
                    setBalkenOpacity(val);
                    saveToHistory({ ...collectStateRef.current(), balkenOpacity: val });
                  }}
                />
                <div className="floating-separator" />
              </>
            )}
            <FloatingLayerControls
              onMoveUp={() => handleMoveLayer('up')}
              onMoveDown={() => handleMoveLayer('down')}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
            />
          </FloatingTapBar>
        )}
        <CanvasStage ref={stageRef} width={config.canvas.width} height={config.canvas.height} responsive maxContainerWidth={900} onStageClick={(e) => { handleStageClick(e); setFocusedItemId(null); }} className="dreizeilen-stage">

          {/* Unified Render Loop */}
          {sortedRenderList.map(item => {
            if (item.type === 'background') {
              return hasBackgroundImage && bgImageDimensions ? (
                <Group key="bg-group" clipFunc={(ctx) => { ctx.rect(0, 0, config.canvas.width, config.canvas.height); }}>
                  <CanvasImage id="background-image" image={backgroundImage} x={imageOffset.x + (config.canvas.width - bgImageDimensions.displayWidth) / 2} y={imageOffset.y + (config.canvas.height - bgImageDimensions.displayHeight) / 2} width={bgImageDimensions.displayWidth} height={bgImageDimensions.displayHeight} draggable selected={selectedElement === 'background'} onSelect={handleBackgroundSelect} onDragEnd={handleBackgroundDragEnd} stageWidth={config.canvas.width} stageHeight={config.canvas.height} transformConfig={{ enabledAnchors: [], rotateEnabled: false }} />
                </Group>
              ) : (
                <Rect key="bg-rect" x={0} y={0} width={config.canvas.width} height={config.canvas.height} fill={COLORS.SAND} listening={false} />
              );
            }

            if (item.type === 'sunflower') {
              return sunflowerImage && layout.sunflowerSize > 0 && (
                <CanvasImage key="sunflower" id="sunflower" image={sunflowerImage} x={sunflowerX} y={sunflowerY} width={sunflowerWidth} height={sunflowerHeight} opacity={sunflowerOpacity} draggable selected={selectedElement === 'sunflower'} onSelect={handleSunflowerSelect} onDragEnd={handleSunflowerDragEnd} onTransformEnd={handleSunflowerTransformEnd} stageWidth={config.canvas.width} stageHeight={config.canvas.height} onSnapChange={handleSnapChange} snapTargets={getSnapTargets('sunflower')} onPositionChange={handlePositionChange} onSnapLinesChange={setSnapLines} transformConfig={{ keepRatio: true, bounds: { minWidth: 50, maxWidth: 600 } }} />
              );
            }

            if (item.type === 'balken') {
              return (
                <Group
                  key="balken-group"
                  ref={balkenGroupRef}
                  x={balkenOffset.x}
                  y={balkenOffset.y}
                  scaleX={balkenScale}
                  scaleY={balkenScale}
                  draggable
                  onDragMove={handleBalkenDragMove}
                  onClick={handleBalkenSelect}
                  onTap={handleBalkenSelect}
                  onDragEnd={(e) => handleBalkenDragEnd(e.target.x(), e.target.y())}
                  onTransformEnd={handleBalkenTransformEnd}
                >
                  {layout.balkenLayouts.map((balken, index) => {
                    const colorPair = colorScheme.colors[balken.lineIndex];
                    const individualOffset = barOffsets[index] ?? 0;
                    const adjustedX = balken.x + individualOffset;
                    const points = calculateParallelogramPoints(adjustedX, balken.y, balken.width, balken.height);
                    const skewRad = (config.balken.skewAngle * Math.PI) / 180;
                    const skewOffset = (balken.height * Math.tan(skewRad)) / 2;

                    return (
                      <Group key={balken.lineIndex} opacity={balkenOpacity}>
                        <Line points={flattenPoints(points)} closed fill={colorPair.background} />
                        <Text text={balken.text} x={adjustedX + skewOffset / 2} y={balken.y} width={balken.width} height={balken.height} fontSize={fontSize} fontFamily={`${config.text.fontFamily}, Arial, sans-serif`} fill={colorPair.text} align="center" verticalAlign="middle" listening={false} />
                      </Group>
                    );
                  })}
                  {selectedElement === 'balken' && layout.balkenLayouts.length > 0 && (
                    <Rect
                      x={layout.textBlockBounds.left - 4}
                      y={layout.textBlockBounds.top - 4}
                      width={layout.textBlockBounds.width + 8}
                      height={layout.textBlockBounds.height + 8}
                      stroke="#0066ff"
                      strokeWidth={2}
                      dash={[5, 5]}
                      listening={false}
                    />
                  )}
                </Group>
              );
            }

            if (item.type === 'icon') {
              const iconId = item.id;
              const state = iconStates[iconId];
              if (!state) return null;
              return (
                <IconPrimitive
                  key={iconId}
                  id={iconId}
                  icon={iconId as any}
                  x={state.x}
                  y={state.y}
                  scale={state.scale}
                  rotation={state.rotation}
                  color={state.color || '#005538'}
                  selected={focusedItemId === iconId}
                  onSelect={() => { setSelectedElement('icon'); setFocusedItemId(iconId); }}
                  onTransformEnd={(x, y, scale, rotation) => handleIconUpdate(iconId, { x, y, scale, rotation })}
                  onDragEnd={(x, y) => { handleIconUpdate(iconId, { x, y }); saveToHistory(collectStateRef.current()); }}
                />
              );
            }

            if (item.type === 'shape') {
              const shape = item.data as ShapeInstance;
              return (
                <ShapePrimitive
                  key={shape.id}
                  shape={shape}
                  draggable
                  isSelected={focusedItemId === shape.id}
                  onSelect={() => { setSelectedElement('shape'); setFocusedItemId(shape.id); }}
                  onChange={(newAttrs) => handleUpdateShape(shape.id, newAttrs)}
                />
              );
            }

            if (item.type === 'additional-text') {
              const textItem = item.data as AdditionalText;
              return (
                <CanvasText
                  key={textItem.id}
                  id={textItem.id}
                  text={textItem.text}
                  x={textItem.x}
                  y={textItem.y}
                  width={textItem.width}
                  fontSize={textItem.fontSize}
                  fontFamily={textItem.fontFamily}
                  fontStyle={(textItem.fontStyle || 'normal') as 'normal' | 'bold' | 'italic' | 'bold italic'}
                  fill={textItem.fill}
                  rotation={textItem.rotation || 0}
                  scaleX={textItem.scale || 1}
                  scaleY={textItem.scale || 1}
                  draggable
                  opacity={textItem.opacity ?? 1}
                  selected={selectedElement === textItem.id} // GenericCanvas uses just ID for text
                  onSelect={() => setSelectedElement(textItem.id as any)}
                  onDragEnd={(x, y) => {
                    handleUpdateAdditionalText(textItem.id, { x, y });
                    saveToHistory(collectStateRef.current());
                  }}
                  onTransformEnd={(x, y, w, h, rotation) => {
                    handleUpdateAdditionalText(textItem.id, { x, y, width: w, rotation });
                    saveToHistory(collectStateRef.current());
                  }}
                  editable
                  onTextChange={(newText) => {
                    handleUpdateAdditionalText(textItem.id, { text: newText });
                    saveToHistory(collectStateRef.current());
                  }}
                  // Snapping
                  onSnapChange={handleSnapChange}
                  onSnapLinesChange={setSnapLines}
                  snapTargets={getSnapTargets(textItem.id)} // Might need to ensure 'textItem.id' is not filtered out or add support
                  stageWidth={config.canvas.width}
                  stageHeight={config.canvas.height}
                />
              );
            }
            return null;
            return null;
          })}

          {selectedElement === 'balken' && (
            <Transformer
              ref={balkenTransformerRef}
              keepRatio={true}
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              boundBoxFunc={(oldBox, newBox) => {
                const minSize = 100;
                const maxSize = 2000;
                if (newBox.width < minSize || newBox.height < minSize) return oldBox;
                if (newBox.width > maxSize || newBox.height > maxSize) return oldBox;
                return newBox;
              }}
            />
          )}
        </CanvasStage>
      </div>
    </GenericCanvasEditor >
  );
}
export default DreizeilenCanvas;