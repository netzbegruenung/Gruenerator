import { useId, useState } from 'react';
import { HiSparkles } from 'react-icons/hi';
import { HiPencilSquare, HiPhoto, HiQrCode, HiScissors } from 'react-icons/hi2';
import { PiArrowLeft, PiCaretRightBold, PiDropSimpleFill, PiPath } from 'react-icons/pi';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { useIsCanvasMobile } from '../../../hooks/useIsCanvasMobile';
import { cn } from '../../../utils/cn';

import { AiCreateTool } from './AiCreateTool';
import { AiEditTool } from './AiEditTool';
import { BlobCreatorTool } from './BlobCreatorTool';
import { GradientTextTool } from './GradientTextTool';
import { QRCodeTool } from './QRCodeTool';
import { RemoveBackgroundTool } from './RemoveBackgroundTool';
import { TextPathCreatorTool } from './TextPathCreatorTool';
import { UnsplashTool } from './UnsplashTool';

import type { UserImagePlacement } from '../../../utils/userImageUtils';
import type { ComponentType } from 'react';
import type { IconType } from 'react-icons';

export interface ToolsSectionProps {
  /** Optional callback the tools call after a successful upload to nudge the user toward the Uploads tab. */
  onJumpToUploads?: () => void;
  /** Places a generated image (by durable URL) straight onto the canvas. */
  onPlaceImageUrl?: (url: string, fileName: string, options?: UserImagePlacement) => void;
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
  | 'unsplash';

interface ToolCard {
  id: Exclude<ToolView, 'browse'>;
  label: string;
  /** One-sentence hint shown under the label in the mobile list. */
  description: string;
  /** Generative tools, grouped under "Mit KI" on mobile. */
  ai: boolean;
  icon: IconType | ComponentType<{ size?: number; className?: string }>;
  available: boolean;
}

// The letters carry the gradient themselves, so the tile shows what the tool makes.
function GradientTextIcon({ size = 24, className }: { size?: number; className?: string }) {
  const gradientId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8ABD24" />
          <stop offset="1" stopColor="#0BA1DD" />
        </linearGradient>
      </defs>
      <text
        x="12"
        y="18"
        textAnchor="middle"
        fontSize="17"
        fontWeight="900"
        fontFamily="GrueneTypeNeue, ArvoGruen, sans-serif"
        fill={`url(#${gradientId})`}
      >
        Aa
      </text>
    </svg>
  );
}

function ToolCardButton({
  card,
  onClick,
}: {
  card: Pick<ToolCard, 'label' | 'icon'>;
  onClick: () => void;
}) {
  const Icon = card.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex flex-col items-center gap-sm cursor-pointer bg-transparent border-none p-0 rounded-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600'
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center size-20 rounded-full bg-transparent',
          'transition-[box-shadow] duration-200 ease-out',
          'group-hover:shadow-sm group-hover:shadow-editor-active-fg/15'
        )}
      >
        <span className="inline-flex items-center justify-center transition-transform duration-200 ease-out group-hover:scale-[1.04] text-3xl text-editor-active-fg">
          <Icon size={48} />
        </span>
      </div>
      <span className="text-xs text-foreground text-center leading-tight max-w-20">
        {card.label}
      </span>
    </button>
  );
}

function ToolListRow({ card, onClick }: { card: ToolCard; onClick: () => void }) {
  const Icon = card.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full min-h-14 py-2 px-0 bg-transparent border-none cursor-pointer text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
    >
      <span
        className={cn(
          'flex items-center justify-center size-10 shrink-0 rounded-[10px]',
          card.ai
            ? 'bg-[var(--editor-active-bg)] text-[var(--editor-active-fg)]'
            : 'bg-[var(--editor-tile)] text-[var(--editor-text)]'
        )}
      >
        <Icon size={20} />
      </span>
      <span className="flex flex-col flex-1 min-w-0">
        <span className="text-[15px] font-bold leading-tight text-[var(--editor-text)]">
          {card.label}
        </span>
        <span className="text-[13px] leading-snug text-[var(--editor-text-muted)]">
          {card.description}
        </span>
      </span>
      <PiCaretRightBold size={14} className="shrink-0 text-[var(--editor-text-muted)]" />
    </button>
  );
}

