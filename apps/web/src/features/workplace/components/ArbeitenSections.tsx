import { marketplaceHref, useMarketplaceFrontpage } from '@gruenerator/shared/marketplace';
import { SectionHeader, cn } from '@gruenerator/ui';
import { type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  CANVAS_TOOLS,
  STUDIO_WERKZEUGE,
  TOOL_MENUS,
  WORKPLACE_TOOLS,
  filterWorkplaceTools,
} from '../../../config/workplaceToolsConfig';
import { CollectionCards } from '../../marketplace/MarketplaceCollections';
import { useMonitorLocaleParam } from '../../monitor/hooks/useMonitorLocaleParam';
import { HeadlineSlider } from '../../notebook/wissen/HeadlineSlider';
import { PollCard } from '../../notebook/wissen/PollCard';
import { TrendsCard } from '../../notebook/wissen/TrendsCard';
import { useWissenNews } from '../../notebook/wissen/useWissenNews';

import { ARBEITEN_GRID, SECTION_LINK } from './arbeitenGrid';
import { SHOW_TOOL_PREVIEWS, TOOL_PREVIEWS } from './ToolPreviews';

import type { IconType } from '../../../config/icons';

import { getToolTheme } from '@/config/toolTheme';

/** Dashboard widgets (Briefing, Marktplatz): wide card first, then two narrow ones. */
const WIDGET_GRID = 'grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4';
const WIDE_SLOT = 'col-span-2 flex min-w-0 flex-col lg:col-span-3';
// The narrow cards take the row height but don't set it — the wide card does.
const NARROW_SLOT = 'flex min-w-0 flex-col lg:h-0 lg:min-h-full';

/** The neutral dashboard palette (see dashboardTokens.css) for embedded widgets. */
const NEUTRAL_SURFACE = 'dashboard-surface dashboard-neutral';

export function ArbeitenSection({
  title,
  action,
  children,
  ...rest
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  'data-tour'?: string;
}) {
  return (
    <section aria-label={title} className="flex flex-col" {...rest}>
      <SectionHeader title={title} actions={action} />
      {children}
    </section>
  );
}

export function BriefingSection() {
  const { locale, withLocale } = useMonitorLocaleParam();
  const news = useWissenNews(locale);
  const briefingPath = withLocale('/briefing');

  return (
    <ArbeitenSection
      title="Grünerator Briefing"
      action={
        <Link to={briefingPath} className={SECTION_LINK}>
          Ganzes Briefing
        </Link>
      }
    >
      <div className={cn(NEUTRAL_SURFACE, WIDGET_GRID)}>
        <div className={WIDE_SLOT}>
          <HeadlineSlider
            title="Nachrichten"
            items={news.headlines}
            loading={news.headlinesPending}
            to={briefingPath}
          />
        </div>
        <div className={NARROW_SLOT}>
          <TrendsCard locale={locale} to={withLocale('/briefing?karte=keywords')} />
        </div>
        <div className={NARROW_SLOT}>
          <PollCard locale={locale} to={withLocale('/umfragen')} />
        </div>
      </div>
    </ArbeitenSection>
  );
}

export function MarketplaceSection() {
  const page = useMarketplaceFrontpage();
  const navigate = useNavigate();

  return (
    <ArbeitenSection
      title="Marktplatz"
      action={
        <Link to={marketplaceHref()} className={SECTION_LINK}>
          Zum Marktplatz
        </Link>
      }
    >
      {page.isPending ? (
        <div className={cn(NEUTRAL_SURFACE, 'grid grid-cols-1 gap-md md:grid-cols-3')}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-[4/3] rounded-2xl bg-(--dash-skeleton)" />
          ))}
        </div>
      ) : (
        <CollectionCards
          title={null}
          scroll
          collections={page.data?.collections ?? []}
          onOpen={(collection) => navigate(marketplaceHref({ collection }))}
        />
      )}
    </ArbeitenSection>
  );
}

interface ToolCard {
  id: string;
  title: string;
  path?: string;
  href?: string;
  icon: IconType;
  /** `toolTheme` key for the card colour. */
  theme?: string;
}

const ALL_TOOLS: ToolCard[] = [
  ...CANVAS_TOOLS,
  ...STUDIO_WERKZEUGE,
  ...WORKPLACE_TOOLS,
  ...TOOL_MENUS.flatMap((menu) => menu.items),
];

/** Picks tools from the registry mirrors by id, with the card's colour and an optional new title. */
function pickTools(entries: readonly { id: string; theme: string; title?: string }[]): ToolCard[] {
  return filterWorkplaceTools(
    entries.flatMap(({ id, theme, title }) => {
      const tool = ALL_TOOLS.find((t) => t.id === id);
      return tool ? [{ ...tool, title: title ?? tool.title, theme }] : [];
    })
  );
}

// Bild & Video reads as one family: every card in the Studio lavender.
/** Bild & Video: six cards in a 3 × 2 grid (two columns on phones). */
export const MEDIA_GRID = 'grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-4';

