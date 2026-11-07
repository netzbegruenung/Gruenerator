import { type TopicCategory } from '@gruenerator/contracts';
import { type BriefingLead } from '@gruenerator/shared/monitor';
import { Fragment } from 'react';
import { StyleSheet, Text } from 'react-native';

import { TOPIC_LABELS } from '../../config/topicConfig';
import { useTheme } from '../../hooks/useTheme';
import { HEADING_FONT_SEMIBOLD, useDashboardColors } from '../../theme';

import { type BriefingCardId } from './BriefingCard';
import { LeadSkeleton } from './BriefingSkeleton';

/** Ein Knopf im Leitsatz: unterstrichen in der Akzentfarbe, klappt eine Karte auf. */
function LeadButton({ onPress, children }: { onPress: () => void; children: string }) {
  const c = useDashboardColors();
  return (
    <Text
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.button, { color: c.mg, textDecorationColor: c.mg }]}
    >
      {children}
    </Text>
  );
}

/** Themen im Satz als Knöpfe, die ihre Karte aufklappen; zwei Themen mit „und“. */
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
      {i > 0 ? ' und ' : null}
      <LeadButton onPress={() => onOpen(card)}>{TOPIC_LABELS[t]}</LeadButton>
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
  const theme = useTheme();
  if (pending) return <LeadSkeleton />;
  if (!lead) return null;

  return (
    <Text style={[styles.line, { color: theme.text }]}>
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
          <LeadButton onPress={() => onOpen('gruene')}>
            {`${lead.greens.count.toLocaleString('de-DE')} Berichte`}
          </LeadButton>
          .
        </>
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: { fontFamily: HEADING_FONT_SEMIBOLD, fontSize: 22, lineHeight: 30 },
  button: { textDecorationLine: 'underline' },
});
