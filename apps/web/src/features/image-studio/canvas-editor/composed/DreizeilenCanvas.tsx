/**
 * DreizeilenCanvas - 1:1 match with backend dreizeilen_canvas.ts
 * Renders 3-line slogan with skewed parallelogram bars
 */

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import useImage from 'use-image';
import { Group, Line, Text, Rect, Transformer } from 'react-konva';
import type Konva from 'konva';
import { CanvasStage, CanvasImage, SnapGuidelines } from '../primitives';
import { CanvasEditorLayout } from '../layouts';
import {
  SidebarTabBar,
  SidebarPanel,
  FontSizeSection,
  AssetsSection,
  DreizeilenTextSection,
  DreizeilenPositionSection,
  DreizeilenColorSection,
  DreizeilenAlternativesSection,
} from '../sidebar';
import type { SidebarTab, SidebarTabId, AssetItem } from '../sidebar/types';
import type { DreizeilenAlternative } from '../sidebar/sections/dreizeilen';
import { useCanvasInteractions, useCanvasStoreSetup, useCanvasHistorySetup, useImageCoverFit } from '../hooks';
import type { CanvasStageRef } from '../primitives/CanvasStage';
import { DREIZEILEN_CONFIG, COLOR_SCHEMES, COLORS, calculateDreizeilenLayout, calculateParallelogramPoints, flattenPoints, getColorScheme } from '../utils/dreizeilenLayout';
import { useCanvasEditorStore, useSnapGuides, useSnapLines } from '../../../../stores/canvasEditorStore';
import { PiTextT, PiTextAa } from 'react-icons/pi';
import { HiColorSwatch, HiSparkles } from 'react-icons/hi';
import { FaExpand } from 'react-icons/fa';
import { GiSunflower } from 'react-icons/gi';
import './DreizeilenCanvas.css';

export type { DreizeilenAlternative } from '../sidebar/sections/dreizeilen';

export interface DreizeilenCanvasProps {
  line1: string;
  line2: string;
  line3: string;
  imageSrc?: string;
  alternatives?: DreizeilenAlternative[];
  onExport: (base64: string) => void;
  onCancel: () => void;
  onLine1Change?: (line: string) => void;
  onLine2Change?: (line: string) => void;
  onLine3Change?: (line: string) => void;
}

type SelectedElement = 'sunflower' | 'background' | 'balken' | null;

