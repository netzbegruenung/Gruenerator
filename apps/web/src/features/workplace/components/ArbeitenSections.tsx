import {
  collectionCardsFor,
  marketplaceHref,
  useMarketplaceFrontpage,
} from '@gruenerator/shared/marketplace';
import { SectionHeader, cn } from '@gruenerator/ui';
import { type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  CANVAS_TOOLS,
  OFFICE_TOOLS,
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
import { ASIDE_SLOT } from '../../notebook/wissen/WissenLayout';

import { ARBEITEN_GRID, SECTION_LINK } from './arbeitenGrid';
import { TOOL_PREVIEWS } from './ToolPreviews';

import type { IconType } from '../../../config/icons';

import { getToolTheme } from '@/config/toolTheme';

/**
 * Briefing widgets: the wide card first, then two narrow ones. One row only
 * from xl: below that a fifth of the page is too narrow for the poll's party
 * list, so the news card takes its own row and the two others share the next.
 */
const WIDGET_GRID = 'grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-5';
// In einer Zeile (xl) gibt die breite Karte die Höhe vor. Die Mindesthöhe hält sie auch
// im Ladezustand und ohne Meldungen, sonst schneidet die Zeile Trends und Umfragen ab.
const WIDE_SLOT =
  'col-span-2 flex min-w-0 flex-col xl:col-span-3 xl:min-h-[20rem] xl:[&>section]:flex-1';

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
            showTitle={false}
            items={news.headlines}
            loading={news.headlinesPending}
            to={briefingPath}
          />
        </div>
        <div className={ASIDE_SLOT}>
          <TrendsCard locale={locale} to={withLocale('/briefing?karte=keywords')} />
        </div>
        <div className={ASIDE_SLOT}>
          <PollCard locale={locale} to={withLocale('/umfragen')} />
        </div>
      </div>
    </ArbeitenSection>
  );
}

export function MarketplaceSection() {
  const page = useMarketplaceFrontpage();
  const navigate = useNavigate();

  // Without cards `CollectionCards` renders nothing; don't leave the heading standing alone.
  if (!page.isPending && collectionCardsFor(page.data?.collections ?? []).length === 0) {
    return null;
  }

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
          slim
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
  ...OFFICE_TOOLS,
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

/**
 * „Mach mehr mit deinem Grünerator": six cards in a 3 × 2 grid (two columns on phones).
 * Each card wears its tool's tile colour from `toolTheme`; Vertonen & transkribieren and the
 * Übersetzer have no theme of their own and borrow coral and the neutral grey.
 */
export const MEDIA_GRID = 'grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-4';

// Every card says what the tool does.
export const MEDIA_TOOLS = pickTools([
  { id: 'reels-untertitel', theme: 'mediathek', title: 'Videos bearbeiten' },
  // The Notebooks live on /wissen (/notebooks redirects there).
  { id: 'wissen', theme: 'wissen', title: 'Notebooks durchsuchen' },
  { id: 'canvas-vorlagen', theme: 'canvas-vorlagen', title: 'Vorlagen durchsuchen' },
  { id: 'profilbild', theme: 'profilbild', title: 'Profilbild erstellen' },
  // Vertonen and Transkription become one tool; until then the card links to Voice as an example.
  { id: 'studio-voice', theme: 'bild-erweitern', title: 'Vertonen & transkribieren' },
  { id: 'uebersetzer', theme: 'weitere', title: 'Texte übersetzen' },
]);

const TOOL_CARD =
  'group relative flex h-24 items-center overflow-hidden rounded-2xl px-4 no-underline transition-shadow ' +
  'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 md:h-28';

function ToolCardLink({ tool }: { tool: ToolCard }) {
  const theme = getToolTheme(tool.theme ?? tool.id) ?? getToolTheme('weitere');
  const Icon = tool.icon;
  const preview = TOOL_PREVIEWS[tool.id];
  const body = (
    <>
      <span
        className={cn(
          // Whole words only: a hyphenated „transkribie-ren" reads worse than two balanced lines.
          'relative z-10 max-w-[56%] text-[17px] font-bold leading-tight text-balance md:text-lg',
          theme?.title,
          // A phone card is ~170 px wide: the title takes the top, the picture the corner below.
          preview && 'max-sm:max-w-none max-sm:self-start max-sm:pt-3.5'
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
          preview
            ? 'right-3 max-sm:-bottom-4 max-sm:h-14 max-sm:w-[4.5rem] sm:right-4 sm:w-28 md:w-32'
            : 'right-1 w-[44%]'
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
  gridClassName = ARBEITEN_GRID,
  ...rest
}: {
  title: string;
  tools: ToolCard[];
  /** Defaults to the page grid; „Mach mehr mit deinem Grünerator" uses 3 × 2. */
  gridClassName?: string;
  'data-tour'?: string;
}) {
  if (tools.length === 0) return null;
  return (
    <ArbeitenSection title={title} {...rest}>
      <ul className={cn(gridClassName, 'm-0 list-none p-0')}>
        {tools.map((tool) => (
          <li key={tool.id}>
            <ToolCardLink tool={tool} />
          </li>
        ))}
      </ul>
    </ArbeitenSection>
  );
}
