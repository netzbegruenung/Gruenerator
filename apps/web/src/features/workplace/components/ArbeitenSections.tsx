import { type MarketplaceItem } from '@gruenerator/contracts';
import {
  featureById,
  itemHref,
  marketplaceHref,
  useMarketplaceFrontpage,
} from '@gruenerator/shared/marketplace';
import { Button, SectionHeader, cn } from '@gruenerator/ui';
import { type ReactNode } from 'react';
import { PiChatCircleText, PiCheck, PiPlus, PiSparkle } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import {
  CANVAS_TOOLS,
  STUDIO_WERKZEUGE,
  TOOL_MENUS,
  WORKPLACE_TOOLS,
  filterWorkplaceTools,
} from '../../../config/workplaceToolsConfig';
import { chatPathOf, metaLine, viewOf } from '../../marketplace/kindViews';
import {
  type MarketplaceActions,
  useMarketplaceActions,
} from '../../marketplace/useMarketplaceActions';
import { useMonitorLocaleParam } from '../../monitor/hooks/useMonitorLocaleParam';
import { HeadlineSlider } from '../../notebook/wissen/HeadlineSlider';
import { PollCard } from '../../notebook/wissen/PollCard';
import { TrendsCard } from '../../notebook/wissen/TrendsCard';
import { useWissenNews } from '../../notebook/wissen/useWissenNews';
import { AsideCard } from '../../notebook/wissen/WissenLayout';

import { ARBEITEN_GRID } from './arbeitenGrid';

import type { IconType } from '../../../config/icons';

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

const SKELETON_BLOCK = 'rounded-xl bg-(--dash-skeleton)';

/** „Zu meinen Grüneratoren" — only for items that aren't the person's own. */
function SaveButton({ item, actions }: { item: MarketplaceItem; actions: MarketplaceActions }) {
  if (item.isOwn) return null;
  const label = item.saved ? viewOf(item).saveLabel.added : viewOf(item).saveLabel.add;
  const Icon = item.saved ? PiCheck : PiPlus;
  return (
    <Button variant="outline" aria-pressed={item.saved} onClick={() => actions.toggleSave(item)}>
      <Icon aria-hidden />
      {label}
    </Button>
  );
}

function FeaturedCard({ item, actions }: { item: MarketplaceItem; actions: MarketplaceActions }) {
  const page = useMarketplaceFrontpage();
  const feature = featureById(page.data?.featureId ?? null);
  const chatPath = chatPathOf(item);
  const visual = viewOf(item).visual(item);
  return (
    <AsideCard
      aria-labelledby="arbeiten-marktplatz-tipp"
      className="md:flex-row md:items-center md:gap-6"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-(--dash-mg)">
          {feature?.kicker ?? 'Neu im Marktplatz'}
        </span>
        <h3
          id="arbeiten-marktplatz-tipp"
          className="m-0 text-2xl font-bold leading-tight text-balance text-foreground-heading md:text-[28px]"
        >
          {item.title}
        </h3>
        <p className="m-0 line-clamp-3 max-w-[34rem] text-[15px] leading-relaxed text-muted-foreground">
          {feature?.pitch ?? item.description}
        </p>
        <span className="text-[13px] text-muted-foreground">{metaLine(item)}</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {chatPath ? (
            <Button asChild>
              <Link to={chatPath}>
                <PiChatCircleText aria-hidden />
                Im Chat ausprobieren
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <ItemLink item={item} className="">
                Ansehen
              </ItemLink>
            </Button>
          )}
          <SaveButton item={item} actions={actions} />
        </div>
      </div>
      <span
        aria-hidden
        className="hidden size-28 shrink-0 items-center justify-center rounded-3xl bg-(--dash-mg-tint) text-6xl text-(--dash-mg) md:flex"
      >
        {visual.type === 'icon' ? visual.icon : <PiSparkle />}
      </span>
    </AsideCard>
  );
}

export function MarketplaceSection() {
  const page = useMarketplaceFrontpage();
  const { actions, dialogs } = useMarketplaceActions();
  const featured = page.data?.featured ?? null;

  return (
    <ArbeitenSection
      title="Marktplatz"
      action={
        <Link to={marketplaceHref()} className={SECTION_LINK}>
          Zum Marktplatz
        </Link>
      }
    >
      <div className={NEUTRAL_SURFACE}>
        {page.isPending ? (
          <div className={cn(SKELETON_BLOCK, 'h-56 rounded-[20px]')} />
        ) : (
          featured && <FeaturedCard item={featured} actions={actions} />
        )}
      </div>
      {dialogs}
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
export const MEDIA_TOOLS = pickTools([
  { id: 'canvas-vorlagen', theme: 'canvas-ki' },
  { id: 'profilbild', theme: 'canvas-ki' },
  { id: 'reels-untertitel', theme: 'canvas-ki', title: 'Video' },
  { id: 'studio-voice', theme: 'canvas-ki' },
  { id: 'transkription', theme: 'canvas-ki' },
  { id: 'mediathek', theme: 'canvas-ki' },
]);

// Weitere Werkzeuge: one pastel each — teal, coral, soft yellow, blue.
export const MORE_TOOLS = pickTools([
  { id: 'uebersetzer', theme: 'canvas-vorlagen' },
  { id: 'scanner', theme: 'bild-erweitern' },
  { id: 'zeichenzaehler', theme: 'agents' },
  { id: 'projekte', theme: 'projekte' },
]);

const TOOL_CARD =
  'group relative flex h-24 items-center overflow-hidden rounded-2xl px-4 no-underline transition-shadow ' +
  'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 md:h-28';

function ToolCardLink({ tool }: { tool: ToolCard }) {
  const theme = getToolTheme(tool.theme ?? tool.id) ?? getToolTheme('weitere');
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