function ToolListGroup({
  label,
  cards,
  onSelect,
}: {
  label: string;
  cards: ToolCard[];
  onSelect: (id: ToolCard['id']) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <section className="flex flex-col gap-1">
      <h4 className="m-0 text-[13px] font-bold text-[var(--editor-text-muted)]">{label}</h4>
      {cards.map((card) => (
        <ToolListRow key={card.id} card={card} onClick={() => onSelect(card.id)} />
      ))}
    </section>
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

export function ToolsSection({ onJumpToUploads, onPlaceImageUrl }: ToolsSectionProps) {
  const { removeBackgroundFromImage, generateAiImage, editAiImage, searchUnsplashImages } =
    useCanvasEditorServices();
  const [activeView, setActiveView] = useState<ToolView>('browse');
  const isMobile = useIsCanvasMobile();

  const cards: ToolCard[] = [
    {
      id: 'remove-bg',
      description: 'Person oder Objekt freistellen',
      ai: false,
      label: 'Hintergrund entfernen',
      icon: HiScissors,
      available: !!removeBackgroundFromImage,
    },
    {
      id: 'ai-create',
      description: 'Motiv per Beschreibung erzeugen',
      ai: true,
      label: 'KI-Bild erstellen',
      icon: HiSparkles,
      available: !!generateAiImage,
    },
    {
      id: 'ai-edit',
      description: 'Foto per Befehl verändern',
      ai: true,
      label: 'Mit KI bearbeiten',
      icon: HiPencilSquare,
      available: !!editAiImage,
    },
    {
      id: 'unsplash',
      description: 'Freie Fotos suchen und einfügen',
      ai: false,
      label: 'Unsplash-Fotos',
      icon: HiPhoto,
      available: !!searchUnsplashImages && !!onPlaceImageUrl,
    },
    {
      id: 'qr-code',
      description: 'Link als scanbaren Code',
      ai: false,
      label: 'QR-Code erstellen',
      icon: HiQrCode,
      available: true,
    },
    {
      id: 'gradient-text',
      description: 'Schriftzug mit Farbverlauf gestalten',
      ai: false,
      label: 'Text mit Farbverlauf',
      icon: GradientTextIcon,
      available: true,
    },
    {
      id: 'blob',
      description: 'Organische Form als Hintergrund',
      ai: false,
      label: 'Blob erstellen',
      icon: PiDropSimpleFill,
      available: true,
    },
    {
      id: 'text-path',
      description: 'Text entlang einer Kurve setzen',
      ai: false,
      label: 'Pfadtext erstellen',
      icon: PiPath,
      available: true,
    },
  ];

  const availableCards = cards.filter((c) => c.available);

  if (availableCards.length === 0) {
    return (
      <div className="p-4 text-xs text-foreground-muted">Keine KI-Werkzeuge konfiguriert.</div>
    );
  }

  if (activeView === 'browse' && isMobile) {
    return (
      <div className="flex flex-col gap-4 w-full min-w-0">
        <ToolListGroup
          label="Mit KI"
          cards={availableCards.filter((c) => c.ai)}
          onSelect={setActiveView}
        />
        <ToolListGroup
          label="Erstellen"
          cards={availableCards.filter((c) => !c.ai)}
          onSelect={setActiveView}
        />
      </div>
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
    <div className={cn('flex flex-col gap-2 w-full min-w-0', !isMobile && 'px-md pt-md')}>
      <DrillDownHeader label={activeCard?.label ?? ''} onBack={goBack} />
      {activeView === 'remove-bg' && <RemoveBackgroundTool onJumpToUploads={onJumpToUploads} />}
      {activeView === 'ai-create' && <AiCreateTool onJumpToUploads={onJumpToUploads} />}
      {activeView === 'ai-edit' && <AiEditTool onJumpToUploads={onJumpToUploads} />}
      {activeView === 'unsplash' && <UnsplashTool onPlaceImageUrl={onPlaceImageUrl} />}
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
    </div>
  );
}
