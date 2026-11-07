import { type TopicCategory } from '@gruenerator/contracts';
import { type BriefingLead } from '@gruenerator/shared/monitor';
import { cn } from '@gruenerator/ui';
import { Fragment, type ReactNode } from 'react';

import { TOPIC_CONFIG } from '../topicConfig';

import { type BriefingCardId } from './BriefingCard';

import { Bone } from '@/components/dashboard/Bone';
import { DASH_DISPLAY, DASH_FOCUS, DASH_HEADING } from '@/components/dashboard/dashboardStyles';

const LINE = cn(
  'm-0 max-w-[920px] text-[clamp(21px,3.4vw,30px)] font-semibold leading-[1.32] text-pretty',
  DASH_DISPLAY,
  DASH_HEADING
);

/** Ein Knopf im Leitsatz: unterstrichen in der Akzentfarbe, klappt eine Karte auf. */
function LeadButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-sm border-0 bg-transparent p-0 font-[inherit] text-(--dash-mg) underline decoration-2 underline-offset-[5px]',
        DASH_FOCUS
      )}
    >
      {children}
    </button>
  );
}

/** Themen im Satz als Knöpfe, die ihre Karte aufklappen; zwei Themen mit „und". */
function TopicButtons({
  topics,
  card,
  onOpen,
}: {
  topics: TopicCategory[];
  card: BriefingCardId;
  onOpen: (card: BriefingCardId) => void;
}) {
  return topics.map((t, i) => (
    <Fragment key={t}>
      {i > 0 && ' und '}
      <LeadButton onClick={() => onOpen(card)}>{TOPIC_CONFIG[t].name}</LeadButton>
    </Fragment>
  ));
}

/** Der Leitsatz über den Karten — Aufbau siehe `buildBriefingLead`. */
export function BriefingLeadLine({
  lead,
  pending,
  onOpen,
}: {
  lead: BriefingLead | null;
  pending: boolean;
  onOpen: (card: BriefingCardId) => void;
}) {
  if (pending) {
    return (
      <div aria-hidden className="flex max-w-[920px] flex-col gap-3">
        <Bone className="h-[clamp(24px,3.4vw,34px)] w-full" />
        <Bone className="h-[clamp(24px,3.4vw,34px)] w-3/5" />
      </div>
    );
  }
  if (!lead) return null;

  return (
    <p className={LINE}>
      Heute {lead.news.length > 1 ? 'bestimmen' : 'bestimmt'}{' '}
      <TopicButtons topics={lead.news} card="themen" onOpen={onOpen} /> die Nachrichten.
      {lead.greens === 'quiet' ? (
        ' Über die Grünen gab es heute kaum Berichte.'
      ) : Array.isArray(lead.greens) ? (
        <>
          {' '}
          Über die Grünen wird vor allem zu{' '}
          <TopicButtons topics={lead.greens} card="gruene" onOpen={onOpen} /> berichtet.
        </>
      ) : (
        <>
          {' '}
          Über die Grünen gibt es heute{' '}
          <LeadButton onClick={() => onOpen('gruene')}>
            {lead.greens.count.toLocaleString('de-DE')} Berichte
          </LeadButton>
          .
        </>
      )}
    </p>
  );
}
