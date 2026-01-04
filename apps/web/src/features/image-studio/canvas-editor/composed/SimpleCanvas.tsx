/**
 * SimpleCanvas - Text auf Bild (Headline + Subtext on Background Image)
 * 1:1 match with backend simple_canvas.ts
 */

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Rect, Group } from 'react-konva';
import useImage from 'use-image';
import { CanvasStage, CanvasText, CanvasImage, SnapGuidelines } from '../primitives';
import { CanvasEditorLayout } from '../layouts';
import { useCanvasInteractions, useCanvasStoreSetup, useCanvasHistorySetup, useImageCoverFit } from '../hooks';
import type { SidebarTabId, SidebarTab } from '../sidebar/types';
import type { CanvasStageRef } from '../primitives/CanvasStage';
import { SIMPLE_CONFIG, calculateSimpleLayout } from '../utils/simpleLayout';
import { useCanvasEditorStore, useSnapGuides, useSnapLines } from '../../../../stores/canvasEditorStore';
import { ImageSection, GradientSection } from '../sidebar/sections';
import { FaMinus, FaPlus } from 'react-icons/fa';
import { SidebarTabBar, SidebarPanel } from '../sidebar';
import { HiPhotograph, HiAdjustments } from 'react-icons/hi';
import { PiTextT, PiTextAa } from 'react-icons/pi';
import './SimpleCanvas.css';

export interface SimpleCanvasProps {
  headline: string;
  subtext: string;
  imageSrc: string;
  onExport: (base64: string) => void;
  onCancel: () => void;
  onHeadlineChange?: (headline: string) => void;
  onSubtextChange?: (subtext: string) => void;
}

type SelectedElement = 'headline' | 'subtext' | 'background' | null;

