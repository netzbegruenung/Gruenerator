/**
 * ZitatCanvas - Quote with Image Background
 * 1:1 match with backend zitat_canvas.ts
 */

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Rect, Group } from 'react-konva';
import useImage from 'use-image';
import { CanvasStage, CanvasText, CanvasImage, SnapGuidelines } from '../primitives';
import { CanvasEditorLayout } from '../layouts';
import { useCanvasInteractions, useCanvasStoreSetup, useCanvasHistorySetup, useImageCoverFit } from '../hooks';
import type { AssetItem, SidebarTabId, SidebarTab } from '../sidebar/types';
import type { CanvasStageRef } from '../primitives/CanvasStage';
import { ZITAT_CONFIG, calculateZitatLayout } from '../utils/zitatLayout';
import { useCanvasEditorStore, useSnapGuides, useSnapLines } from '../../../../stores/canvasEditorStore';
import { TextSection, FontSizeSection, AssetsSection, AlternativesSection, ImageSection, GradientSection } from '../sidebar/sections';
import { SidebarTabBar, SidebarPanel } from '../sidebar';
import { HiPhotograph, HiAdjustments, HiSparkles } from 'react-icons/hi';
import { PiTextT, PiTextAa } from 'react-icons/pi';
import './ZitatCanvas.css';

export interface ZitatCanvasProps {
  quote: string;
  name: string;
  imageSrc: string;
  alternatives?: string[];
  onExport: (base64: string) => void;
  onSave?: (base64: string) => void;
  onCancel: () => void;
  onQuoteChange?: (quote: string) => void;
  onNameChange?: (name: string) => void;
}

type SelectedElement = 'quote' | 'name' | 'background' | 'quote-mark' | null;

