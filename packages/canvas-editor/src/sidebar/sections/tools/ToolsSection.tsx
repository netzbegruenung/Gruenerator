import { useState } from 'react';
import { HiSparkles } from 'react-icons/hi';
import { HiPencilSquare, HiQrCode, HiScissors } from 'react-icons/hi2';
import { PiArrowLeft, PiTextT, PiDropSimpleFill, PiPath, PiChartBar } from 'react-icons/pi';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { cn } from '../../../utils/cn';

import { AiCreateTool } from './AiCreateTool';
import { AiEditTool } from './AiEditTool';
import { BlobCreatorTool } from './BlobCreatorTool';
import { ChartInsertTool } from './ChartInsertTool';
import { GradientTextTool } from './GradientTextTool';
import { QRCodeTool } from './QRCodeTool';
import { RemoveBackgroundTool } from './RemoveBackgroundTool';
import { TextPathCreatorTool } from './TextPathCreatorTool';

import type { ChartType } from '../../../utils/chartUtils';
import type { ComponentType } from 'react';
import type { IconType } from 'react-icons';

export interface ToolsSectionProps {
  /** Optional callback the tools call after a successful upload to nudge the user toward the Uploads tab. */
  onJumpToUploads?: () => void;
  /** When present, enables the "Diagramm" tool which inserts a chart element. */
  onInsertChart?: (chartType: ChartType) => void;
  /** Places a generated image (by durable URL) straight onto the canvas. */
  onPlaceImageUrl?: (url: string, fileName: string) => void;
}

type ToolView =
  | 'browse'
  | 'remove-bg'
  | 'ai-create'
  | 'ai-edit'
  | 'qr-code'
  | 'gradient-text'
  | 'blob'
  | 'text-path'
  | 'chart';

interface ToolCard {
  id: Exclude<ToolView, 'browse'>;
  label: string;
  icon: IconType | ComponentType<{ size?: number; className?: string }>;
  iconColor: string;
  hoverShadow: string;
  ring: string;
  available: boolean;
}

function ToolCardButton({
  card,
  onClick,
}: {
  card: Pick<ToolCard, 'label' | 'icon' | 'iconColor' | 'hoverShadow' | 'ring'>;
  onClick: () => void;
}) {
  const Icon = card.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex flex-col items-center gap-sm cursor-pointer bg-transparent border-none p-0 rounded-lg',
        'focus-visible:outline-none focus-visible:ring-2',
        card.ring
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center size-20 rounded-full bg-transparent',
          'transition-[box-shadow] duration-200 ease-out',
          card.hoverShadow
        )}
      >
        <span
          className={cn(
            'inline-flex items-center justify-center transition-transform duration-200 ease-out group-hover:scale-[1.04] text-3xl',
            card.iconColor
          )}
        >
          <Icon size={48} />
        </span>
      </div>
      <span className="text-xs text-foreground text-center leading-tight max-w-20">
        {card.label}
      </span>
    </button>
  );
}

function DrillDownHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-2 w-full bg-transparent border-none cursor-pointer py-1.5 px-0 text-foreground text-sm font-semibold transition-colors duration-150 hover:text-primary-600 mb-2"
    >
      <PiArrowLeft size={16} />
      <span>{label}</span>
    </button>
  );
}