export function SimpleCanvas({
  headline: initialHeadline,
  subtext: initialSubtext,
  imageSrc,
  onExport,
  onCancel,
  onHeadlineChange,
  onSubtextChange,
}: SimpleCanvasProps) {
  const stageRef = useRef<CanvasStageRef>(null);
  const config = SIMPLE_CONFIG;

  useCanvasStoreSetup('simple', stageRef);

  const {
    selectedElement,
    setSelectedElement,
    handleStageClick,
    handleSnapChange,
    handlePositionChange,
    handleExport,
    getSnapTargets,
  } = useCanvasInteractions<SelectedElement>({ stageRef, onExport });

  const snapGuides = useSnapGuides();
  const snapLines = useSnapLines();
  const { setSnapLines, updateElementPosition } = useCanvasEditorStore();

  // Content state
  const [headline, setHeadline] = useState(initialHeadline);
  const [subtext, setSubtext] = useState(initialSubtext);

  // Background image state
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [imageScale, setImageScale] = useState(1);

  // Gradient state
  const [gradientEnabled, setGradientEnabled] = useState(true);
  const [gradientOpacity, setGradientOpacity] = useState(config.gradient.bottomOpacity);

  // Custom font sizes and widths
  const [customHeadlineFontSize, setCustomHeadlineFontSize] = useState<number | null>(null);
  const [customSubtextFontSize, setCustomSubtextFontSize] = useState<number | null>(null);
  const [customHeadlineWidth, setCustomHeadlineWidth] = useState<number | null>(null);
  const [customSubtextWidth, setCustomSubtextWidth] = useState<number | null>(null);

  // Sidebar state
  const [activeTab, setActiveTab] = useState<SidebarTabId | null>('text');

  // State restoration callback
  const handleRestore = useCallback((state: Record<string, unknown>) => {
    if (state.headline !== undefined) setHeadline(state.headline as string);
    if (state.subtext !== undefined) setSubtext(state.subtext as string);
    if (state.imageOffset !== undefined) setImageOffset(state.imageOffset as { x: number; y: number });
    if (state.imageScale !== undefined) setImageScale(state.imageScale as number);
    if (state.gradientEnabled !== undefined) setGradientEnabled(state.gradientEnabled as boolean);
    if (state.gradientOpacity !== undefined) setGradientOpacity(state.gradientOpacity as number);
    if (state.customHeadlineFontSize !== undefined) setCustomHeadlineFontSize(state.customHeadlineFontSize as number | null);
    if (state.customSubtextFontSize !== undefined) setCustomSubtextFontSize(state.customSubtextFontSize as number | null);
    if (state.customHeadlineWidth !== undefined) setCustomHeadlineWidth(state.customHeadlineWidth as number | null);
    if (state.customSubtextWidth !== undefined) setCustomSubtextWidth(state.customSubtextWidth as number | null);
  }, []);

  const collectState = useCallback(() => ({
    headline, subtext, imageOffset, imageScale, gradientEnabled, gradientOpacity,
    customHeadlineFontSize, customSubtextFontSize, customHeadlineWidth, customSubtextWidth,
  }), [headline, subtext, imageOffset, imageScale, gradientEnabled, gradientOpacity, customHeadlineFontSize, customSubtextFontSize, customHeadlineWidth, customSubtextWidth]);

  const { saveToHistory, debouncedSaveToHistory, collectStateRef } = useCanvasHistorySetup(collectState, handleRestore, 500);

  // Load background image
  const [backgroundImage] = useImage(imageSrc, 'anonymous');

  // Calculate layout and image dimensions
  const headlineFontSize = customHeadlineFontSize ?? config.headline.fontSize;
  const subtextFontSize = customSubtextFontSize ?? config.subtext.fontSize;
  const layout = useMemo(
    () => calculateSimpleLayout(headline, subtext, headlineFontSize, subtextFontSize),
    [headline, subtext, headlineFontSize, subtextFontSize]
  );
  const bgImageDimensions = useImageCoverFit(backgroundImage, config.canvas.width, config.canvas.height, imageScale);

  // Sync with props
  useEffect(() => { setHeadline(initialHeadline); }, [initialHeadline]);
  useEffect(() => { setSubtext(initialSubtext); }, [initialSubtext]);

  // Initialize element positions for snapping
  useEffect(() => {
    updateElementPosition('headline-text', config.headline.x, layout.headlineY, config.headline.maxWidth, layout.headlineHeight);
    updateElementPosition('subtext-text', config.subtext.x, layout.subtextY, config.subtext.maxWidth, layout.subtextHeight);
  }, [layout, updateElementPosition, config]);

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
  const handleHeadlineSelect = useCallback(() => setSelectedElement('headline'), [setSelectedElement]);
  const handleSubtextSelect = useCallback(() => setSelectedElement('subtext'), [setSelectedElement]);

  const handleHeadlineTextChange = useCallback((newText: string) => {
    setHeadline(newText);
    onHeadlineChange?.(newText);
    debouncedSaveToHistory({ ...collectStateRef.current(), headline: newText });
  }, [onHeadlineChange, debouncedSaveToHistory, collectStateRef]);

  const handleSubtextTextChange = useCallback((newText: string) => {
    setSubtext(newText);
    onSubtextChange?.(newText);
    debouncedSaveToHistory({ ...collectStateRef.current(), subtext: newText });
  }, [onSubtextChange, debouncedSaveToHistory, collectStateRef]);

  const handleHeadlineFontSizeChange = useCallback((size: number) => setCustomHeadlineFontSize(size), []);
  const handleSubtextFontSizeChange = useCallback((size: number) => setCustomSubtextFontSize(size), []);
  const handleHeadlineTransformEnd = useCallback((_x: number, _y: number, width: number) => setCustomHeadlineWidth(width), []);
  const handleSubtextTransformEnd = useCallback((_x: number, _y: number, width: number) => setCustomSubtextWidth(width), []);

  // Sidebar configuration
  const tabs: SidebarTab[] = useMemo(() => [
    { id: 'text', icon: PiTextT, label: 'Text', ariaLabel: 'Text bearbeiten' },
    { id: 'fontsize', icon: PiTextAa, label: 'Schriftgröße', ariaLabel: 'Schriftgröße anpassen' },
    { id: 'image', icon: HiPhotograph, label: 'Bild', ariaLabel: 'Bild anpassen' },
    { id: 'gradient', icon: HiAdjustments, label: 'Gradient', ariaLabel: 'Gradient anpassen' },
  ], []);

  // Custom text section for headline/subtext
  const TextSectionSimple = () => (
    <div className="sidebar-section">
      <div className="sidebar-field">
        <label htmlFor="headline-input">Headline</label>
        <textarea
          id="headline-input"
          value={headline}
          onChange={(e) => handleHeadlineTextChange(e.target.value)}
          rows={2}
          className="sidebar-textarea"
        />
      </div>
      <div className="sidebar-field">
        <label htmlFor="subtext-input">Subtext</label>
        <textarea
          id="subtext-input"
          value={subtext}
          onChange={(e) => handleSubtextTextChange(e.target.value)}
          rows={2}
          className="sidebar-textarea"
        />
      </div>
    </div>
  );

  // Custom FontSize stepper component
  const FontSizeStepper = ({ value, onChange, min = 12, max = 200, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) => (
    <div className="font-size-item">
      <label>{label}</label>
      <div className="font-size-stepper">
        <button type="button" className="font-size-stepper__btn" onClick={() => value > min && onChange(value - 1)} disabled={value <= min} aria-label="Verringern">
          <FaMinus size={12} />
        </button>
        <input type="number" className="font-size-stepper__input" value={Math.round(value)} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= min && v <= max) onChange(v); }} min={min} max={max} />
        <button type="button" className="font-size-stepper__btn" onClick={() => value < max && onChange(value + 1)} disabled={value >= max} aria-label="Erhöhen">
          <FaPlus size={12} />
        </button>
      </div>
    </div>
  );

  const FontSizeSectionSimple = () => (
    <div className="font-size-section-simple">
      <FontSizeStepper value={headlineFontSize} onChange={handleHeadlineFontSizeChange} min={40} max={120} label="Headline" />
      <FontSizeStepper value={subtextFontSize} onChange={handleSubtextFontSizeChange} min={30} max={80} label="Subtext" />
    </div>
  );

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'text': return <TextSectionSimple />;
      case 'fontsize': return <FontSizeSectionSimple />;
      case 'image': return <ImageSection scale={imageScale} onScaleChange={handleImageScaleChange} onReset={handleImageReset} />;
      case 'gradient': return <GradientSection enabled={gradientEnabled} onToggle={handleGradientToggle} opacity={gradientOpacity} onOpacityChange={handleGradientOpacityChange} />;
      default: return null;
    }
  };

  const tabBar = <SidebarTabBar tabs={tabs} activeTab={activeTab} onTabClick={setActiveTab} />;
  const panel = <SidebarPanel isOpen={activeTab !== null}>{renderActivePanel()}</SidebarPanel>;

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
      <div className="simple-canvas-wrapper">
        <CanvasStage ref={stageRef} width={config.canvas.width} height={config.canvas.height} responsive maxContainerWidth={900} onStageClick={handleStageClick} className="simple-stage">
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

          <CanvasText
            id="headline-text"
            text={headline}
            x={config.headline.x}
            y={layout.headlineY}
            width={customHeadlineWidth ?? config.headline.maxWidth}
            fontSize={headlineFontSize}
            fontFamily={`${config.headline.fontFamily}, Arial, sans-serif`}
            fontStyle={config.headline.fontStyle}
            fill={config.headline.color}
            align="left"
            lineHeight={config.headline.lineHeightRatio}
            wrap="word"
            draggable
            editable
            selected={selectedElement === 'headline'}
            onSelect={handleHeadlineSelect}
            onTextChange={handleHeadlineTextChange}
            onFontSizeChange={handleHeadlineFontSizeChange}
            onTransformEnd={handleHeadlineTransformEnd}
            stageWidth={config.canvas.width}
            stageHeight={config.canvas.height}
            onSnapChange={handleSnapChange}
            snapTargets={getSnapTargets('headline-text')}
            onPositionChange={handlePositionChange}
            onSnapLinesChange={setSnapLines}
            transformConfig={{ enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right'], rotateEnabled: false, keepRatio: true, bounds: { minWidth: 200, maxWidth: config.headline.maxWidth + 100 } }}
          />

          <CanvasText
            id="subtext-text"
            text={subtext}
            x={config.subtext.x}
            y={layout.subtextY}
            width={customSubtextWidth ?? config.subtext.maxWidth}
            fontSize={subtextFontSize}
            fontFamily={`${config.subtext.fontFamily}, Arial, sans-serif`}
            fontStyle={config.subtext.fontStyle}
            fill={config.subtext.color}
            align="left"
            lineHeight={config.subtext.lineHeightRatio}
            wrap="word"
            draggable
            editable
            selected={selectedElement === 'subtext'}
            onSelect={handleSubtextSelect}
            onTextChange={handleSubtextTextChange}
            onFontSizeChange={handleSubtextFontSizeChange}
            onTransformEnd={handleSubtextTransformEnd}
            stageWidth={config.canvas.width}
            stageHeight={config.canvas.height}
            onSnapChange={handleSnapChange}
            snapTargets={getSnapTargets('subtext-text')}
            onPositionChange={handlePositionChange}
            onSnapLinesChange={setSnapLines}
            transformConfig={{ enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right'], rotateEnabled: false, keepRatio: true, bounds: { minWidth: 100, maxWidth: config.subtext.maxWidth } }}
          />

          <SnapGuidelines showH={snapGuides.h} showV={snapGuides.v} stageWidth={config.canvas.width} stageHeight={config.canvas.height} snapLines={snapLines} />
        </CanvasStage>
      </div>
    </CanvasEditorLayout>
  );
}

export default SimpleCanvas;