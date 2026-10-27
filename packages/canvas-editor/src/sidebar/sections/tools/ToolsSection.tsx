import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { cn } from '@ggraphic/editor/utils/cn';
import { brandColors } from '@ggraphic/editor/utils/colorOptions';
import { Suspense, useEffect, useId, useState } from 'react';
import { HiSparkles } from 'react-icons/hi';
import {
  HiChatBubbleBottomCenterText,
  HiPencilSquare,
  HiPhoto,
  HiQrCode,
  HiScissors,
} from 'react-icons/hi2';
import { PiArrowLeft, PiCaretRightBold, PiDropSimpleFill, PiPath } from 'react-icons/pi';

import { useIsCanvasMobile } from '../../../hooks/useIsCanvasMobile';
import { lazyWithPreload } from '@ggraphic/editor/sidebar/sections/lazyWithPreload';
import { whenIdle } from '@ggraphic/editor/sidebar/sections/whenIdle';

import { ToolTile, type ToolTileId } from '@ggraphic/editor/sidebar/sections/tools/ToolTiles';

import type { AltTextPagesSource } from './AltTextTool';
import type { UserImagePlacement } from '@ggraphic/editor/utils/userImageUtils';
import type { ComponentType } from 'react';
import type { IconType } from 'react-icons';

// The panels load on demand, so opening the tab only waits for the tiles. Once
// the tab is idle every offered panel is preloaded (touch has no hover), and a
// tile also warms its own on pointer-enter/focus in case the click comes first.
const PANELS = {
  'remove-bg': lazyWithPreload(() =>
    import('./RemoveBackgroundTool').then((m) => m.RemoveBackgroundTool)
  ),
  'ai-create': lazyWithPreload(() => import('@ggraphic/editor/sidebar/sections/tools/AiCreateTool').then((m) => m.AiCreateTool)),
  'ai-edit': lazyWithPreload(() => import('./AiEditTool').then((m) => m.AiEditTool)),
  'alt-text': lazyWithPreload(() => import('./AltTextTool').then((m) => m.AltTextTool)),
  unsplash: lazyWithPreload(() => import('./UnsplashTool').then((m) => m.UnsplashTool)),
  'qr-code': lazyWithPreload(() => import('./QRCodeTool').then((m) => m.QRCodeTool)),
  'gradient-text': lazyWithPreload(() =>
    import('./GradientTextTool').then((m) => m.GradientTextTool)
  ),
  blob: lazyWithPreload(() => import('./BlobCreatorTool').then((m) => m.BlobCreatorTool)),
  'text-path': lazyWithPreload(() =>
    import('./TextPathCreatorTool').then((m) => m.TextPathCreatorTool)
  ),
} satisfies Record<ToolTileId, { preload: () => Promise<unknown> }>;

const {
  'remove-bg': RemoveBackgroundTool,
  'ai-create': AiCreateTool,
  'ai-edit': AiEditTool,
  'alt-text': AltTextTool,
  unsplash: UnsplashTool,
  'qr-code': QRCodeTool,
  'gradient-text': GradientTextTool,
  blob: BlobCreatorTool,
  'text-path': TextPathCreatorTool,
} = PANELS;

// A failed warm-up is not an error yet: the panel retries when it renders.
const warmPanel = (id: ToolTileId) => void PANELS[id].preload().catch(() => {});

export interface ToolsSectionProps {
  /** Optional callback the tools call after a successful upload to nudge the user toward the Uploads tab. */
  onJumpToUploads?: () => void;
  /** Places a generated image (by durable URL) straight onto the canvas. */
  onPlaceImageUrl?: (url: string, fileName: string, options?: UserImagePlacement) => void;
  /** The editor's pages for the alt-text tool; only the multi-page editor provides them. */
  altTextPages?: AltTextPagesSource;
}

type ToolView = 'browse' | ToolTileId;

interface ToolCard {
  id: Exclude<ToolView, 'browse'>;
  label: string;
  /** One-sentence hint shown under the label in the mobile list. */
  description: string;
  /** Generative tools, grouped under t.sidebar.tools.tiles.withAi on mobile. */
  ai: boolean;
  icon: IconType | ComponentType<{ size?: number; className?: string }>;
  available: boolean;
}

const brandColor = (id: string) => brandColors().find((c) => c.id === id)?.value;

