/**
 * VeranstaltungCanvas - 1:1 match with backend veranstaltung_canvas.ts
 * Renders event sharepic with photo section, green area, and date circle
 */

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import useImage from 'use-image';
import { Group, Rect, Circle, Text } from 'react-konva';
import { CanvasStage, CanvasText, CanvasImage, SnapGuidelines } from '../primitives';
import { CanvasEditorLayout } from '../layouts';
import { SidebarTabBar, SidebarPanel, TextSection, FontSizeSection, ImageSection, AlternativesSection } from '../sidebar';
import type { SidebarTab, SidebarTabId } from '../sidebar/types';
import { useCanvasInteractions, useCanvasStoreSetup, useCanvasHistorySetup, useImageCoverFit } from '../hooks';
import type { CanvasStageRef } from '../primitives/CanvasStage';
import { VERANSTALTUNG_CONFIG, calculateVeranstaltungLayout } from '../utils/veranstaltungLayout';
import { useCanvasEditorStore, useSnapGuides, useSnapLines } from '../../../../stores/canvasEditorStore';
import { PiTextT, PiTextAa } from 'react-icons/pi';
import { HiPhotograph, HiSparkles } from 'react-icons/hi';
import './VeranstaltungCanvas.css';

export interface VeranstaltungCanvasProps {
  eventTitle: string;
  beschreibung: string;
  weekday: string;
  date: string;
  time: string;
  locationName: string;
  address: string;
  imageSrc: string;
  alternatives?: Array<{ eventTitle?: string; beschreibung?: string; weekday?: string; date?: string; time?: string; locationName?: string; address?: string }>;
  onExport: (base64: string) => void;
  onSave?: (base64: string) => void;
  onCancel: () => void;
  onEventTitleChange?: (eventTitle: string) => void;
  onBeschreibungChange?: (beschreibung: string) => void;
}

type SelectedElement = 'eventTitle' | 'beschreibung' | 'location' | 'address' | 'background' | 'circle' | null;

