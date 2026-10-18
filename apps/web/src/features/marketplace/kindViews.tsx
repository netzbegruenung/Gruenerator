import {
  GRUENERATOR_TEMPLATE_TYPE,
  type MarketplaceItem,
  type MarketplaceItemOf,
  type MarketplaceKind,
} from '@gruenerator/contracts';
import { MARKETPLACE_ORIGIN_BADGE } from '@gruenerator/shared/marketplace';
import { resolveStoredImageUrl } from '@gruenerator/shared/media-library/shareUrl';
import { Button, cn } from '@gruenerator/ui';
import { useState, type JSX, type ReactNode } from 'react';
import { PiArrowSquareOut, PiChatCircleText, PiPencilSimple, PiUserCircle } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { PhosphorIcon } from '../agents/icons/PhosphorIcon';
import { profilbildAssetHref } from '../studio-tools/utils/galleryAsset';
import { useGrueneratorVorlage } from '../vorlagen/hooks/useGrueneratorVorlage';

import { getAgentIcon } from '@/components/layout/Sidebar/sidebarAgentConfig';
import { resolveApiAssetUrl } from '@/utils/platform';

/** What picker mode hands over. */
export type MarketplaceAssetItem = MarketplaceItemOf<'sticker'> | MarketplaceItemOf<'background'>;

/** Either a kind icon (Agents, Rezepte) or an image (Vorlagen, Sticker, Hintergründe). */
export type MarketplaceVisual =
  { type: 'icon'; icon: ReactNode } | { type: 'image'; src: string | null; cutout: boolean };

interface KindView<K extends MarketplaceKind> {
  /** The kind in one word, first in a card's meta line. */
  label: string;
  /** The save action's wording: to save, saved, to take back. */
  saveLabel: SaveLabel;
  visual: (item: MarketplaceItemOf<K>) => MarketplaceVisual;
  /** The ways on from the detail — try it, use it, open its own page. */
  PrimaryActions: (props: { item: MarketplaceItemOf<K> }) => JSX.Element | null;
  /**
   * Optional: what only this kind shows in the detail, in place of the plain
   * image (a Vorlage's pages). Everything else in the detail is the same for all.
   */
  DetailExtras?: (props: { item: MarketplaceItemOf<K> }) => JSX.Element | null;
}

interface SaveLabel {
  add: string;
  added: string;
  remove: string;
}

const LIBRARY: SaveLabel = {
  add: 'Zu meinen Grüneratoren',
  added: 'In meinen Grüneratoren',
  remove: 'Aus meinen Grüneratoren entfernen',
};
const BOOKMARK: SaveLabel = { add: 'Merken', added: 'Gemerkt', remove: 'Nicht mehr merken' };

// ── Agents & Rezepte ─────────────────────────────────────────────────────────

function agentVisual(item: MarketplaceItemOf<'agent'>): MarketplaceVisual {
  if (item.agent.isUserAgent)
    return { type: 'icon', icon: <PhosphorIcon name={item.iconKey ?? 'PiSparkle'} /> };
  const Icon = getAgentIcon(item.agent.identifier);
  return { type: 'icon', icon: <Icon /> };
}

const recipeVisual = (item: MarketplaceItemOf<'recipe'>): MarketplaceVisual => ({
  type: 'icon',
  icon: <PhosphorIcon name={item.iconKey ?? 'PiSparkle'} />,
});

function ChatAndDetails({ chatPath, detailPath }: { chatPath: string; detailPath: string }) {
  return (
    <>
      <Button asChild variant="outline">
        <Link to={chatPath}>
          <PiChatCircleText aria-hidden />
          Im Chat ausprobieren
        </Link>
      </Button>
      <Button asChild variant="ghost">
        <Link to={detailPath}>
          <PiArrowSquareOut aria-hidden />
          Alle Details
        </Link>
      </Button>
    </>
  );
}

function AgentActions({ item }: { item: MarketplaceItemOf<'agent'> }) {
  const slug = encodeURIComponent(item.agent.slug);
  return <ChatAndDetails chatPath={`/agents/${slug}`} detailPath={`/agentura/agent/${slug}`} />;
}

function RecipeActions({ item }: { item: MarketplaceItemOf<'recipe'> }) {
  const mention = encodeURIComponent(item.recipe.mention);
  // A user recipe needs its row, or the chat takes the bundled body of a catalogue recipe by the same name.
  const chatPath = item.recipe.rowId
    ? `/chat?rezept=${mention}&rezeptId=${encodeURIComponent(item.recipe.rowId)}`
    : `/chat?skill=${mention}`;
  return <ChatAndDetails chatPath={chatPath} detailPath={`/agentura/rezept/${mention}`} />;
}

// ── Vorlagen ─────────────────────────────────────────────────────────────────

/** Uploaded Vorlagen images are stored as `/share/<token>` page URLs, not files (#2845). */
export const templateImageSrc = (url: string | null | undefined): string | null =>
  resolveApiAssetUrl(resolveStoredImageUrl(url) ?? undefined) ?? null;

const templateVisual = (item: MarketplaceItemOf<'template'>): MarketplaceVisual => ({
  type: 'image',
  src: templateImageSrc(item.thumbnailUrl),
  cutout: false,
});