// The letters carry the gradient themselves, so the tile shows what the tool makes.
function GradientTextIcon({ size = 24, className }: { size?: number; className?: string }) {
  const gradientId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={brandColor('grashalm')} />
          <stop offset="1" stopColor={brandColor('himmel')} />
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
  card: Pick<ToolCard, 'id' | 'label'>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={() => warmPanel(card.id)}
      onFocus={() => warmPanel(card.id)}
      className={cn(
        'tool-tile-trigger flex w-full flex-col items-center gap-2.5 p-2 cursor-pointer bg-transparent border-none rounded-[14px]',
        'transition-colors duration-150 hover:bg-[var(--editor-active-soft)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600'
      )}
    >
      <ToolTile id={card.id} />
      <span className="text-sm leading-tight text-foreground text-center">{card.label}</span>
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

export function ToolsSection({
  onJumpToUploads,
  onPlaceImageUrl,
  altTextPages,
}: ToolsSectionProps) {
  const t = useMessages();
  const {
    removeBackgroundFromImage,
    generateAiImage,
    editAiImage,
    searchUnsplashImages,
    generateSlideAltTexts,
  } = useCanvasEditorServices();
  const [activeView, setActiveView] = useState<ToolView>('browse');
  const isMobile = useIsCanvasMobile();

  const cards: ToolCard[] = [
    {
      id: 'remove-bg',
      description: t.sidebar.tools.tiles.removeBgDesc,
      ai: false,
      label: t.sidebar.tools.tiles.removeBgLabel,
      icon: HiScissors,
      available: !!removeBackgroundFromImage,
    },
    {
      id: 'ai-create',
      description: t.sidebar.tools.tiles.aiCreateDesc,
      ai: true,
      label: t.sidebar.tools.tiles.aiCreateLabel,
      icon: HiSparkles,
      available: !!generateAiImage,
    },
    {
      id: 'ai-edit',
      description: t.sidebar.tools.tiles.aiEditDesc,
      ai: true,
      label: t.sidebar.tools.tiles.aiEditLabel,
      icon: HiPencilSquare,
      available: !!editAiImage,
    },
    {
      id: 'alt-text',
      description: t.sidebar.tools.tiles.altDesc,
      ai: true,
      label: t.sidebar.tools.tiles.altLabel,
      icon: HiChatBubbleBottomCenterText,
      available: !!generateSlideAltTexts && !!altTextPages,
    },
    {
      id: 'unsplash',
      description: t.sidebar.tools.tiles.unsplashDesc,
      ai: false,
      label: t.sidebar.tools.tiles.unsplashLabel,
      icon: HiPhoto,
      available: !!searchUnsplashImages && !!onPlaceImageUrl,
    },
    {
      id: 'qr-code',
      description: t.sidebar.tools.tiles.qrDesc,
      ai: false,
      label: t.sidebar.tools.tiles.qrLabel,
      icon: HiQrCode,
      available: true,
    },
    {
      id: 'gradient-text',
      description: t.sidebar.tools.tiles.gradientDesc,
      ai: false,
      label: t.sidebar.tools.tiles.gradientLabel,
      icon: GradientTextIcon,
      available: true,
    },
    {
      id: 'blob',
      description: t.sidebar.tools.tiles.blobDesc,
      ai: false,
      label: t.sidebar.tools.tiles.blobLabel,
      icon: PiDropSimpleFill,
      available: true,
    },
    {
      id: 'text-path',
      description: t.sidebar.tools.tiles.pathDesc,
      ai: false,
      label: t.sidebar.tools.tiles.pathLabel,
      icon: PiPath,
      available: true,
    },
  ];

  const availableCards = cards.filter((c) => c.available);
  const availableKey = availableCards.map((c) => c.id).join(',');

  useEffect(
    () => whenIdle(() => availableKey.split(',').forEach((id) => warmPanel(id as ToolTileId))),
    [availableKey]
  );

  if (availableCards.length === 0) {
    return <div className="p-4 text-xs text-foreground-muted">{t.sidebar.tools.tiles.none}</div>;
  }

  if (activeView === 'browse' && isMobile) {
    return (
      <div className="flex flex-col gap-4 w-full min-w-0">
        <ToolListGroup
          label={t.sidebar.tools.tiles.withAi}
          cards={availableCards.filter((c) => c.ai)}
          onSelect={setActiveView}
        />
        <ToolListGroup
          label={t.sidebar.tools.tiles.create}
          cards={availableCards.filter((c) => !c.ai)}
          onSelect={setActiveView}
        />
      </div>
    );
  }

  if (activeView === 'browse') {
    return (
      <div className="flex flex-col gap-4 w-full min-w-0 p-md">
        <div className="grid grid-cols-2 gap-x-3 gap-y-7">
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
      <Suspense fallback={null}>
        {activeView === 'remove-bg' && <RemoveBackgroundTool onJumpToUploads={onJumpToUploads} />}
        {activeView === 'ai-create' && <AiCreateTool onJumpToUploads={onJumpToUploads} />}
        {activeView === 'ai-edit' && <AiEditTool onJumpToUploads={onJumpToUploads} />}
        {activeView === 'unsplash' && <UnsplashTool onPlaceImageUrl={onPlaceImageUrl} />}
        {activeView === 'alt-text' && altTextPages && <AltTextTool pages={altTextPages} />}
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
          <TextPathCreatorTool
            onJumpToUploads={onJumpToUploads}
            onPlaceImageUrl={onPlaceImageUrl}
          />
        )}
      </Suspense>
    </div>
  );
}
