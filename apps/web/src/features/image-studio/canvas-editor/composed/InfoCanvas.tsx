/**
 * InfoCanvas - 1:1 match with backend info_canvas.ts
 * Renders info sharepic with header, arrow, and body text
 */

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import useImage from 'use-image';
import { CanvasStage, CanvasBackground, CanvasText, CanvasImage, SnapGuidelines } from '../primitives';
import { CanvasEditorLayout } from '../layouts';
import { useCanvasSidebar } from '../sidebar';
import { useCanvasInteractions, useCanvasStoreSetup, useCanvasHistorySetup } from '../hooks';
import type { BackgroundColorOption, AssetItem } from '../sidebar/types';
import type { CanvasStageRef } from '../primitives/CanvasStage';
import { INFO_CONFIG, calculateInfoLayout } from '../utils/infoLayout';
import { useCanvasEditorStore, useSnapGuides, useSnapLines } from '../../../../stores/canvasEditorStore';
import './InfoCanvas.css';

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

export interface InfoCanvasProps {
  header: string;
  subheader?: string;
  body: string;
  alternatives?: Array<{ header?: string; subheader?: string; body?: string }>;
  onExport: (base64: string) => void;
  onSave?: (base64: string) => void;
  onCancel: () => void;
  onHeaderChange?: (header: string) => void;
  onSubheaderChange?: (subheader: string) => void;
  onBodyChange?: (body: string) => void;
}

type SelectedElement = 'header' | 'subheader' | 'body' | 'arrow' | null;

