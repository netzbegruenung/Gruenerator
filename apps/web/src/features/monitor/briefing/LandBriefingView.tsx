import { type LandBriefing } from '@gruenerator/contracts';
import {
  type BriefingLand,
  buildBriefingLead,
  landtagNewsItems,
  lvArticleNewsItems,
  monitorNewsItems,
  standLine,
} from '@gruenerator/shared/monitor';
import { cn } from '@gruenerator/ui';

import { BriefingRow, type BriefingCardId, type BriefingCardState } from './BriefingCard';
import { BriefingLeadLine } from './BriefingLeadLine';
import { NewsCard } from './NewsCard';
import { PollCard } from './PollCard';
import { KeywordsCard, ThemenCard } from './SignalCards';

import { DashboardPage, DASH_PAGE_TITLE } from '@/components/dashboard/DashboardPage';
import { DASH_MUTED } from '@/components/dashboard/dashboardStyles';

const SIGNAL_CARDS: readonly BriefingCardId[] = ['themen', 'keywords', 'umfrage'];

/**
 * Ein Thema trägt den Leitsatz erst ab so vielen Artikeln. Im Land sind viele
 * Meldungen reine Überschriften ohne NLP-Thema; ein einzelner klassifizierter
 * Artikel würde sonst „Heute bestimmt Sicherheit die Nachrichten in Hessen" behaupten.
 */
const MIN_LEAD_TOPIC_ARTICLES = 3;

export interface LandBriefingViewProps {
  land: BriefingLand;
  /** `null`, solange es lädt. */
  briefing: LandBriefing | null;
  pending: boolean;
  open: BriefingCardId | null;
  onToggle: (card: BriefingCardId) => void;
  onOpen: (card: BriefingCardId) => void;
  withLocale: (path: string) => string;
}

/**
 * /briefing?land= — dieselbe Seite wie bundesweit, auf ein Land zugeschnitten:
 * die Umfrage steht an der Stelle der X-Trends, die zweite Reihe bekommt den
 * Landesverband und, wo es ein aktuelles Notebook gibt, den Landtag.
 *
 * Vorerst nur über die Adresse erreichbar; keine Oberfläche verlinkt hierher.
 */
export function LandBriefingView({
  land,
  briefing,
  pending,
  open,
  onToggle,
  onOpen,
  withLocale,
}: LandBriefingViewProps) {
  const card = (id: BriefingCardId): BriefingCardState => ({
    id,
    open: open === id,
    onToggle: () => onToggle(id),
  });
  const pick = <T,>(value: (b: LandBriefing) => T, empty: T): T | null =>
    pending ? null : briefing ? value(briefing) : empty;

  const lead = briefing
    ? buildBriefingLead(
        briefing.topics.filter((t) => t.articleCount >= MIN_LEAD_TOPIC_ARTICLES),
        briefing.greens
      )
    : null;
  const signalOpen = open !== null && SIGNAL_CARDS.includes(open);

  return (
    <DashboardPage aria-busy={pending}>
      <h1 className={DASH_PAGE_TITLE}>
        Briefing <span className={DASH_MUTED}>{land.name}</span>
      </h1>

      <BriefingLeadLine lead={lead} pending={pending} onOpen={onOpen} place={land.place} />

      <BriefingRow hasOpen={signalOpen}>
        <ThemenCard
          state={card('themen')}
          topics={pick((b) => b.topics, [])}
          withLocale={withLocale}
        />
        <KeywordsCard state={card('keywords')} keywords={pick((b) => b.keywords, [])} />
        <PollCard state={card('umfrage')} poll={briefing?.poll ?? null} pending={pending} />
      </BriefingRow>

      <BriefingRow hasOpen={open !== null && !signalOpen}>
        <NewsCard
          state={card('wichtig')}
          title="Heute wichtig"
          list={{ items: monitorNewsItems(briefing?.important ?? []), pending }}
          emptyText={`Gerade keine Meldungen ${land.place}.`}
        />
        <NewsCard
          state={card('gruene')}
          title="Über die Grünen"
          list={{ items: monitorNewsItems(briefing?.greens ?? []), pending }}
          emptyText={`Keine Berichte über die Grünen ${land.place} in den letzten 24 Stunden.`}
        />
        {briefing?.landesverband && (
          <NewsCard
            state={card('landesverbaende')}
            title="Landesverband"
            list={{ items: lvArticleNewsItems(briefing.landesverband), pending: false }}
            emptyText="Landesverband und Fraktion haben in den letzten 30 Tagen nichts veröffentlicht."
          />
        )}
        {briefing?.landtag && (
          <NewsCard
            state={card('landtag')}
            title="Landtag"
            list={{ items: landtagNewsItems(briefing.landtag), pending: false }}
            emptyText="Im Landtag ist in den letzten sieben Tagen nichts erschienen."
          />
        )}
      </BriefingRow>

      {briefing && (
        <span className={cn('pt-2 text-[13px]', DASH_MUTED)}>{standLine(briefing)}</span>
      )}
    </DashboardPage>
  );
}