export function DreizeilenCanvas({
  line1: initialLine1,
  line2: initialLine2,
  line3: initialLine3,
  imageSrc,
  alternatives = [],
  onExport,
  onCancel,
  onLine1Change,
  onLine2Change,
  onLine3Change,
}: DreizeilenCanvasProps) {
  const config = DREIZEILEN_CONFIG;
  const stageRef = useRef<CanvasStageRef>(null);
  const balkenGroupRef = useRef<Konva.Group>(null);
  const balkenTransformerRef = useRef<Konva.Transformer>(null);
  const [activeTab, setActiveTab] = useState<SidebarTabId | null>('text');

  // Shared hooks
  useCanvasStoreSetup('dreizeilen', stageRef);

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
  const [line1, setLine1] = useState(initialLine1);
  const [line2, setLine2] = useState(initialLine2);
  const [line3, setLine3] = useState(initialLine3);
  const [colorSchemeId, setColorSchemeId] = useState('tanne-sand');
  const [fontSize, setFontSize] = useState<number>(config.text.defaultFontSize);
  const [sunflowerPos, setSunflowerPos] = useState<{ x: number; y: number } | null>(null);
  const [sunflowerSize, setSunflowerSize] = useState<{ w: number; h: number } | null>(null);
  const [sunflowerVisible, setSunflowerVisible] = useState(true);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [imageScale, setImageScale] = useState(1);
  const [balkenOffset, setBalkenOffset] = useState({ x: 0, y: 0 });
  const [balkenScale, setBalkenScale] = useState<number>(1.0);
  const [balkenWidthScale, setBalkenWidthScale] = useState<number>(1.0);

  const handleRestore = useCallback((state: Record<string, unknown>) => {
    if (state.line1 !== undefined) setLine1(state.line1 as string);
    if (state.line2 !== undefined) setLine2(state.line2 as string);
    if (state.line3 !== undefined) setLine3(state.line3 as string);
    if (state.colorSchemeId !== undefined) setColorSchemeId(state.colorSchemeId as string);
    if (state.fontSize !== undefined) setFontSize(state.fontSize as number);
    if (state.sunflowerPos !== undefined) setSunflowerPos(state.sunflowerPos as { x: number; y: number } | null);
    if (state.sunflowerSize !== undefined) setSunflowerSize(state.sunflowerSize as { w: number; h: number } | null);
    if (state.sunflowerVisible !== undefined) setSunflowerVisible(state.sunflowerVisible as boolean);
    if (state.imageOffset !== undefined) setImageOffset(state.imageOffset as { x: number; y: number });
    if (state.imageScale !== undefined) setImageScale(state.imageScale as number);
    if (state.balkenOffset !== undefined) setBalkenOffset(state.balkenOffset as { x: number; y: number });
    if (state.balkenScale !== undefined) setBalkenScale(state.balkenScale as number);
    if (state.balkenWidthScale !== undefined) setBalkenWidthScale(state.balkenWidthScale as number);
  }, []);

  const collectState = useCallback(() => ({
    line1, line2, line3, colorSchemeId, fontSize, sunflowerPos, sunflowerSize, sunflowerVisible, imageOffset, imageScale, balkenOffset, balkenScale, balkenWidthScale,
  }), [line1, line2, line3, colorSchemeId, fontSize, sunflowerPos, sunflowerSize, sunflowerVisible, imageOffset, imageScale, balkenOffset, balkenScale, balkenWidthScale]);

  const { saveToHistory, debouncedSaveToHistory, collectStateRef } = useCanvasHistorySetup(collectState, handleRestore, 500);

  // Computed values
  const layout = useMemo(() => calculateDreizeilenLayout([line1, line2, line3], fontSize, config.defaults.balkenOffset, config.defaults.balkenGruppenOffset, config.canvas.width, config.canvas.height, balkenWidthScale), [line1, line2, line3, fontSize, config.defaults.balkenOffset, config.defaults.balkenGruppenOffset, config.canvas.width, config.canvas.height, balkenWidthScale]);
  const colorScheme = useMemo(() => getColorScheme(colorSchemeId), [colorSchemeId]);
  const [sunflowerImage] = useImage(config.sunflower.src);
  const [backgroundImage] = useImage(imageSrc || '');
  const hasBackgroundImage = !!imageSrc && !!backgroundImage;
  const bgImageDimensions = useImageCoverFit(backgroundImage, config.canvas.width, config.canvas.height, imageScale);

  // Update element positions for snapping
  useEffect(() => {
    if (layout.sunflowerSize > 0) {
      updateElementPosition('sunflower', sunflowerPos?.x ?? layout.sunflowerDefaultPos.x, sunflowerPos?.y ?? layout.sunflowerDefaultPos.y, sunflowerSize?.w ?? layout.sunflowerSize, sunflowerSize?.h ?? layout.sunflowerSize);
    }
  }, [layout, updateElementPosition, sunflowerPos, sunflowerSize]);

  // Line change handlers
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

  // Sunflower handlers
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

  // Background handlers
  const handleBackgroundSelect = useCallback(() => setSelectedElement('background'), [setSelectedElement]);
  const handleBackgroundDragEnd = useCallback((x: number, y: number) => {
    if (!bgImageDimensions) return;
    const centerX = (config.canvas.width - bgImageDimensions.displayWidth) / 2;
    const centerY = (config.canvas.height - bgImageDimensions.displayHeight) / 2;
    const newOffset = { x: x - centerX, y: y - centerY };
    setImageOffset(newOffset);
    saveToHistory({ ...collectStateRef.current(), imageOffset: newOffset });
  }, [bgImageDimensions, config.canvas.width, config.canvas.height, saveToHistory, collectStateRef]);

  // Balken handlers
  const handleBalkenSelect = useCallback(() => {
    setSelectedElement('balken');
  }, [setSelectedElement]);

  const handleBalkenDragEnd = useCallback((x: number, y: number) => {
    const newOffset = { x, y };
    setBalkenOffset(newOffset);
    saveToHistory({ ...collectStateRef.current(), balkenOffset: newOffset });
  }, [saveToHistory, collectStateRef]);

  const handleBalkenWidthScaleChange = useCallback((scale: number) => {
    setBalkenWidthScale(scale);
    debouncedSaveToHistory({ ...collectStateRef.current(), balkenWidthScale: scale });
  }, [debouncedSaveToHistory, collectStateRef]);

  const handleBalkenTransformEnd = useCallback(() => {
    const node = balkenGroupRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const newScale = Math.max(scaleX, scaleY);

    // Reset node scale and store uniform scale
    node.scaleX(1);
    node.scaleY(1);

    const newOffset = { x: node.x(), y: node.y() };
    setBalkenOffset(newOffset);
    setBalkenScale(newScale);
    saveToHistory({ ...collectStateRef.current(), balkenOffset: newOffset, balkenScale: newScale });
  }, [saveToHistory, collectStateRef]);

  // Attach transformer to balken group when selected
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

  // Sidebar configuration
  const tabs: SidebarTab[] = useMemo(() => [
    { id: 'text', icon: PiTextT, label: 'Text', ariaLabel: 'Text bearbeiten' },
    { id: 'fontsize', icon: PiTextAa, label: 'Schriftgröße', ariaLabel: 'Schriftgröße anpassen' },
    { id: 'position', icon: FaExpand, label: 'Breite', ariaLabel: 'Balken Breite anpassen' },
    { id: 'background', icon: HiColorSwatch, label: 'Farben', ariaLabel: 'Farbschema wählen' },
    { id: 'assets', icon: GiSunflower, label: 'Grafiken', ariaLabel: 'Sonnenblume ein/aus' },
    { id: 'alternatives', icon: HiSparkles, label: 'Alternativen', ariaLabel: 'Alternative Texte' },
  ], []);

  const disabledTabs = useMemo(() => alternatives.length === 0 ? ['alternatives'] as SidebarTabId[] : [], [alternatives]);
  const sidebarAssets: AssetItem[] = useMemo(() => [{ id: 'sunflower', src: config.sunflower.src, label: 'Sonnenblume', visible: sunflowerVisible }], [sunflowerVisible, config]);

  const handleReset = useCallback(() => {
    setBalkenWidthScale(1);
    setBalkenScale(1);
    setBalkenOffset({ x: 0, y: 0 });
    saveToHistory({ ...collectStateRef.current(), balkenWidthScale: 1, balkenScale: 1, balkenOffset: { x: 0, y: 0 } });
  }, [saveToHistory, collectStateRef]);

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'text':
        return (
          <DreizeilenTextSection
            line1={line1}
            line2={line2}
            line3={line3}
            onLine1Change={handleLine1Change}
            onLine2Change={handleLine2Change}
            onLine3Change={handleLine3Change}
          />
        );
      case 'fontsize':
        return <FontSizeSection quoteFontSize={fontSize} onQuoteFontSizeChange={handleFontSizeChange} />;
      case 'position':
        return (
          <DreizeilenPositionSection
            widthScale={balkenWidthScale}
            onWidthScaleChange={handleBalkenWidthScaleChange}
            onReset={handleReset}
          />
        );
      case 'background':
        return (
          <DreizeilenColorSection
            colorSchemes={COLOR_SCHEMES}
            activeSchemeId={colorSchemeId}
            onSchemeChange={handleColorSchemeChange}
          />
        );
      case 'assets':
        return <AssetsSection assets={sidebarAssets} onAssetToggle={handleAssetToggle} />;
      case 'alternatives':
        return (
          <DreizeilenAlternativesSection
            alternatives={alternatives}
            currentLine1={line1}
            currentLine2={line2}
            currentLine3={line3}
            onSelectAlternative={handleSelectAlternative}
          />
        );
      default:
        return null;
    }
  };

  const tabBar = <SidebarTabBar tabs={tabs} activeTab={activeTab} onTabClick={setActiveTab} disabledTabs={disabledTabs} />;
  const panel = <SidebarPanel isOpen={activeTab !== null}>{renderActivePanel()}</SidebarPanel>;

  const sunflowerWidth = sunflowerSize?.w ?? layout.sunflowerSize;
  const sunflowerHeight = sunflowerSize?.h ?? layout.sunflowerSize;
  const sunflowerX = sunflowerPos?.x ?? layout.sunflowerDefaultPos.x;
  const sunflowerY = sunflowerPos?.y ?? layout.sunflowerDefaultPos.y;

  return (
    <CanvasEditorLayout sidebar={panel} tabBar={tabBar} actions={<><button className="btn btn-secondary" onClick={onCancel}>Abbrechen</button><button className="btn btn-primary" onClick={handleExport}>Fertig</button></>}>
      <div className="dreizeilen-canvas-wrapper">
        <CanvasStage ref={stageRef} width={config.canvas.width} height={config.canvas.height} responsive maxContainerWidth={900} onStageClick={handleStageClick} className="dreizeilen-stage">
          {hasBackgroundImage && bgImageDimensions ? (
            <Group clipFunc={(ctx) => { ctx.rect(0, 0, config.canvas.width, config.canvas.height); }}>
              <CanvasImage id="background-image" image={backgroundImage} x={imageOffset.x + (config.canvas.width - bgImageDimensions.displayWidth) / 2} y={imageOffset.y + (config.canvas.height - bgImageDimensions.displayHeight) / 2} width={bgImageDimensions.displayWidth} height={bgImageDimensions.displayHeight} draggable selected={selectedElement === 'background'} onSelect={handleBackgroundSelect} onDragEnd={handleBackgroundDragEnd} stageWidth={config.canvas.width} stageHeight={config.canvas.height} transformConfig={{ enabledAnchors: [], rotateEnabled: false }} />
            </Group>
          ) : (
            <Rect x={0} y={0} width={config.canvas.width} height={config.canvas.height} fill={COLORS.SAND} listening={false} />
          )}

          {/* Sunflower rendered BEHIND balken */}
          {sunflowerVisible && sunflowerImage && layout.sunflowerSize > 0 && (
            <CanvasImage id="sunflower" image={sunflowerImage} x={sunflowerX} y={sunflowerY} width={sunflowerWidth} height={sunflowerHeight} draggable selected={selectedElement === 'sunflower'} onSelect={handleSunflowerSelect} onDragEnd={handleSunflowerDragEnd} onTransformEnd={handleSunflowerTransformEnd} stageWidth={config.canvas.width} stageHeight={config.canvas.height} onSnapChange={handleSnapChange} snapTargets={getSnapTargets('sunflower')} onPositionChange={handlePositionChange} onSnapLinesChange={setSnapLines} transformConfig={{ keepRatio: true, bounds: { minWidth: 50, maxWidth: 600 } }} />
          )}

          <Group
            ref={balkenGroupRef}
            x={balkenOffset.x}
            y={balkenOffset.y}
            scaleX={balkenScale}
            scaleY={balkenScale}
            draggable
            onClick={handleBalkenSelect}
            onTap={handleBalkenSelect}
            onDragEnd={(e) => handleBalkenDragEnd(e.target.x(), e.target.y())}
            onTransformEnd={handleBalkenTransformEnd}
          >
            {layout.balkenLayouts.map((balken) => {
              const colorPair = colorScheme.colors[balken.lineIndex];
              const points = calculateParallelogramPoints(balken.x, balken.y, balken.width, balken.height);
              const skewRad = (config.balken.skewAngle * Math.PI) / 180;
              const skewOffset = (balken.height * Math.tan(skewRad)) / 2;

              return (
                <Group key={balken.lineIndex}>
                  <Line points={flattenPoints(points)} closed fill={colorPair.background} />
                  <Text text={balken.text} x={balken.x + skewOffset / 2} y={balken.y} width={balken.width} height={balken.height} fontSize={fontSize} fontFamily={`${config.text.fontFamily}, Arial, sans-serif`} fill={colorPair.text} align="center" verticalAlign="middle" listening={false} />
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

          <SnapGuidelines showH={snapGuides.h} showV={snapGuides.v} stageWidth={config.canvas.width} stageHeight={config.canvas.height} snapLines={snapLines} />
        </CanvasStage>
      </div>
    </CanvasEditorLayout>
  );
}

export default DreizeilenCanvas;