export function InfoCanvas({
  header: initialHeader,
  subheader: initialSubheader = '',
  body: initialBody,
  alternatives = [],
  onExport,
  onSave,
  onCancel,
  onHeaderChange,
  onSubheaderChange,
  onBodyChange,
}: InfoCanvasProps) {
  const config = INFO_CONFIG;
  const stageRef = useRef<CanvasStageRef>(null);

  // Shared hooks
  useCanvasStoreSetup('info', stageRef);

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

  // Local state
  const [header, setHeader] = useState(initialHeader);
  const [subheader, setSubheader] = useState(initialSubheader);
  const [body, setBody] = useState(initialBody);
  const [backgroundColor, setBackgroundColor] = useState<string>('#005538');
  const [assetVisibility, setAssetVisibility] = useState<Record<string, boolean>>({ arrow: true });
  const [customHeaderFontSize, setCustomHeaderFontSize] = useState<number | null>(null);
  const [customBodyFontSize, setCustomBodyFontSize] = useState<number | null>(null);
  const [customHeaderWidth, setCustomHeaderWidth] = useState<number | null>(null);
  const [customBodyWidth, setCustomBodyWidth] = useState<number | null>(null);
  const [arrowPos, setArrowPos] = useState<{ x: number; y: number } | null>(null);
  const [arrowSize, setArrowSize] = useState<{ w: number; h: number } | null>(null);

  const handleRestore = useCallback((state: Record<string, unknown>) => {
    if (state.header !== undefined) setHeader(state.header as string);
    if (state.subheader !== undefined) setSubheader(state.subheader as string);
    if (state.body !== undefined) setBody(state.body as string);
    if (state.backgroundColor !== undefined) setBackgroundColor(state.backgroundColor as string);
    if (state.arrowPos !== undefined) setArrowPos(state.arrowPos as { x: number; y: number } | null);
    if (state.arrowSize !== undefined) setArrowSize(state.arrowSize as { w: number; h: number } | null);
    if (state.customHeaderFontSize !== undefined) setCustomHeaderFontSize(state.customHeaderFontSize as number | null);
    if (state.customBodyFontSize !== undefined) setCustomBodyFontSize(state.customBodyFontSize as number | null);
    if (state.customHeaderWidth !== undefined) setCustomHeaderWidth(state.customHeaderWidth as number | null);
    if (state.customBodyWidth !== undefined) setCustomBodyWidth(state.customBodyWidth as number | null);
    if (state.assetVisibility !== undefined) setAssetVisibility(state.assetVisibility as Record<string, boolean>);
  }, []);

  const collectState = useCallback(() => ({
    header, subheader, body, backgroundColor, arrowPos, arrowSize,
    customHeaderFontSize, customBodyFontSize, customHeaderWidth, customBodyWidth, assetVisibility,
  }), [header, subheader, body, backgroundColor, arrowPos, arrowSize, customHeaderFontSize, customBodyFontSize, customHeaderWidth, customBodyWidth, assetVisibility]);

  const { saveToHistory, debouncedSaveToHistory, collectStateRef } = useCanvasHistorySetup(collectState, handleRestore, 500);

  // Computed values
  const headerFontSize = customHeaderFontSize ?? config.header.fontSize;
  const bodyFontSize = customBodyFontSize ?? config.body.fontSize;
  const layout = useMemo(() => calculateInfoLayout(headerFontSize, bodyFontSize), [headerFontSize, bodyFontSize]);
  const fontColor = TEXT_COLORS[backgroundColor] || '#ffffff';
  const backgroundImageSrc = BACKGROUND_IMAGES[backgroundColor];
  const [bgImage] = useImage(backgroundImageSrc, 'anonymous');
  const [arrowImage] = useImage(config.arrow.src, 'anonymous');

  const headerLineHeight = headerFontSize * config.header.lineHeightRatio;
  const estimatedHeaderHeight = headerLineHeight * 3;
  const arrowY = config.margin.headerStartY + estimatedHeaderHeight + config.header.bottomSpacing;
  const bodyY = arrowY;

  // Update element positions for snapping
  useEffect(() => {
    updateElementPosition('header', layout.header.x, layout.header.y, customHeaderWidth ?? layout.header.maxWidth, headerLineHeight * 2);
    updateElementPosition('body', layout.body.x, bodyY, customBodyWidth ?? layout.body.maxWidth, layout.body.lineHeight * 4);
    updateElementPosition('arrow', arrowPos?.x ?? config.arrow.x, arrowPos?.y ?? arrowY, arrowSize?.w ?? config.arrow.size, arrowSize?.h ?? config.arrow.size);
  }, [layout, updateElementPosition, arrowPos, arrowSize, arrowY, headerLineHeight, customHeaderWidth, customBodyWidth, bodyY, config]);

  // Element handlers
  const handleHeaderSelect = useCallback(() => setSelectedElement('header'), [setSelectedElement]);
  const handleBodySelect = useCallback(() => setSelectedElement('body'), [setSelectedElement]);
  const handleArrowSelect = useCallback(() => setSelectedElement('arrow'), [setSelectedElement]);

  const handleHeaderTextChange = useCallback((newText: string) => {
    setHeader(newText);
    onHeaderChange?.(newText);
    debouncedSaveToHistory({ ...collectStateRef.current(), header: newText });
  }, [onHeaderChange, debouncedSaveToHistory, collectStateRef]);

  const handleBodyTextChange = useCallback((newText: string) => {
    setBody(newText);
    onBodyChange?.(newText);
    debouncedSaveToHistory({ ...collectStateRef.current(), body: newText });
  }, [onBodyChange, debouncedSaveToHistory, collectStateRef]);

  const handleHeaderFontSizeChange = useCallback((fontSize: number) => setCustomHeaderFontSize(fontSize), []);
  const handleBodyFontSizeChange = useCallback((fontSize: number) => setCustomBodyFontSize(fontSize), []);
  const handleHeaderTransformEnd = useCallback((_x: number, _y: number, width: number) => setCustomHeaderWidth(width), []);
  const handleBodyTransformEnd = useCallback((_x: number, _y: number, width: number) => setCustomBodyWidth(width), []);

  const handleArrowDragEnd = useCallback((x: number, y: number) => {
    const newPos = { x, y };
    setArrowPos(newPos);
    saveToHistory({ ...collectStateRef.current(), arrowPos: newPos });
  }, [saveToHistory, collectStateRef]);

  const handleArrowTransformEnd = useCallback((x: number, y: number, w: number, h: number) => {
    const newPos = { x, y };
    const newSize = { w, h };
    setArrowPos(newPos);
    setArrowSize(newSize);
    saveToHistory({ ...collectStateRef.current(), arrowPos: newPos, arrowSize: newSize });
  }, [saveToHistory, collectStateRef]);

  const handleSelectAlternative = useCallback((alt: { header?: string; subheader?: string; body?: string }) => {
    if (alt.header) { setHeader(alt.header); onHeaderChange?.(alt.header); }
    if (alt.subheader !== undefined) { setSubheader(alt.subheader); onSubheaderChange?.(alt.subheader); }
    if (alt.body) { setBody(alt.body); onBodyChange?.(alt.body); }
    saveToHistory({ ...collectStateRef.current(), header: alt.header || header, subheader: alt.subheader || subheader, body: alt.body || body });
  }, [onHeaderChange, onSubheaderChange, onBodyChange, saveToHistory, collectStateRef, header, subheader, body]);

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
    { id: 'arrow', src: config.arrow.src, label: 'Pfeil', visible: assetVisibility.arrow },
  ], [assetVisibility, config]);

  const { tabBar, panel } = useCanvasSidebar({
    quote: header,
    name: body,
    onQuoteChange: handleHeaderTextChange,
    onNameChange: handleBodyTextChange,
    backgroundColor,
    backgroundColors: BACKGROUND_COLORS,
    onBackgroundChange: handleBackgroundChange,
    assets: sidebarAssets,
    onAssetToggle: handleAssetToggle,
    alternatives: alternatives.map(alt => alt.header || ''),
    onAlternativeSelect: (altHeader) => {
      const alt = alternatives.find(a => a.header === altHeader);
      if (alt) handleSelectAlternative(alt);
    },
    quoteFontSize: customHeaderFontSize ?? config.header.fontSize,
    nameFontSize: customBodyFontSize ?? config.body.fontSize,
    onQuoteFontSizeChange: handleHeaderFontSizeChange,
    onNameFontSizeChange: handleBodyFontSizeChange,
    onExport: handleExport,
  });

  return (
    <CanvasEditorLayout
      sidebar={panel}
      tabBar={tabBar}
      actions={null}
    >
      <div className="info-canvas-wrapper">
        <CanvasStage ref={stageRef} width={config.canvas.width} height={config.canvas.height} responsive maxContainerWidth={900} onStageClick={handleStageClick} className="info-stage">
          {bgImage ? (
            <CanvasImage id="background" image={bgImage} x={0} y={0} width={config.canvas.width} height={config.canvas.height} listening={false} />
          ) : (
            <CanvasBackground width={config.canvas.width} height={config.canvas.height} color={backgroundColor} />
          )}

          <CanvasText
            id="header-text"
            text={header}
            x={layout.header.x}
            y={layout.header.y}
            width={customHeaderWidth ?? layout.header.maxWidth}
            fontSize={customHeaderFontSize ?? layout.header.fontSize}
            fontFamily={`${config.header.fontFamily}, Arial, sans-serif`}
            fontStyle={config.header.fontStyle}
            fill={fontColor}
            align="left"
            lineHeight={config.header.lineHeightRatio}
            wrap="word"
            draggable
            editable
            selected={selectedElement === 'header'}
            onSelect={handleHeaderSelect}
            onTextChange={handleHeaderTextChange}
            onFontSizeChange={handleHeaderFontSizeChange}
            onTransformEnd={handleHeaderTransformEnd}
            stageWidth={config.canvas.width}
            stageHeight={config.canvas.height}
            onSnapChange={handleSnapChange}
            snapTargets={getSnapTargets('header-text')}
            onPositionChange={handlePositionChange}
            onSnapLinesChange={setSnapLines}
            transformConfig={{ enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right'], rotateEnabled: false, keepRatio: true, bounds: { minWidth: 200, maxWidth: layout.header.maxWidth + 100 } }}
          />

          {assetVisibility.arrow && (
            <CanvasImage
              id="arrow"
              image={arrowImage}
              x={arrowPos?.x ?? config.arrow.x}
              y={arrowPos?.y ?? arrowY}
              width={arrowSize?.w ?? config.arrow.size}
              height={arrowSize?.h ?? config.arrow.size}
              draggable
              selected={selectedElement === 'arrow'}
              onSelect={handleArrowSelect}
              onDragEnd={handleArrowDragEnd}
              onTransformEnd={handleArrowTransformEnd}
              stageWidth={config.canvas.width}
              stageHeight={config.canvas.height}
              onSnapChange={handleSnapChange}
              snapTargets={getSnapTargets('arrow')}
              onPositionChange={handlePositionChange}
              onSnapLinesChange={setSnapLines}
              transformConfig={{ keepRatio: true, bounds: { minWidth: 30, maxWidth: 120 } }}
            />
          )}

          <CanvasText
            id="body-text"
            text={body}
            x={layout.body.x}
            y={bodyY}
            width={customBodyWidth ?? layout.body.maxWidth}
            fontSize={customBodyFontSize ?? layout.body.fontSize}
            fontFamily={`${config.body.remainingFont}, Arial, sans-serif`}
            fontStyle="normal"
            fill={fontColor}
            align="left"
            lineHeight={config.body.lineHeightRatio}
            wrap="word"
            draggable
            editable
            selected={selectedElement === 'body'}
            onSelect={handleBodySelect}
            onTextChange={handleBodyTextChange}
            onFontSizeChange={handleBodyFontSizeChange}
            onTransformEnd={handleBodyTransformEnd}
            stageWidth={config.canvas.width}
            stageHeight={config.canvas.height}
            onSnapChange={handleSnapChange}
            snapTargets={getSnapTargets('body-text')}
            onPositionChange={handlePositionChange}
            onSnapLinesChange={setSnapLines}
            transformConfig={{ enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right'], rotateEnabled: false, keepRatio: true, bounds: { minWidth: 200, maxWidth: layout.body.maxWidth + 100 } }}
          />

          <SnapGuidelines showH={snapGuides.h} showV={snapGuides.v} stageWidth={config.canvas.width} stageHeight={config.canvas.height} snapLines={snapLines} />
        </CanvasStage>
      </div>
    </CanvasEditorLayout>
  );
}

export default InfoCanvas;