export function VeranstaltungCanvas({
  eventTitle: initialEventTitle,
  beschreibung: initialBeschreibung,
  weekday: initialWeekday,
  date: initialDate,
  time: initialTime,
  locationName: initialLocationName,
  address: initialAddress,
  imageSrc,
  alternatives = [],
  onExport,
  onSave,
  onCancel,
  onEventTitleChange,
  onBeschreibungChange,
}: VeranstaltungCanvasProps) {
  const config = VERANSTALTUNG_CONFIG;
  const stageRef = useRef<CanvasStageRef>(null);
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

  // Shared hooks
  useCanvasStoreSetup('veranstaltung', stageRef);

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
  const [eventTitle, setEventTitle] = useState(initialEventTitle);
  const [beschreibung, setBeschreibung] = useState(initialBeschreibung);
  const [weekday, setWeekday] = useState(initialWeekday);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [locationName, setLocationName] = useState(initialLocationName);
  const [address, setAddress] = useState(initialAddress);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [imageScale, setImageScale] = useState(1);
  const [customEventTitleFontSize, setCustomEventTitleFontSize] = useState<number | null>(null);
  const [customBeschreibungFontSize, setCustomBeschreibungFontSize] = useState<number | null>(null);

  const handleRestore = useCallback((state: Record<string, unknown>) => {
    if (state.eventTitle !== undefined) setEventTitle(state.eventTitle as string);
    if (state.beschreibung !== undefined) setBeschreibung(state.beschreibung as string);
    if (state.weekday !== undefined) setWeekday(state.weekday as string);
    if (state.date !== undefined) setDate(state.date as string);
    if (state.time !== undefined) setTime(state.time as string);
    if (state.locationName !== undefined) setLocationName(state.locationName as string);
    if (state.address !== undefined) setAddress(state.address as string);
    if (state.imageOffset !== undefined) setImageOffset(state.imageOffset as { x: number; y: number });
    if (state.imageScale !== undefined) setImageScale(state.imageScale as number);
    if (state.customEventTitleFontSize !== undefined) setCustomEventTitleFontSize(state.customEventTitleFontSize as number | null);
    if (state.customBeschreibungFontSize !== undefined) setCustomBeschreibungFontSize(state.customBeschreibungFontSize as number | null);
  }, []);

  const collectState = useCallback(() => ({
    eventTitle, beschreibung, weekday, date, time, locationName, address,
    imageOffset, imageScale, customEventTitleFontSize, customBeschreibungFontSize,
  }), [eventTitle, beschreibung, weekday, date, time, locationName, address, imageOffset, imageScale, customEventTitleFontSize, customBeschreibungFontSize]);

  const { saveToHistory, debouncedSaveToHistory, collectStateRef } = useCanvasHistorySetup(collectState, handleRestore, 500);

  // Computed values
  const eventTitleFontSize = customEventTitleFontSize ?? config.eventTitle.fontSize;
  const beschreibungFontSize = customBeschreibungFontSize ?? config.description.fontSize;
  const layout = useMemo(() => calculateVeranstaltungLayout(eventTitleFontSize, beschreibungFontSize), [eventTitleFontSize, beschreibungFontSize]);
  const [backgroundImage] = useImage(imageSrc, 'anonymous');
  const bgImageDimensions = useImageCoverFit(backgroundImage, config.canvas.width, config.photo.height, imageScale);

  // Update element positions for snapping
  useEffect(() => {
    updateElementPosition('eventTitle', layout.eventTitle.x, layout.eventTitle.y, config.text.maxWidth, layout.eventTitle.lineHeight * 2);
  }, [layout, updateElementPosition, config.text.maxWidth]);

  // Element handlers
  const handleEventTitleSelect = useCallback(() => setSelectedElement('eventTitle'), [setSelectedElement]);
  const handleBeschreibungSelect = useCallback(() => setSelectedElement('beschreibung'), [setSelectedElement]);
  const handleBackgroundSelect = useCallback(() => setSelectedElement('background'), [setSelectedElement]);

  const handleEventTitleTextChange = useCallback((newText: string) => {
    setEventTitle(newText);
    onEventTitleChange?.(newText);
    debouncedSaveToHistory({ ...collectStateRef.current(), eventTitle: newText });
  }, [onEventTitleChange, debouncedSaveToHistory, collectStateRef]);

  const handleBeschreibungTextChange = useCallback((newText: string) => {
    setBeschreibung(newText);
    onBeschreibungChange?.(newText);
    debouncedSaveToHistory({ ...collectStateRef.current(), beschreibung: newText });
  }, [onBeschreibungChange, debouncedSaveToHistory, collectStateRef]);

  const handleEventTitleFontSizeChange = useCallback((fontSize: number) => setCustomEventTitleFontSize(fontSize), []);
  const handleBeschreibungFontSizeChange = useCallback((fontSize: number) => setCustomBeschreibungFontSize(fontSize), []);

  const handleBackgroundDragEnd = useCallback((x: number, y: number) => {
    const centerX = (config.canvas.width - (bgImageDimensions?.displayWidth ?? 0)) / 2;
    const centerY = (config.photo.height - (bgImageDimensions?.displayHeight ?? 0)) / 2;
    const newOffset = { x: x - centerX, y: y - centerY };
    setImageOffset(newOffset);
    saveToHistory({ ...collectStateRef.current(), imageOffset: newOffset });
  }, [bgImageDimensions, config.canvas.width, config.photo.height, saveToHistory, collectStateRef]);

  const handleImageScaleChange = useCallback((scale: number) => {
    setImageScale(scale);
    debouncedSaveToHistory({ ...collectStateRef.current(), imageScale: scale });
  }, [debouncedSaveToHistory, collectStateRef]);

  const handleImageReset = useCallback(() => {
    setImageOffset({ x: 0, y: 0 });
    setImageScale(1);
    saveToHistory({ ...collectStateRef.current(), imageOffset: { x: 0, y: 0 }, imageScale: 1 });
  }, [saveToHistory, collectStateRef]);

  const handleSelectAlternative = useCallback((alt: { eventTitle?: string; beschreibung?: string }) => {
    if (alt.eventTitle) { setEventTitle(alt.eventTitle); onEventTitleChange?.(alt.eventTitle); }
    if (alt.beschreibung) { setBeschreibung(alt.beschreibung); onBeschreibungChange?.(alt.beschreibung); }
    saveToHistory({ ...collectStateRef.current(), eventTitle: alt.eventTitle || eventTitle, beschreibung: alt.beschreibung || beschreibung });
  }, [onEventTitleChange, onBeschreibungChange, saveToHistory, collectStateRef, eventTitle, beschreibung]);

  // Sidebar configuration
  const allTabs: SidebarTab[] = useMemo(() => [
    { id: 'text', icon: PiTextT, label: 'Text', ariaLabel: 'Text bearbeiten' },
    { id: 'fontsize', icon: PiTextAa, label: 'Schriftgröße', ariaLabel: 'Schriftgröße anpassen' },
    { id: 'image', icon: HiPhotograph, label: 'Bild', ariaLabel: 'Bild anpassen' },
    { id: 'alternatives', icon: HiSparkles, label: 'Alternativen', ariaLabel: 'Alternative Texte' },
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
            <TextSection quote={eventTitle} name={beschreibung} onQuoteChange={handleEventTitleTextChange} onNameChange={handleBeschreibungTextChange} quoteLabel="Event-Titel" nameLabel="Beschreibung" />
            {isDesktop && (
              <FontSizeSection quoteFontSize={customEventTitleFontSize ?? config.eventTitle.fontSize} nameFontSize={customBeschreibungFontSize ?? config.description.fontSize} onQuoteFontSizeChange={handleEventTitleFontSizeChange} onNameFontSizeChange={handleBeschreibungFontSizeChange} quoteLabel="Event-Titel" nameLabel="Beschreibung" />
            )}
          </>
        );
      case 'fontsize': return <FontSizeSection quoteFontSize={customEventTitleFontSize ?? config.eventTitle.fontSize} nameFontSize={customBeschreibungFontSize ?? config.description.fontSize} onQuoteFontSizeChange={handleEventTitleFontSizeChange} onNameFontSizeChange={handleBeschreibungFontSizeChange} quoteLabel="Event-Titel" nameLabel="Beschreibung" />;
      case 'image': return <ImageSection scale={imageScale} onScaleChange={handleImageScaleChange} onReset={handleImageReset} />;
      case 'alternatives': return <AlternativesSection alternatives={alternatives.map(a => a.eventTitle || '')} currentQuote={eventTitle} onAlternativeSelect={(altTitle) => { const alt = alternatives.find(a => a.eventTitle === altTitle); if (alt) handleSelectAlternative(alt); }} />;
      default: return null;
    }
  };

  const tabBar = <SidebarTabBar tabs={visibleTabs} activeTab={activeTab} onTabClick={handleTabClick} onExport={handleExport} onSave={handleSave} disabledTabs={disabledTabs} />;
  const panel = <SidebarPanel isOpen={activeTab !== null} onClose={handlePanelClose}>{renderActivePanel()}</SidebarPanel>;

  const eventTitleLineHeight = eventTitleFontSize * config.eventTitle.lineHeightRatio;
  const beschreibungY = layout.eventTitle.y + eventTitleLineHeight * 2 + config.eventTitle.gapBelow;

  return (
    <CanvasEditorLayout sidebar={panel} tabBar={tabBar} actions={null}>
      <div className="veranstaltung-canvas-wrapper">
        <CanvasStage ref={stageRef} width={config.canvas.width} height={config.canvas.height} responsive maxContainerWidth={900} onStageClick={handleStageClick} className="veranstaltung-stage">
          <Group clipFunc={(ctx) => { ctx.rect(0, 0, config.canvas.width, config.photo.height); }}>
            {backgroundImage && bgImageDimensions && (
              <CanvasImage id="background-image" image={backgroundImage} x={imageOffset.x + (config.canvas.width - bgImageDimensions.displayWidth) / 2} y={imageOffset.y + (config.photo.height - bgImageDimensions.displayHeight) / 2} width={bgImageDimensions.displayWidth} height={bgImageDimensions.displayHeight} draggable selected={selectedElement === 'background'} onSelect={handleBackgroundSelect} onDragEnd={handleBackgroundDragEnd} stageWidth={config.canvas.width} stageHeight={config.photo.height} transformConfig={{ enabledAnchors: [], rotateEnabled: false }} />
            )}
          </Group>

          <Rect x={0} y={config.greenSection.y} width={config.canvas.width} height={config.greenSection.height} fill={config.greenSection.color} listening={false} />

          <CanvasText
            id="eventTitle-text" text={eventTitle} x={layout.eventTitle.x} y={layout.eventTitle.y}
            width={config.text.maxWidth} fontSize={customEventTitleFontSize ?? layout.eventTitle.fontSize}
            fontFamily={`${config.eventTitle.fontFamily}, Arial, sans-serif`} fontStyle="italic bold"
            fill={config.text.color} align="left" lineHeight={config.eventTitle.lineHeightRatio} wrap="word"
            draggable editable selected={selectedElement === 'eventTitle'}
            onSelect={handleEventTitleSelect} onTextChange={handleEventTitleTextChange}
            onFontSizeChange={handleEventTitleFontSizeChange}
            stageWidth={config.canvas.width} stageHeight={config.canvas.height}
            onSnapChange={handleSnapChange} snapTargets={getSnapTargets('eventTitle-text')}
            onPositionChange={handlePositionChange} onSnapLinesChange={setSnapLines}
            transformConfig={{ enabledAnchors: ['middle-left', 'middle-right'], rotateEnabled: false, keepRatio: true, bounds: { minWidth: 200, maxWidth: config.text.maxWidth + 100 } }}
          />

          <CanvasText
            id="beschreibung-text" text={beschreibung} x={layout.eventTitle.x} y={beschreibungY}
            width={config.text.maxWidth} fontSize={customBeschreibungFontSize ?? config.description.fontSize}
            fontFamily={`${config.description.fontFamily}, Arial, sans-serif`} fontStyle="italic"
            fill={config.text.color} align="left" lineHeight={config.description.lineHeightRatio} wrap="word"
            draggable editable selected={selectedElement === 'beschreibung'}
            onSelect={handleBeschreibungSelect} onTextChange={handleBeschreibungTextChange}
            onFontSizeChange={handleBeschreibungFontSizeChange}
            stageWidth={config.canvas.width} stageHeight={config.canvas.height}
            onSnapChange={handleSnapChange} snapTargets={getSnapTargets('beschreibung-text')}
            onPositionChange={handlePositionChange} onSnapLinesChange={setSnapLines}
            transformConfig={{ enabledAnchors: ['middle-left', 'middle-right'], rotateEnabled: false, keepRatio: true, bounds: { minWidth: 200, maxWidth: config.text.maxWidth + 100 } }}
          />

          <Group x={config.circle.centerX} y={config.circle.centerY} rotation={config.circle.rotation}>
            <Circle radius={config.circle.radius} fill={config.circle.backgroundColor} />
            <Text text={weekday} fontSize={config.circleText.weekday.fontSize} fontFamily={config.circleText.weekday.fontFamily} fill={config.circle.textColor} align="center" verticalAlign="middle" width={config.circle.radius * 2} x={-config.circle.radius} y={config.circleText.weekday.yOffset - config.circleText.weekday.fontSize / 2} />
            <Text text={date} fontSize={config.circleText.date.fontSize} fontFamily={config.circleText.date.fontFamily} fill={config.circle.textColor} align="center" verticalAlign="middle" width={config.circle.radius * 2} x={-config.circle.radius} y={config.circleText.date.yOffset - config.circleText.date.fontSize / 2} />
            <Text text={time} fontSize={config.circleText.time.fontSize} fontFamily={config.circleText.time.fontFamily} fill={config.circle.textColor} align="center" verticalAlign="middle" width={config.circle.radius * 2} x={-config.circle.radius} y={config.circleText.time.yOffset - config.circleText.time.fontSize / 2} />
          </Group>

          <Text text={locationName} x={config.text.leftMargin} y={config.footer.y} fontSize={config.location.fontSize} fontFamily={`${config.location.fontFamily}, Arial, sans-serif`} fill={config.text.color} listening={false} />
          <Text text={address} x={config.text.leftMargin} y={config.footer.y + config.location.fontSize * config.footer.lineHeightRatio} fontSize={config.address.fontSize} fontFamily={`${config.address.fontFamily}, Arial, sans-serif`} fill={config.text.color} listening={false} />

          <SnapGuidelines showH={snapGuides.h} showV={snapGuides.v} stageWidth={config.canvas.width} stageHeight={config.canvas.height} snapLines={snapLines} />
        </CanvasStage>
      </div>
    </CanvasEditorLayout>
  );
}

export default VeranstaltungCanvas;