function TemplateActions({ item }: { item: MarketplaceItemOf<'template'> }) {
  const { openVorlage, usingId } = useGrueneratorVorlage();
  if (item.template.templateType === GRUENERATOR_TEMPLATE_TYPE) {
    const using = usingId === item.ref;
    return (
      <Button
        variant="outline"
        disabled={using}
        onClick={() => void openVorlage({ id: item.ref, content_data: item.template.contentData })}
      >
        <PiPencilSimple aria-hidden />
        {using ? 'Wird geöffnet …' : 'Vorlage verwenden'}
      </Button>
    );
  }
  const url = item.template.externalUrl;
  if (!url) return null;
  return (
    <Button asChild variant="outline">
      <a href={url} target="_blank" rel="noopener noreferrer">
        <PiArrowSquareOut aria-hidden />
        {item.template.templateType === 'canva' ? 'In Canva öffnen' : 'Öffnen'}
      </a>
    </Button>
  );
}

/**
 * Every page of a Vorlage: the chosen one large, all of them as a strip below
 * once there is more than one — the pager of the old Vorlagen detail.
 */
function TemplatePages({ item }: { item: MarketplaceItemOf<'template'> }) {
  const pages = item.template.images.flatMap((image) => {
    const src = templateImageSrc(image.url);
    return src ? [{ src }] : [];
  });
  const [page, setPage] = useState(0);
  const current = pages[page] ?? pages[0] ?? null;

  return (
    <div className="flex max-w-md flex-col gap-2">
      <VisualImage
        visual={{
          type: 'image',
          src: current?.src ?? templateImageSrc(item.thumbnailUrl),
          cutout: false,
        }}
        className="rounded-xl border border-grey-200 dark:border-grey-700"
      />
      {pages.length > 1 && (
        <div role="group" aria-label="Seiten" className="flex gap-2 overflow-x-auto pb-1">
          {pages.map((p, i) => (
            <button
              // eslint-disable-next-line react/no-array-index-key -- pages have no id and may repeat an image URL; order is the identity
              key={i}
              type="button"
              aria-label={`Seite ${i + 1} von ${pages.length} anzeigen`}
              aria-current={i === page}
              onClick={() => setPage(i)}
              className={cn(
                'h-20 shrink-0 overflow-hidden rounded-lg border-2 bg-background-alt transition-colors',
                i === page
                  ? 'border-primary-600 dark:border-primary-400'
                  : 'border-transparent hover:border-grey-300 dark:hover:border-grey-600'
              )}
            >
              <img src={p.src} alt="" loading="lazy" className="h-full w-auto" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sticker & Hintergründe ───────────────────────────────────────────────────

const assetVisual = (item: MarketplaceAssetItem): MarketplaceVisual => ({
  type: 'image',
  src: item.asset.thumbUrl ?? item.asset.src,
  cutout: item.kind === 'sticker',
});

function AssetActions({ item }: { item: MarketplaceAssetItem }) {
  return (
    <Button asChild variant="outline">
      <Link to={profilbildAssetHref(item.asset)}>
        <PiUserCircle aria-hidden />
        Im Profilbild verwenden
      </Link>
    </Button>
  );
}

/**
 * Everything kind-specific about the Marktplatz in one place: the word for
 * the kind, how saving is worded, the card's icon or image, and what the
 * detail offers. Card frame, detail layout and browser are the same for all.
 */
export const KIND_VIEWS: { [K in MarketplaceKind]: KindView<K> } = {
  agent: { label: 'Agent', saveLabel: LIBRARY, visual: agentVisual, PrimaryActions: AgentActions },
  recipe: {
    label: 'Rezept',
    saveLabel: LIBRARY,
    visual: recipeVisual,
    PrimaryActions: RecipeActions,
  },
  template: {
    label: 'Vorlage',
    saveLabel: BOOKMARK,
    visual: templateVisual,
    PrimaryActions: TemplateActions,
    DetailExtras: TemplatePages,
  },
  sticker: {
    label: 'Sticker',
    saveLabel: BOOKMARK,
    visual: assetVisual,
    PrimaryActions: AssetActions,
  },
  background: {
    label: 'Hintergrund',
    saveLabel: BOOKMARK,
    visual: assetVisual,
    PrimaryActions: AssetActions,
  },
};

// `KIND_VIEWS[item.kind]` loses the link between the item's kind and the view's
// parameter types (TS cannot correlate the two lookups). The mapped type above
// guarantees they match, so this widening is the one place that bridges it.
interface AnyKindView {
  label: string;
  saveLabel: SaveLabel;
  visual: (item: MarketplaceItem) => MarketplaceVisual;
  PrimaryActions: (props: { item: MarketplaceItem }) => JSX.Element | null;
  DetailExtras?: (props: { item: MarketplaceItem }) => JSX.Element | null;
}
export const viewOf = (item: MarketplaceItem): AnyKindView =>
  KIND_VIEWS[item.kind] as unknown as AnyKindView;

/** „Agent · Offiziell", „Sticker · Kim" — the kind, then the origin or the author. */
export const metaLine = (item: MarketplaceItem): string =>
  [viewOf(item).label, MARKETPLACE_ORIGIN_BADGE[item.origin] ?? item.authorName]
    .filter(Boolean)
    .join(' · ');

const CHECKERBOARD =
  'bg-[repeating-conic-gradient(#ececec_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px] ' +
  'dark:bg-[repeating-conic-gradient(#2a2a2a_0%_25%,#1f1f1f_0%_50%)]';

/** The image area of a card or detail: contained on a quiet stage, cut-outs on a checkerboard. */
export function VisualImage({
  visual,
  className,
}: {
  visual: Extract<MarketplaceVisual, { type: 'image' }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex aspect-[4/3] w-full items-center justify-center overflow-hidden',
        visual.cutout ? cn(CHECKERBOARD, 'p-[8%]') : 'bg-background-alt',
        className
      )}
    >
      {visual.src && (
        <img
          src={visual.src}
          alt=""
          loading="lazy"
          decoding="async"
          className="max-h-full max-w-full object-contain"
        />
      )}
    </div>
  );
}
