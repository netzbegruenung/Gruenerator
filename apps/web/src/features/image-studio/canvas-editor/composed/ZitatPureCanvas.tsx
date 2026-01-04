/**
 * ZitatPureCanvas - 1:1 match with backend zitat_pure_canvas.ts
 * Renders quote with exact same layout, colors, and positioning as backend
 */

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import useImage from 'use-image';
import { CanvasStage, CanvasBackground, CanvasText, CanvasImage, SnapGuidelines } from '../primitives';
import { CanvasEditorLayout } from '../layouts';
import { useCanvasSidebar } from '../sidebar';
import { useCanvasInteractions, useCanvasStoreSetup, useCanvasHistorySetup } from '../hooks';
import type { BackgroundColorOption, AssetItem } from '../sidebar/types';
import type { CanvasStageRef } from '../primitives/CanvasStage';
import { ZITAT_PURE_CONFIG, calculateZitatPureLayout } from '../utils/zitatPureLayout';
import {
  useCanvasEditorStore,
  useSnapGuides,
  useSnapLines,
} from '../../../../stores/canvasEditorStore';
import './ZitatPureCanvas.css';

const BACKGROUND_COLORS: BackgroundColorOption[] = [
  { id: 'green', label: 'Grün', color: '#6CCD87' },
  { id: 'sand', label: 'Sand', color: '#F5F1E9' },
];

const FONT_COLORS: Record<string, string> = {
  '#6CCD87': '#005437',
  '#F5F1E9': '#262626',
};

export interface ZitatPureCanvasProps {
  quote: string;
  name: string;
  alternatives?: string[];
  onExport: (base64: string) => void;
  onCancel: () => void;
  onQuoteChange?: (quote: string) => void;
  onNameChange?: (name: string) => void;
}

type SelectedElement = 'quote' | 'name' | 'sunflower' | 'quote-mark' | null;