export function ToolsSection({
  onJumpToUploads,
  onInsertChart,
  onPlaceImageUrl,
}: ToolsSectionProps) {
  const { removeBackgroundFromImage, generateAiImage, editAiImage } = useCanvasEditorServices();
  const [activeView, setActiveView] = useState<ToolView>('browse');

  const cards: ToolCard[] = [
    {
      id: 'remove-bg',
      label: 'Hintergrund entfernen',
      icon: HiScissors,
      iconColor: 'text-secondary-600 dark:text-secondary-300',
      hoverShadow:
        'group-hover:shadow-sm group-hover:shadow-secondary-600/15 dark:group-hover:shadow-secondary-300/15',
      ring: 'focus-visible:ring-primary-600',
      available: !!removeBackgroundFromImage,
    },
    {
      id: 'ai-create',
      label: 'KI-Bild erstellen',
      icon: HiSparkles,
      iconColor: 'text-primary-600 dark:text-primary-300',
      hoverShadow:
        'group-hover:shadow-sm group-hover:shadow-primary-600/15 dark:group-hover:shadow-primary-300/15',
      ring: 'focus-visible:ring-primary-600',
      available: !!generateAiImage,
    },
    {
      id: 'ai-edit',
      label: 'Mit KI bearbeiten',
      icon: HiPencilSquare,
      iconColor: 'text-tertiary-600 dark:text-tertiary-300',
      hoverShadow: 'group-hover:shadow-sm',
      ring: 'focus-visible:ring-primary-600',
      available: !!editAiImage,
    },
    {
      id: 'qr-code',
      label: 'QR-Code erstellen',
      icon: HiQrCode,
      iconColor: 'text-foreground dark:text-foreground',
      hoverShadow:
        'group-hover:shadow-sm group-hover:shadow-foreground/15 dark:group-hover:shadow-foreground/15',
      ring: 'focus-visible:ring-primary-600',
      available: true,
    },
    {
      id: 'gradient-text',
      label: 'Verlaufstext erstellen',
      icon: PiTextT,
      iconColor: 'text-primary-600 dark:text-primary-300',
      hoverShadow:
        'group-hover:shadow-sm group-hover:shadow-primary-600/15 dark:group-hover:shadow-primary-300/15',
      ring: 'focus-visible:ring-primary-600',
      available: true,
    },
    {
      id: 'blob',
      label: 'Blob erstellen',
      icon: PiDropSimpleFill,
      iconColor: 'text-secondary-600 dark:text-secondary-300',
      hoverShadow:
        'group-hover:shadow-sm group-hover:shadow-secondary-600/15 dark:group-hover:shadow-secondary-300/15',
      ring: 'focus-visible:ring-primary-600',
      available: true,
    },
    {
      id: 'text-path',
      label: 'Pfadtext erstellen',
      icon: PiPath,
      iconColor: 'text-tertiary-600 dark:text-tertiary-300',
      hoverShadow: 'group-hover:shadow-sm',
      ring: 'focus-visible:ring-primary-600',
      available: true,
    },
    {
      id: 'chart',
      label: 'Diagramm einfügen',
      icon: PiChartBar,
      iconColor: 'text-secondary-600 dark:text-secondary-300',
      hoverShadow:
        'group-hover:shadow-sm group-hover:shadow-secondary-600/15 dark:group-hover:shadow-secondary-300/15',
      ring: 'focus-visible:ring-primary-600',
      available: !!onInsertChart,
    },
  ];

  const availableCards = cards.filter((c) => c.available);

  if (availableCards.length === 0) {
    return (
      <div className="p-4 text-xs text-foreground-muted">Keine KI-Werkzeuge konfiguriert.</div>
    );
  }

  if (activeView === 'browse') {
    return (
      <div className="flex flex-col gap-4 w-full min-w-0 p-md">
        <div className="grid grid-cols-2 gap-x-2 gap-y-3 justify-items-center">
          {availableCards.map((card) => (
            <ToolCardButton key={card.id} card={card} onClick={() => setActiveView(card.id)} />
          ))}
        </div>
      </div>
    );
  }

  const activeCard = cards.find((c) => c.id === activeView);
  const goBack = () => setActiveView('browse');

  return (
    <div className="flex flex-col gap-2 w-full min-w-0 px-md pt-md">
      <DrillDownHeader label={activeCard?.label ?? ''} onBack={goBack} />
      {activeView === 'remove-bg' && <RemoveBackgroundTool onJumpToUploads={onJumpToUploads} />}
      {activeView === 'ai-create' && <AiCreateTool onJumpToUploads={onJumpToUploads} />}
      {activeView === 'ai-edit' && <AiEditTool onJumpToUploads={onJumpToUploads} />}
      {activeView === 'qr-code' && (
        <QRCodeTool onJumpToUploads={onJumpToUploads} onPlaceImageUrl={onPlaceImageUrl} />
      )}
      {activeView === 'gradient-text' && (
        <GradientTextTool onJumpToUploads={onJumpToUploads} onPlaceImageUrl={onPlaceImageUrl} />
      )}
      {activeView === 'blob' && (
        <BlobCreatorTool onJumpToUploads={onJumpToUploads} onPlaceImageUrl={onPlaceImageUrl} />
      )}
      {activeView === 'text-path' && (
        <TextPathCreatorTool onJumpToUploads={onJumpToUploads} onPlaceImageUrl={onPlaceImageUrl} />
      )}
      {activeView === 'chart' && onInsertChart && <ChartInsertTool onInsertChart={onInsertChart} />}
    </div>
  );
}
