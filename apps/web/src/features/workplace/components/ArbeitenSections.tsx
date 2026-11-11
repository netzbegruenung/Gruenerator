import { type MarketplaceItem } from '@gruenerator/contracts';
import {
  itemHref,
  marketplaceHref,
  useMarketplaceFrontpage,
} from '@gruenerator/shared/marketplace';
import { SectionHeader, cn } from '@gruenerator/ui';
import { type ReactNode, useState } from 'react';
import { PiHeart } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import {
  CANVAS_TOOLS,
  STUDIO_WERKZEUGE,
  TOOL_MENUS,
  WORKPLACE_TOOLS,
  filterWorkplaceTools,
} from '../../../config/workplaceToolsConfig';
import { useUserLibrary } from '../../agentura/hooks/useUserLibrary';
import { metaLine } from '../../marketplace/kindViews';
import { useMonitorLocaleParam } from '../../monitor/hooks/useMonitorLocaleParam';
import { HeadlineSlider } from '../../notebook/wissen/HeadlineSlider';
import { NotebookShelfBrowser } from '../../notebook/wissen/NotebookShelf';
import { PollCard } from '../../notebook/wissen/PollCard';
import { TrendsCard } from '../../notebook/wissen/TrendsCard';
import { useWissenNews } from '../../notebook/wissen/useWissenNews';
import { ASIDE_TITLE, ASIDE_TITLE_LINK, AsideCard } from '../../notebook/wissen/WissenLayout';

import { ARBEITEN_GRID } from './arbeitenGrid';

import type { IconType } from '../../../config/icons';

import { DASH_FOCUS, DASH_TINT, DASH_TINT_HOVER } from '@/components/dashboard/dashboardStyles';
import { getToolTheme } from '@/config/toolTheme';

/** Dashboard widgets (Briefing, Marktplatz): wide card first, then two narrow ones. */
const WIDGET_GRID = 'grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4';
const WIDE_SLOT = 'col-span-2 flex min-w-0 flex-col lg:col-span-3';
// The narrow cards take the row height but don't set it — the wide card does.
const NARROW_SLOT = 'flex min-w-0 flex-col lg:h-0 lg:min-h-full';

/** The neutral dashboard palette (see dashboardTokens.css) for embedded widgets. */
const NEUTRAL_SURFACE = 'dashboard-surface dashboard-neutral';

const SECTION_LINK =
  'text-sm font-semibold text-primary-600 no-underline hover:underline dark:text-primary-400';

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