// Most cards say what the tool does; the Mediathek keeps its name.
export const MEDIA_TOOLS = pickTools([
  { id: 'canvas-vorlagen', theme: 'canvas-ki', title: 'Vorlagen durchsuchen' },
  { id: 'profilbild', theme: 'canvas-ki', title: 'Profilbild erstellen' },
  { id: 'reels-untertitel', theme: 'canvas-ki', title: 'Videos bearbeiten' },
  { id: 'studio-voice', theme: 'canvas-ki', title: 'Texte vertonen' },
  { id: 'transkription', theme: 'canvas-ki', title: 'Sitzungen transkribieren' },
  { id: 'mediathek', theme: 'canvas-ki' },
]);

/** Three tools: one row of three, stacked on a phone so none stands alone. */
export const MORE_GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-4';

// Weitere Werkzeuge: one pastel each — teal, coral, soft yellow.
export const MORE_TOOLS = pickTools([
  { id: 'uebersetzer', theme: 'canvas-vorlagen' },
  { id: 'scanner', theme: 'bild-erweitern' },
  { id: 'zeichenzaehler', theme: 'agents' },
]);

const TOOL_CARD =
  'group relative flex h-24 items-center overflow-hidden rounded-2xl px-4 no-underline transition-shadow ' +
  'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 md:h-28';

// Cards with a preview picture sit on a light pastel that changes from card to card
// (mint, peach, sky, butter, rosé, lavender).
const PREVIEW_GROUNDS = [
  'bg-[#eaf4ee] dark:bg-[#17241d]',
  'bg-[#fbeee6] dark:bg-[#2a1d16]',
  'bg-[#e8f0f8] dark:bg-[#162130]',
  'bg-[#faf4dc] dark:bg-[#26220f]',
  'bg-[#f8e9ef] dark:bg-[#2a1720]',
  'bg-[#efedf8] dark:bg-[#1f1b2e]',
];

function ToolCardLink({ tool, index }: { tool: ToolCard; index: number }) {
  const theme = getToolTheme(tool.theme ?? tool.id) ?? getToolTheme('weitere');
  const Icon = tool.icon;
  const preview = SHOW_TOOL_PREVIEWS ? TOOL_PREVIEWS[tool.id] : undefined;
  const body = (
    <>
      <span
        className={cn(
          'relative z-10 max-w-[55%] text-[15px] font-bold leading-tight hyphens-auto md:text-base',
          preview ? 'text-foreground-heading' : theme?.title
        )}
      >
        {tool.title}
      </span>
      {/* Two tilted sheets peeking from the bottom-right corner; the front one lifts on hover. */}
      {/* A preview keeps a fixed, slightly upright sheet; on wide cards a percentage would stretch it. */}
      <span
        aria-hidden
        className={cn(
          'absolute -bottom-3 h-20 md:h-24',
          preview ? 'right-4 w-28 md:w-32' : 'right-1 w-[44%]'
        )}
      >
        <span
          className={cn(
            'absolute bottom-0 rounded-lg',
            preview
              ? 'right-[34%] h-[82%] w-[56%] -rotate-[10deg] bg-background/60'
              : 'right-[30%] h-[78%] w-[58%] -rotate-[8deg] bg-background/60'
          )}
        />
        <span
          className={cn(
            'absolute bottom-0 right-[8%] flex h-[90%] w-[62%] -rotate-6 items-center justify-center overflow-hidden rounded-lg bg-background shadow-md',
            preview && 'h-full w-[66%] -rotate-[5deg] shadow-lg',
            'transition-transform duration-200 group-hover:-translate-y-1 group-hover:-rotate-3 motion-reduce:transition-none',
            theme?.icon
          )}
        >
          {preview ?? <Icon className="size-7 md:size-8" />}
        </span>
      </span>
    </>
  );
  const className = cn(
    TOOL_CARD,
    preview
      ? PREVIEW_GROUNDS[index % PREVIEW_GROUNDS.length]
      : (theme?.tile ?? 'bg-grey-50 dark:bg-grey-800/40')
  );
  return tool.href ? (
    <a href={tool.href} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <Link to={tool.path ?? '/'} className={className}>
      {body}
    </Link>
  );
}

export function ToolCardsSection({
  title,
  tools,
  gridClassName = ARBEITEN_GRID,
  ...rest
}: {
  title: string;
  tools: ToolCard[];
  /** Defaults to the page grid; Bild & Video uses 3 × 2. */
  gridClassName?: string;
  'data-tour'?: string;
}) {
  if (tools.length === 0) return null;
  return (
    <ArbeitenSection title={title} {...rest}>
      <ul className={cn(gridClassName, 'm-0 list-none p-0')}>
        {tools.map((tool, index) => (
          <li key={tool.id}>
            <ToolCardLink tool={tool} index={index} />
          </li>
        ))}
      </ul>
    </ArbeitenSection>
  );
}