export function ZitatPureCanvas({
  quote: initialQuote,
  name: initialName,
  alternatives = [],
  onExport,
  onCancel,
  onQuoteChange,
  onNameChange,
}: ZitatPureCanvasProps) {
  const stageRef = useRef<CanvasStageRef>(null);
  const config = ZITAT_PURE_CONFIG;

  // Shared hooks for common functionality
  useCanvasStoreSetup('zitat-pure', stageRef);

  const {
    selectedElement,
    setSelectedElement,
    handleStageClick,
    handleSnapChange,
    handlePositionChange,
    handleExport,
    getSnapTargets,
  } = useCanvasInteractions<SelectedElement>({ stageRef, onExport });

  // Store selectors for snap display
  const snapGuides = useSnapGuides();
  const snapLines = useSnapLines();
  const { setSnapLines, updateElementPosition } = useCanvasEditorStore();

  // Local state
  const [quote, setQuote] = useState(initialQuote);
  const [name, setName] = useState(initialName);
  const [backgroundColor, setBackgroundColor] = useState<string>(config.background.color);
  const [assetVisibility, setAssetVisibility] = useState<Record<string, boolean>>({
    sunflower: true,
    'quote-mark': true,
  });

  // Custom font sizes and widths
  const [customQuoteFontSize, setCustomQuoteFontSize] = useState<number | null>(null);
  const [customNameFontSize, setCustomNameFontSize] = useState<number | null>(null);
  const [customQuoteWidth, setCustomQuoteWidth] = useState<number | null>(null);
  const [customNameWidth, setCustomNameWidth] = useState<number | null>(null);

  // Custom image positions and sizes
  const [sunflowerPos, setSunflowerPos] = useState<{ x: number; y: number } | null>(null);
  const [sunflowerSize, setSunflowerSize] = useState<{ w: number; h: number } | null>(null);
  const [quoteMarkPos, setQuoteMarkPos] = useState<{ x: number; y: number } | null>(null);
  const [quoteMarkSize, setQuoteMarkSize] = useState<{ w: number; h: number } | null>(null);

  // State restoration callback for undo/redo
  const handleRestore = useCallback((state: Record<string, unknown>) => {
    if (state.quote !== undefined) setQuote(state.quote as string);
    if (state.name !== undefined) setName(state.name as string);
    if (state.backgroundColor !== undefined) setBackgroundColor(state.backgroundColor as string);
    if (state.sunflowerPos !== undefined) setSunflowerPos(state.sunflowerPos as { x: number; y: number } | null);
    if (state.sunflowerSize !== undefined) setSunflowerSize(state.sunflowerSize as { w: number; h: number } | null);
    if (state.quoteMarkPos !== undefined) setQuoteMarkPos(state.quoteMarkPos as { x: number; y: number } | null);
    if (state.quoteMarkSize !== undefined) setQuoteMarkSize(state.quoteMarkSize as { w: number; h: number } | null);
    if (state.customQuoteFontSize !== undefined) setCustomQuoteFontSize(state.customQuoteFontSize as number | null);
    if (state.customNameFontSize !== undefined) setCustomNameFontSize(state.customNameFontSize as number | null);
    if (state.customQuoteWidth !== undefined) setCustomQuoteWidth(state.customQuoteWidth as number | null);
    if (state.customNameWidth !== undefined) setCustomNameWidth(state.customNameWidth as number | null);
    if (state.assetVisibility !== undefined) setAssetVisibility(state.assetVisibility as Record<string, boolean>);
  }, []);

  // Collect current state for history snapshots
  const collectState = useCallback(() => ({
    quote,
    name,
    backgroundColor,
    sunflowerPos,
    sunflowerSize,
    quoteMarkPos,
    quoteMarkSize,
    customQuoteFontSize,
    customNameFontSize,
    customQuoteWidth,
    customNameWidth,
    assetVisibility,
  }), [
    quote, name, backgroundColor, sunflowerPos, sunflowerSize,
    quoteMarkPos, quoteMarkSize, customQuoteFontSize, customNameFontSize,
    customQuoteWidth, customNameWidth, assetVisibility
  ]);

  // History setup with refs pattern
  const { saveToHistory, debouncedSaveToHistory, collectStateRef } = useCanvasHistorySetup(
    collectState,
    handleRestore,
    500
  );

  // Computed values
  const fontColor = FONT_COLORS[backgroundColor] ?? config.quote.color;
  const [sunflowerImage] = useImage(config.sunflower.src);
  const [quoteMarkImage] = useImage(config.quotationMark.src);
  const layout = useMemo(() => calculateZitatPureLayout(quote), [quote]);

  // Sync props to state
  useEffect(() => { setQuote(initialQuote); }, [initialQuote]);
  useEffect(() => { setName(initialName); }, [initialName]);

  // Initialize element positions for snapping
  useEffect(() => {
    updateElementPosition('quote-text', config.quote.x, layout.quoteY, config.quote.maxWidth, layout.quoteFontSize * 1.2 * 3);
    updateElementPosition('name-text', config.author.x, layout.authorY, config.quote.maxWidth, layout.authorFontSize * 1.2);
    updateElementPosition('sunflower', sunflowerPos?.x ?? config.sunflower.x, sunflowerPos?.y ?? config.sunflower.y, sunflowerSize?.w ?? config.sunflower.size, sunflowerSize?.h ?? config.sunflower.size);
    updateElementPosition('quote-mark', quoteMarkPos?.x ?? config.quotationMark.x, quoteMarkPos?.y ?? layout.quoteMarkY, quoteMarkSize?.w ?? config.quotationMark.size, quoteMarkSize?.h ?? config.quotationMark.size);
  }, [layout, updateElementPosition, sunflowerPos, sunflowerSize, quoteMarkPos, quoteMarkSize, config]);

  // Element handlers
  const handleQuoteSelect = useCallback(() => setSelectedElement('quote'), [setSelectedElement]);
  const handleNameSelect = useCallback(() => setSelectedElement('name'), [setSelectedElement]);
  const handleSunflowerSelect = useCallback(() => setSelectedElement('sunflower'), [setSelectedElement]);
  const handleQuoteMarkSelect = useCallback(() => setSelectedElement('quote-mark'), [setSelectedElement]);

  const handleQuoteTextChange = useCallback((newText: string) => {
    setQuote(newText);
    onQuoteChange?.(newText);
    debouncedSaveToHistory({ ...collectStateRef.current(), quote: newText });
  }, [onQuoteChange, debouncedSaveToHistory, collectStateRef]);

  const handleNameTextChange = useCallback((newText: string) => {
    setName(newText);
    onNameChange?.(newText);
    debouncedSaveToHistory({ ...collectStateRef.current(), name: newText });
  }, [onNameChange, debouncedSaveToHistory, collectStateRef]);

  const handleQuoteFontSizeChange = useCallback((fontSize: number) => setCustomQuoteFontSize(fontSize), []);
  const handleNameFontSizeChange = useCallback((fontSize: number) => setCustomNameFontSize(fontSize), []);
  const handleQuoteTransformEnd = useCallback((_x: number, _y: number, width: number) => setCustomQuoteWidth(width), []);
  const handleNameTransformEnd = useCallback((_x: number, _y: number, width: number) => setCustomNameWidth(width), []);

  const handleSunflowerDragEnd = useCallback((x: number, y: number) => {
    const newPos = { x, y };
    setSunflowerPos(newPos);
    saveToHistory({ ...collectStateRef.current(), sunflowerPos: newPos });
  }, [saveToHistory, collectStateRef]);

  const handleQuoteMarkDragEnd = useCallback((x: number, y: number) => {
    const newPos = { x, y };
    setQuoteMarkPos(newPos);
    saveToHistory({ ...collectStateRef.current(), quoteMarkPos: newPos });
  }, [saveToHistory, collectStateRef]);

  const handleSunflowerTransformEnd = useCallback((x: number, y: number, w: number, h: number) => {
    const newPos = { x, y };
    const newSize = { w, h };
    setSunflowerPos(newPos);
    setSunflowerSize(newSize);
    saveToHistory({ ...collectStateRef.current(), sunflowerPos: newPos, sunflowerSize: newSize });
  }, [saveToHistory, collectStateRef]);

  const handleQuoteMarkTransformEnd = useCallback((x: number, y: number, w: number, h: number) => {
    const newPos = { x, y };
    const newSize = { w, h };
    setQuoteMarkPos(newPos);
    setQuoteMarkSize(newSize);
    saveToHistory({ ...collectStateRef.current(), quoteMarkPos: newPos, quoteMarkSize: newSize });
  }, [saveToHistory, collectStateRef]);

  const handleSelectAlternative = useCallback((alt: string) => {
    setQuote(alt);
    onQuoteChange?.(alt);
    saveToHistory({ ...collectStateRef.current(), quote: alt });
  }, [onQuoteChange, saveToHistory, collectStateRef]);

  const handleBackgroundChange = useCallback((color: string) => {
    setBackgroundColor(color);
    saveToHistory({ ...collectStateRef.current(), backgroundColor: color });
  }, [saveToHistory, collectStateRef]);

  const handleAssetToggle = useCallback((assetId: string, visible: boolean) => {
    const newVisibility = { ...collectStateRef.current().assetVisibility as Record<string, boolean>, [assetId]: visible };
    setAssetVisibility(newVisibility);
    saveToHistory({ ...collectStateRef.current(), assetVisibility: newVisibility });
  }, [saveToHistory, collectStateRef]);

  const sidebarAssets: AssetItem[] = useMemo(() => [
    { id: 'sunflower', src: config.sunflower.src, label: 'Sonnenblume', visible: assetVisibility.sunflower },
    { id: 'quote-mark', src: config.quotationMark.src, label: 'Anführungszeichen', visible: assetVisibility['quote-mark'] },
  ], [assetVisibility, config]);

  const { tabBar, panel } = useCanvasSidebar({
    quote,
    name,
    onQuoteChange: handleQuoteTextChange,
    onNameChange: handleNameTextChange,
    backgroundColor,
    backgroundColors: BACKGROUND_COLORS,
    onBackgroundChange: handleBackgroundChange,
    assets: sidebarAssets,
    onAssetToggle: handleAssetToggle,
    alternatives,
    onAlternativeSelect: handleSelectAlternative,
    quoteFontSize: customQuoteFontSize ?? layout.quoteFontSize,
    nameFontSize: customNameFontSize ?? layout.authorFontSize,
    onQuoteFontSizeChange: handleQuoteFontSizeChange,
    onNameFontSizeChange: handleNameFontSizeChange,
  });

  return (
    <CanvasEditorLayout
      sidebar={panel}
      tabBar={tabBar}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onCancel}>Abbrechen</button>
          <button className="btn btn-primary" onClick={handleExport}>Fertig</button>
        </>
      }
    >
      <div className="zitat-pure-canvas-wrapper">
        <CanvasStage
          ref={stageRef}
          width={config.canvas.width}
          height={config.canvas.height}
          responsive
          maxContainerWidth={900}
          onStageClick={handleStageClick}
          className="zitat-pure-stage"
        >
          <CanvasBackground width={config.canvas.width} height={config.canvas.height} color={backgroundColor} />

          {assetVisibility.sunflower && (
            <CanvasImage
              id="sunflower"
              image={sunflowerImage}
              x={sunflowerPos?.x ?? config.sunflower.x}
              y={sunflowerPos?.y ?? config.sunflower.y}
              width={sunflowerSize?.w ?? config.sunflower.size}
              height={sunflowerSize?.h ?? config.sunflower.size}
              opacity={config.sunflower.opacity}
              draggable
              selected={selectedElement === 'sunflower'}
              onSelect={handleSunflowerSelect}
              onDragEnd={handleSunflowerDragEnd}
              onTransformEnd={handleSunflowerTransformEnd}
              stageWidth={config.canvas.width}
              stageHeight={config.canvas.height}
              onSnapChange={handleSnapChange}
              snapTargets={getSnapTargets('sunflower')}
              onPositionChange={handlePositionChange}
              onSnapLinesChange={setSnapLines}
              transformConfig={{ keepRatio: true, bounds: { minWidth: 50, maxWidth: 400 } }}
            />
          )}

          {assetVisibility['quote-mark'] && (
            <CanvasImage
              id="quote-mark"
              image={quoteMarkImage}
              x={quoteMarkPos?.x ?? config.quotationMark.x}
              y={quoteMarkPos?.y ?? layout.quoteMarkY}
              width={quoteMarkSize?.w ?? config.quotationMark.size}
              height={quoteMarkSize?.h ?? config.quotationMark.size}
              draggable
              selected={selectedElement === 'quote-mark'}
              onSelect={handleQuoteMarkSelect}
              onDragEnd={handleQuoteMarkDragEnd}
              onTransformEnd={handleQuoteMarkTransformEnd}
              stageWidth={config.canvas.width}
              stageHeight={config.canvas.height}
              onSnapChange={handleSnapChange}
              snapTargets={getSnapTargets('quote-mark')}
              onPositionChange={handlePositionChange}
              onSnapLinesChange={setSnapLines}
              transformConfig={{ keepRatio: true, bounds: { minWidth: 30, maxWidth: 200 } }}
            />
          )}

          <CanvasText
            id="quote-text"
            text={quote}
            x={config.quote.x}
            y={layout.quoteY}
            width={customQuoteWidth ?? config.quote.maxWidth}
            fontSize={customQuoteFontSize ?? layout.quoteFontSize}
            fontFamily={`${config.quote.fontFamily}, Arial, sans-serif`}
            fontStyle={config.quote.fontStyle}
            fill={fontColor}
            align={config.quote.textAlign}
            lineHeight={config.quote.lineHeight}
            wrap="word"
            draggable
            editable
            selected={selectedElement === 'quote'}
            onSelect={handleQuoteSelect}
            onTextChange={handleQuoteTextChange}
            onFontSizeChange={handleQuoteFontSizeChange}
            onTransformEnd={handleQuoteTransformEnd}
            stageWidth={config.canvas.width}
            stageHeight={config.canvas.height}
            onSnapChange={handleSnapChange}
            snapTargets={getSnapTargets('quote-text')}
            onPositionChange={handlePositionChange}
            onSnapLinesChange={setSnapLines}
            transformConfig={{
              enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right'],
              rotateEnabled: false,
              keepRatio: true,
              bounds: { minWidth: 200, maxWidth: config.quote.maxWidth + 100 },
            }}
          />

          <CanvasText
            id="name-text"
            text={name}
            x={config.author.x}
            y={layout.authorY}
            width={customNameWidth ?? config.quote.maxWidth}
            fontSize={customNameFontSize ?? layout.authorFontSize}
            fontFamily={`${config.author.fontFamily}, Arial, sans-serif`}
            fontStyle={config.author.fontStyle}
            fill={fontColor}
            align={config.author.textAlign}
            lineHeight={1.2}
            wrap="none"
            draggable
            editable
            selected={selectedElement === 'name'}
            onSelect={handleNameSelect}
            onTextChange={handleNameTextChange}
            onFontSizeChange={handleNameFontSizeChange}
            onTransformEnd={handleNameTransformEnd}
            stageWidth={config.canvas.width}
            stageHeight={config.canvas.height}
            onSnapChange={handleSnapChange}
            snapTargets={getSnapTargets('name-text')}
            onPositionChange={handlePositionChange}
            onSnapLinesChange={setSnapLines}
            transformConfig={{
              enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right'],
              rotateEnabled: false,
              keepRatio: true,
              bounds: { minWidth: 100, maxWidth: config.quote.maxWidth },
            }}
          />

          <SnapGuidelines showH={snapGuides.h} showV={snapGuides.v} stageWidth={config.canvas.width} stageHeight={config.canvas.height} snapLines={snapLines} />
        </CanvasStage>
      </div>
    </CanvasEditorLayout>
  );
}

export default ZitatPureCanvas;