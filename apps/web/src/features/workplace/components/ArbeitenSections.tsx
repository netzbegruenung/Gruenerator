import {
  collectionCardsFor,
  marketplaceHref,
  useMarketplaceFrontpage,
} from '@gruenerator/shared/marketplace';
import { SectionHeader, cn } from '@gruenerator/ui';
import { type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { toolLink, type ToolId } from '../../../config/toolRegistry';
import { filterWorkplaceTools } from '../../../config/workplaceToolsConfig';
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

export interface ToolCard {
  id: string;
  title: string;
  /** One line under the title (the Studio's cards; the Arbeiten cards go without). */
  description?: string;
  badge?: string;
  path?: string;
  href?: string;
  icon: IconType;
  /** `toolTheme` key for the card colour. */
  theme?: string;
}

/** Picks tools from the registry by id, with the card's colour and an optional new title. */
function pickTools(entries: readonly { id: ToolId; theme: string; title?: string }[]): ToolCard[] {
  return filterWorkplaceTools(
    entries.map(({ id, theme, title }) => {
      const tool = toolLink(id);
      return { ...tool, title: title ?? tool.title, theme };
    })
  );
}

/**
 * „Mach mehr mit deinem Grünerator": six cards in a 3 × 2 grid (two columns on phones).
 * Six different hues from the `toolTheme` palette, so the row reads colourful even
 * though most of these tools are green in their own right: a card borrows another
 * theme's colours where its own would repeat a neighbour's (only the colours — the
 * link and the picture stay the tool's). No two neighbours, across or down, share a hue.
 */
export const MEDIA_GRID = 'grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-4';

// Every card says what the tool does.
export const MEDIA_TOOLS = pickTools([
  // The Studio: video tools and the Mediathek with every Sharepic, KI-Bild and video.
  { id: 'canvas', theme: 'reels-untertitel', title: 'Videos & Sharepics' },
  // Projekte take in the Notebooks later; the card already carries their name.
  { id: 'projekte', theme: 'projekte', title: 'In Projekten arbeiten' },
  { id: 'canvas-vorlagen', theme: 'vorlagen', title: 'Vorlagen durchsuchen' },
  { id: 'profilbild', theme: 'agents', title: 'Profilbild erstellen' },
  { id: 'voice', theme: 'voice', title: 'Vertonen & transkribieren' },
  { id: 'uebersetzer', theme: 'canvas', title: 'Texte übersetzen' },
]);

const TOOL_CARD =
  'group relative flex h-24 items-center overflow-hidden rounded-2xl px-4 no-underline transition-shadow ' +
  'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 md:h-28';

/**
 * `white`: a white card whose sheets carry a green border; the theme colours title and icon,
 * for the Studio, where the media grid below is white too. Default: the tinted Arbeiten card.
 */
export function ToolCardLink({
  tool,
  surface = 'tinted',
  onClick,
}: {
  tool: ToolCard;
  surface?: 'tinted' | 'white';
  /** Runs before the link navigates, e.g. to hand the chat a draft. */
  onClick?: () => void;
}) {
  const white = surface === 'white';
  const theme = getToolTheme(tool.theme ?? tool.id) ?? getToolTheme('weitere');
  const Icon = tool.icon;
  const preview = TOOL_PREVIEWS[tool.id];
  const body = (
    <>
      <span
        className={cn(
          // Whole words only: a hyphenated „transkribie-ren" reads worse than two balanced lines.
          'relative z-10 text-[17px] font-bold leading-tight text-balance md:text-lg',
          // Tablet: three white cards in a row are too narrow for the sheets, the text takes the card.
          white ? 'max-w-[68%] md:max-lg:max-w-none' : 'max-w-[56%]',
          theme?.title,
          // A narrow card (phone, or three across on a tablet): the title takes the full top,
          // the picture the corner below it. Side by side needs ~290 px.
          preview && '@max-[18rem]:max-w-none'
        )}
      >
        <span className="flex items-center gap-2">
          {tool.title}
          {tool.badge && (
            <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[11px] leading-tight font-bold text-white">
              {tool.badge}
            </span>
          )}
        </span>
        {tool.description && (
          <span className={cn('mt-0.5 block text-sm font-normal', theme?.desc)}>
            {tool.description}
          </span>
        )}
      </span>
      {/* Two tilted sheets peeking from the bottom-right corner; the front one lifts on hover. */}
      {/* A preview keeps a fixed, slightly upright sheet; on wide cards a percentage would stretch it. */}
      <span
        aria-hidden
        className={cn(
          'absolute -bottom-3 h-20 md:h-24',
          white && 'md:max-lg:hidden',
          preview
            ? 'right-4 w-28 md:w-32 @max-[18rem]:right-3 @max-[18rem]:h-[76px] @max-[18rem]:w-[92px]'
            : white
              ? 'right-1 w-[30%] max-w-32'
              : 'right-1 w-[44%]'
        )}
      >
        <span
          className={cn(
            'absolute bottom-0 rounded-lg',
            preview
              ? 'right-[34%] h-[82%] w-[56%] -rotate-[10deg]'
              : 'right-[30%] h-[78%] w-[58%] -rotate-[8deg]',
            white
              ? 'bg-background border border-primary-300 dark:border-primary-700 opacity-70'
              : 'bg-background/60'
          )}
        />
        <span
          className={cn(
            'absolute bottom-0 right-[8%] flex h-[90%] w-[62%] -rotate-6 items-center justify-center overflow-hidden rounded-lg shadow-md',
            'bg-background',
            white && 'border border-primary-300 dark:border-primary-700',
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
    // A white card carries a description: it grows with its text instead of clipping it.
    white && 'h-full min-h-20 py-4 md:h-full md:min-h-24',
    // Narrow card: two lines of title on top, the picture below them (never under the text).
    preview && '@max-[18rem]:h-[132px] @max-[18rem]:items-start @max-[18rem]:pt-4',
    white
      ? 'border border-grey-200 bg-background dark:border-grey-800'
      : (theme?.tile ?? 'bg-grey-50 dark:bg-grey-800/40')
  );
  return tool.href ? (
    <a href={tool.href} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
  ) : (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Link ist auf 'a' gemappt, jsx-a11y prüft dabei nur href statt to; Enter auf dem Link löst denselben Klick aus
    <Link to={tool.path ?? '/'} className={className} onClick={onClick}>
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
          // The card lays itself out by its own width (see ToolCardLink).
          <li key={tool.id} className="@container">
            <ToolCardLink tool={tool} />
          </li>
        ))}
      </ul>
    </ArbeitenSection>
  );
}