export function ZitatCanvas({
  quote: initialQuote,
  name: initialName,
  imageSrc,
  alternatives = [],
  onExport,
  onSave,
  onCancel,
  onQuoteChange,
  onNameChange,
}: ZitatCanvasProps) {
  const stageRef = useRef<CanvasStageRef>(null);
  const config = ZITAT_CONFIG;

  // Shared hooks
  useCanvasStoreSetup('zitat', stageRef);

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
  const [quote, setQuote] = useState(initialQuote);
  const [name, setName] = useState(initialName);

  // ... (skipping unchanged lines in thought block, but replace requires exact match)
  // Wait, I can't skip lines in replacement content if I target a large block.
  // I should split this into smaller edits.


  // Background image state
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [imageScale, setImageScale] = useState(1);

  // Gradient state
  const [gradientEnabled, setGradientEnabled] = useState(true);
  const [gradientOpacity, setGradientOpacity] = useState(config.gradient.bottomOpacity);

  // Asset visibility
  const [assetVisibility, setAssetVisibility] = useState<Record<string, boolean>>({ 'quote-mark': true });

  // Custom font sizes and widths
  const [customQuoteFontSize, setCustomQuoteFontSize] = useState<number | null>(null);
  const [customNameFontSize, setCustomNameFontSize] = useState<number | null>(null);
  const [customQuoteWidth, setCustomQuoteWidth] = useState<number | null>(null);
  const [customNameWidth, setCustomNameWidth] = useState<number | null>(null);

  // Custom image positions
  const [quoteMarkPos, setQuoteMarkPos] = useState<{ x: number; y: number } | null>(null);
  const [quoteMarkSize, setQuoteMarkSize] = useState<{ w: number; h: number } | null>(null);

  // Sidebar state
  const [activeTab, setActiveTab] = useState<SidebarTabId | null>('text');
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' && window.innerWidth >= 900
  );

  const handleTabClick = useCallback((tabId: SidebarTabId) => {
    setActiveTab((current) => (current === tabId ? null : tabId));
  }, []);

  const handlePanelClose = useCallback(() => {
    setActiveTab(null);
  }, []);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // State restoration callback
  const handleRestore = useCallback((state: Record<string, unknown>) => {
    if (state.quote !== undefined) setQuote(state.quote as string);
    if (state.name !== undefined) setName(state.name as string);
    if (state.imageOffset !== undefined) setImageOffset(state.imageOffset as { x: number; y: number });
    if (state.imageScale !== undefined) setImageScale(state.imageScale as number);
    if (state.gradientEnabled !== undefined) setGradientEnabled(state.gradientEnabled as boolean);
    if (state.gradientOpacity !== undefined) setGradientOpacity(state.gradientOpacity as number);
    if (state.quoteMarkPos !== undefined) setQuoteMarkPos(state.quoteMarkPos as { x: number; y: number } | null);
    if (state.quoteMarkSize !== undefined) setQuoteMarkSize(state.quoteMarkSize as { w: number; h: number } | null);
    if (state.customQuoteFontSize !== undefined) setCustomQuoteFontSize(state.customQuoteFontSize as number | null);
    if (state.customNameFontSize !== undefined) setCustomNameFontSize(state.customNameFontSize as number | null);
    if (state.customQuoteWidth !== undefined) setCustomQuoteWidth(state.customQuoteWidth as number | null);
    if (state.customNameWidth !== undefined) setCustomNameWidth(state.customNameWidth as number | null);
    if (state.assetVisibility !== undefined) setAssetVisibility(state.assetVisibility as Record<string, boolean>);
  }, []);

  const collectState = useCallback(() => ({
    quote, name, imageOffset, imageScale, gradientEnabled, gradientOpacity,
    quoteMarkPos, quoteMarkSize, customQuoteFontSize, customNameFontSize,
    customQuoteWidth, customNameWidth, assetVisibility,
  }), [quote, name, imageOffset, imageScale, gradientEnabled, gradientOpacity, quoteMarkPos, quoteMarkSize, customQuoteFontSize, customNameFontSize, customQuoteWidth, customNameWidth, assetVisibility]);

  const { saveToHistory, debouncedSaveToHistory, collectStateRef } = useCanvasHistorySetup(collectState, handleRestore, 500);

  // Load images
  const [backgroundImage] = useImage(imageSrc, 'anonymous');
  const [quoteMarkImage] = useImage(config.quotationMark.src);

  // Calculate layout and image dimensions
  const fontSize = customQuoteFontSize ?? config.quote.fontSize;
  const layout = useMemo(() => calculateZitatLayout(quote, fontSize), [quote, fontSize]);
  const bgImageDimensions = useImageCoverFit(backgroundImage, config.canvas.width, config.canvas.height, imageScale);

  // Sync with props
  useEffect(() => { setQuote(initialQuote); }, [initialQuote]);
  useEffect(() => { setName(initialName); }, [initialName]);

  // Initialize element positions for snapping
  useEffect(() => {
    updateElementPosition('quote-text', config.quote.x, layout.quoteY, config.quote.maxWidth, layout.quoteFontSize * 1.2 * 3);
    updateElementPosition('name-text', config.author.x, layout.authorY, config.quote.maxWidth, layout.authorFontSize * 1.2);
    updateElementPosition('quote-mark', quoteMarkPos?.x ?? config.quotationMark.x, quoteMarkPos?.y ?? layout.quoteMarkY, quoteMarkSize?.w ?? layout.quoteMarkSize, quoteMarkSize?.h ?? layout.quoteMarkSize);
  }, [layout, updateElementPosition, quoteMarkPos, quoteMarkSize, config]);

  // Background image handlers
  const handleBackgroundSelect = useCallback(() => setSelectedElement('background'), [setSelectedElement]);
  const handleBackgroundDragEnd = useCallback((x: number, y: number) => {
    const newOffset = { x, y };
    setImageOffset(newOffset);
    saveToHistory({ ...collectStateRef.current(), imageOffset: newOffset });
  }, [saveToHistory, collectStateRef]);

  const handleImageScaleChange = useCallback((scale: number) => {
    setImageScale(scale);
    saveToHistory({ ...collectStateRef.current(), imageScale: scale });
  }, [saveToHistory, collectStateRef]);

  const handleImageReset = useCallback(() => {
    setImageOffset({ x: 0, y: 0 });
    setImageScale(1);
    saveToHistory({ ...collectStateRef.current(), imageOffset: { x: 0, y: 0 }, imageScale: 1 });
  }, [saveToHistory, collectStateRef]);

  // Gradient handlers
  const handleGradientToggle = useCallback((enabled: boolean) => {
    setGradientEnabled(enabled);
    saveToHistory({ ...collectStateRef.current(), gradientEnabled: enabled });
  }, [saveToHistory, collectStateRef]);

  const handleGradientOpacityChange = useCallback((opacity: number) => {
    setGradientOpacity(opacity);
    saveToHistory({ ...collectStateRef.current(), gradientOpacity: opacity });
  }, [saveToHistory, collectStateRef]);

  // Text handlers
  const handleQuoteSelect = useCallback(() => setSelectedElement('quote'), [setSelectedElement]);
  const handleNameSelect = useCallback(() => setSelectedElement('name'), [setSelectedElement]);

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

  const handleQuoteFontSizeChange = useCallback((size: number) => setCustomQuoteFontSize(size), []);
  const handleNameFontSizeChange = useCallback((size: number) => setCustomNameFontSize(size), []);
  const handleQuoteTransformEnd = useCallback((_x: number, _y: number, width: number) => setCustomQuoteWidth(width), []);
  const handleNameTransformEnd = useCallback((_x: number, _y: number, width: number) => setCustomNameWidth(width), []);

  // Quote mark handlers
  const handleQuoteMarkSelect = useCallback(() => setSelectedElement('quote-mark'), [setSelectedElement]);

  const handleQuoteMarkDragEnd = useCallback((x: number, y: number) => {
    const newPos = { x, y };
    setQuoteMarkPos(newPos);
    saveToHistory({ ...collectStateRef.current(), quoteMarkPos: newPos });
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

  const handleAssetToggle = useCallback((assetId: string, visible: boolean) => {
    const newVisibility = { ...collectStateRef.current().assetVisibility as Record<string, boolean>, [assetId]: visible };
    setAssetVisibility(newVisibility);
    saveToHistory({ ...collectStateRef.current(), assetVisibility: newVisibility });
  }, [saveToHistory, collectStateRef]);

  // Sidebar configuration
  const sidebarAssets: AssetItem[] = useMemo(() => [
    { id: 'quote-mark', src: config.quotationMark.src, label: 'Anführungszeichen', visible: assetVisibility['quote-mark'] },
  ], [assetVisibility, config]);

  const allTabs: SidebarTab[] = useMemo(() => [
    { id: 'text', icon: PiTextT, label: 'Text', ariaLabel: 'Text bearbeiten' },
    { id: 'fontsize', icon: PiTextAa, label: 'Schriftgröße', ariaLabel: 'Schriftgröße anpassen' },
    { id: 'image', icon: HiPhotograph, label: 'Bild', ariaLabel: 'Bild anpassen' },
    { id: 'gradient', icon: HiAdjustments, label: 'Gradient', ariaLabel: 'Gradient anpassen' },
    { id: 'alternatives', icon: HiSparkles, label: 'Alternativen', ariaLabel: 'Alternative Zitate' },
  ], []);

  const visibleTabs = useMemo(() =>
    isDesktop ? allTabs.filter(t => t.id !== 'fontsize') : allTabs,
    [isDesktop, allTabs]
  );

  const disabledTabs = useMemo(() => alternatives.length === 0 ? ['alternatives'] as SidebarTabId[] : [], [alternatives]);

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'text':
        return (
          <>
            <TextSection quote={quote} name={name} onQuoteChange={handleQuoteTextChange} onNameChange={handleNameTextChange} />
            {isDesktop && (
              <FontSizeSection quoteFontSize={customQuoteFontSize ?? layout.quoteFontSize} nameFontSize={customNameFontSize ?? layout.authorFontSize} onQuoteFontSizeChange={handleQuoteFontSizeChange} onNameFontSizeChange={handleNameFontSizeChange} />
            )}
          </>
        );
      case 'fontsize': return <FontSizeSection quoteFontSize={customQuoteFontSize ?? layout.quoteFontSize} nameFontSize={customNameFontSize ?? layout.authorFontSize} onQuoteFontSizeChange={handleQuoteFontSizeChange} onNameFontSizeChange={handleNameFontSizeChange} onExport={handleExport} />;
      case 'image': return <ImageSection scale={imageScale} onScaleChange={handleImageScaleChange} onReset={handleImageReset} />;
      case 'gradient': return <GradientSection enabled={gradientEnabled} onToggle={handleGradientToggle} opacity={gradientOpacity} onOpacityChange={handleGradientOpacityChange} />;
      case 'assets': return <AssetsSection assets={sidebarAssets} onAssetToggle={handleAssetToggle} />;
      case 'alternatives': return <AlternativesSection alternatives={alternatives} currentQuote={quote} onAlternativeSelect={handleSelectAlternative} />;
      default: return null;
    }
  };

  const tabBar = <SidebarTabBar tabs={visibleTabs} activeTab={activeTab} onTabClick={handleTabClick} disabledTabs={disabledTabs} onExport={handleExport} onSave={handleSave} />;
  const panel = <SidebarPanel isOpen={activeTab !== null} onClose={handlePanelClose}>{renderActivePanel()}</SidebarPanel>;

  return (
    <CanvasEditorLayout
      sidebar={panel}
      tabBar={tabBar}
      actions={null}
    >
      <div className="zitat-canvas-wrapper">
        <CanvasStage ref={stageRef} width={config.canvas.width} height={config.canvas.height} responsive maxContainerWidth={900} onStageClick={handleStageClick} className="zitat-stage">
          <Group clipFunc={(ctx) => { ctx.rect(0, 0, config.canvas.width, config.canvas.height); }}>
            {backgroundImage && bgImageDimensions && (
              <CanvasImage
                id="background-image"
                image={backgroundImage}
                x={imageOffset.x + (config.canvas.width - bgImageDimensions.displayWidth) / 2}
                y={imageOffset.y + (config.canvas.height - bgImageDimensions.displayHeight) / 2}
                width={bgImageDimensions.displayWidth}
                height={bgImageDimensions.displayHeight}
                draggable
                selected={selectedElement === 'background'}
                onSelect={handleBackgroundSelect}
                onDragEnd={handleBackgroundDragEnd}
                stageWidth={config.canvas.width}
                stageHeight={config.canvas.height}
                transformConfig={{ enabledAnchors: [], rotateEnabled: false }}
              />
            )}
          </Group>

          {gradientEnabled && (
            <Rect
              x={0} y={0}
              width={config.canvas.width}
              height={config.canvas.height}
              fillLinearGradientStartPoint={{ x: 0, y: 0 }}
              fillLinearGradientEndPoint={{ x: 0, y: config.canvas.height }}
              fillLinearGradientColorStops={[0, `rgba(0, 0, 0, ${config.gradient.topOpacity})`, 1, `rgba(0, 0, 0, ${gradientOpacity})`]}
              listening={false}
            />
          )}

          {assetVisibility['quote-mark'] && (
            <CanvasImage
              id="quote-mark"
              image={quoteMarkImage}
              x={quoteMarkPos?.x ?? config.quotationMark.x}
              y={quoteMarkPos?.y ?? layout.quoteMarkY}
              width={quoteMarkSize?.w ?? layout.quoteMarkSize}
              height={quoteMarkSize?.h ?? layout.quoteMarkSize}
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
            fill={config.quote.color}
            align={config.quote.textAlign}
            lineHeight={config.quote.lineHeightRatio}
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
            transformConfig={{ enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right'], rotateEnabled: false, keepRatio: true, bounds: { minWidth: 200, maxWidth: config.quote.maxWidth + 100 } }}
          />

          <CanvasText
            id="name-text"
            text={name}
            x={config.author.x}
            y={layout.authorY}
            width={customNameWidth ?? config.quote.maxWidth}
            fontSize={customNameFontSize ?? layout.authorFontSize}
            fontFamily={`${config.quote.fontFamily}, Arial, sans-serif`}
            fontStyle={config.quote.fontStyle}
            fill={config.author.color}
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
            transformConfig={{ enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right'], rotateEnabled: false, keepRatio: true, bounds: { minWidth: 100, maxWidth: config.quote.maxWidth } }}
          />

          <SnapGuidelines showH={snapGuides.h} showV={snapGuides.v} stageWidth={config.canvas.width} stageHeight={config.canvas.height} snapLines={snapLines} />
        </CanvasStage>
      </div>
    </CanvasEditorLayout>
  );
}

export default ZitatCanvas;