export function NotebooksSection() {
  return (
    <ArbeitenSection
      title="Notebooks"
      action={
        <Link to="/wissen" className={SECTION_LINK}>
          Alle Notebooks
        </Link>
      }
    >
      <div className={cn(NEUTRAL_SURFACE, 'flex flex-col gap-3')}>
        <NotebookShelfBrowser gridClassName={ARBEITEN_GRID} />
      </div>
    </ArbeitenSection>
  );
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function ItemLink({
  item,
  className,
  children,
}: {
  item: MarketplaceItem;
  className: string;
  children: ReactNode;
}) {
  const href = itemHref(item) ?? marketplaceHref();
  return href.startsWith('http') ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
}

function CardTitle({ to, children }: { to: string; children: ReactNode }) {
  return (
    <h3 className={ASIDE_TITLE}>
      <Link to={to} className={ASIDE_TITLE_LINK}>
        {children}
      </Link>
    </h3>
  );
}

const SKELETON_BLOCK = 'rounded-xl bg-(--dash-skeleton)';

export function MarketplaceSection() {
  const page = useMarketplaceFrontpage();
  const { items: libraryItems } = useUserLibrary();
  const shelf = (id: 'neu' | 'beliebt') =>
    page.data?.shelves.find((s) => s.shelfId === id)?.items ?? [];
  const newItems = shelf('neu').slice(0, 3);
  const popularItems = shelf('beliebt').slice(0, 4);
  // Fixed at mount, so the weekly count does not drift between renders.
  const [weekAgo] = useState(() => Date.now() - WEEK_MS);
  const addedThisWeek = libraryItems.filter((i) => Date.parse(i.createdAt) >= weekAgo).length;

  return (
    <ArbeitenSection
      title="Marktplatz"
      action={
        <Link to={marketplaceHref()} className={SECTION_LINK}>
          Alles ansehen
        </Link>
      }
    >
      <div className={cn(NEUTRAL_SURFACE, WIDGET_GRID)}>
        <div className={WIDE_SLOT}>
          <AsideCard aria-label="Neu im Marktplatz" aria-busy={page.isPending}>
            <CardTitle to={marketplaceHref({ sort: 'neu' })}>Neu im Marktplatz</CardTitle>
            <ul className="m-0 grid flex-1 list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-3">
              {page.isPending
                ? Array.from({ length: 3 }, (_, i) => (
                    <li key={i} className={cn(SKELETON_BLOCK, 'h-20')} />
                  ))
                : newItems.map((item) => (
                    <li key={item.key} className="flex min-w-0">
                      <ItemLink
                        item={item}
                        className={cn(
                          'flex min-w-0 flex-1 flex-col gap-1 rounded-xl p-3.5 no-underline transition-colors',
                          DASH_TINT,
                          DASH_TINT_HOVER,
                          DASH_FOCUS
                        )}
                      >
                        <span className="truncate text-xs text-muted-foreground">
                          {metaLine(item)}
                        </span>
                        <span className="line-clamp-2 text-[15px] font-bold leading-snug text-foreground-heading">
                          {item.title}
                        </span>
                      </ItemLink>
                    </li>
                  ))}
            </ul>
            {!page.isPending && newItems.length === 0 && (
              <p className="m-0 text-sm text-muted-foreground">Gerade nichts Neues.</p>
            )}
          </AsideCard>
        </div>
        <div className={NARROW_SLOT}>
          <AsideCard aria-label="Beliebt" aria-busy={page.isPending}>
            <CardTitle to={marketplaceHref({ sort: 'beliebt' })}>Beliebt</CardTitle>
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {page.isPending
                ? Array.from({ length: 4 }, (_, i) => (
                    <li key={i} className={cn(SKELETON_BLOCK, 'h-5')} />
                  ))
                : popularItems.map((item, index) => (
                    <li key={item.key} className="flex min-w-0 items-center gap-2 text-sm">
                      <span className="w-3 shrink-0 font-bold text-muted-foreground">
                        {index + 1}
                      </span>
                      <ItemLink
                        item={item}
                        className={cn(
                          'min-w-0 flex-1 truncate rounded font-semibold text-foreground no-underline hover:underline',
                          DASH_FOCUS
                        )}
                      >
                        {item.title}
                      </ItemLink>
                      <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
                        <PiHeart aria-hidden />
                        <span className="sr-only">Gefällt</span>
                        {item.likesCount}
                      </span>
                    </li>
                  ))}
            </ol>
          </AsideCard>
        </div>
        <div className={NARROW_SLOT}>
          <AsideCard aria-label="Deine Grüneratoren">
            <CardTitle to="/grueneratoren">Deine Grüneratoren</CardTitle>
            <span className="text-sm text-muted-foreground">Aus dem Marktplatz hinzugefügt</span>
            <span className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="text-4xl font-bold tabular-nums text-foreground-heading">
                {libraryItems.length}
              </span>
              {addedThisWeek > 0 && (
                <span className="text-sm font-bold text-(--dash-mg)">
                  {addedThisWeek} neu diese Woche
                </span>
              )}
            </span>
          </AsideCard>
        </div>
      </div>
    </ArbeitenSection>
  );
}

interface ToolCard {
  id: string;
  title: string;
  path?: string;
  href?: string;
  icon: IconType;
}

const ALL_TOOLS: ToolCard[] = [
  ...CANVAS_TOOLS,
  ...STUDIO_WERKZEUGE,
  ...WORKPLACE_TOOLS,
  ...TOOL_MENUS.flatMap((menu) => menu.items),
];

/** Picks tools from the registry mirrors by id, optionally renamed for the card. */
function pickTools(entries: readonly (readonly [id: string, title?: string])[]): ToolCard[] {
  return filterWorkplaceTools(
    entries.flatMap(([id, title]) => {
      const tool = ALL_TOOLS.find((t) => t.id === id);
      return tool ? [{ ...tool, title: title ?? tool.title }] : [];
    })
  );
}

export const MEDIA_TOOLS = pickTools([
  ['profilbild'],
  ['reels-untertitel', 'Video'],
  ['studio-voice'],
  ['transkription'],
  ['mediathek'],
]);

export const MORE_TOOLS = pickTools([
  ['uebersetzer'],
  ['scanner'],
  ['zeichenzaehler'],
  ['projekte'],
]);

const TOOL_CARD =
  'group relative flex h-24 items-center overflow-hidden rounded-2xl px-4 no-underline transition-shadow ' +
  'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 md:h-28';

function ToolCardLink({ tool }: { tool: ToolCard }) {
  const theme = getToolTheme(tool.id) ?? getToolTheme('weitere');
  const Icon = tool.icon;
  const body = (
    <>
      <span
        className={cn(
          'relative z-10 max-w-[55%] text-[15px] font-bold leading-tight hyphens-auto md:text-base',
          theme?.title
        )}
      >
        {tool.title}
      </span>
      {/* Two tilted sheets peeking from the bottom-right corner; the front one lifts on hover. */}
      <span aria-hidden className="absolute -bottom-3 right-1 h-20 w-[44%] md:h-24">
        <span className="absolute bottom-0 right-[30%] h-[78%] w-[58%] -rotate-[8deg] rounded-lg bg-background/60" />
        <span
          className={cn(
            'absolute bottom-0 right-[8%] flex h-[90%] w-[62%] -rotate-6 items-center justify-center rounded-lg bg-background shadow-md',
            'transition-transform duration-200 group-hover:-translate-y-1 group-hover:-rotate-3 motion-reduce:transition-none',
            theme?.icon
          )}
        >
          <Icon className="size-7 md:size-8" />
        </span>
      </span>
    </>
  );
  const className = cn(TOOL_CARD, theme?.tile ?? 'bg-grey-50 dark:bg-grey-800/40');
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
  ...rest
}: {
  title: string;
  tools: ToolCard[];
  'data-tour'?: string;
}) {
  if (tools.length === 0) return null;
  return (
    <ArbeitenSection title={title} {...rest}>
      <ul className={cn(ARBEITEN_GRID, 'm-0 list-none p-0')}>
        {tools.map((tool) => (
          <li key={tool.id}>
            <ToolCardLink tool={tool} />
          </li>
        ))}
      </ul>
    </ArbeitenSection>
  );
}
