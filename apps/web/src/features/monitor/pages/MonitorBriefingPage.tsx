import { type MonitorLocale } from '@gruenerator/contracts';
import { type BriefingLand, parseBriefingLand } from '@gruenerator/shared/monitor';
import { useSearchParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { BRIEFING_CARDS, type BriefingCardId } from '../briefing/BriefingCard';
import { BriefingView } from '../briefing/BriefingView';
import { LandBriefingView } from '../briefing/LandBriefingView';
import { useBriefingNews } from '../briefing/useBriefingNews';
import { useLandBriefing, useMonitorSnapshot } from '../hooks/useMonitor';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

/** Welche Karte offen ist, steht in der URL (`?karte=keywords`) — /wissen verlinkt so direkt hinein. */
const CARD_PARAM = 'karte';
/** Das Land der Land-Ansicht (`?land=hessen`); ohne den Parameter bundesweit. */
const LAND_PARAM = 'land';

function parseCard(value: string | null): BriefingCardId | null {
  return BRIEFING_CARDS.find((c) => c === value) ?? null;
}

/** Die offene Karte als URL-Zustand; immer höchstens eine. */
function useOpenCard() {
  const [params, setParams] = useSearchParams();
  const open = parseCard(params.get(CARD_PARAM));
  const setOpen = (card: BriefingCardId | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (card) next.set(CARD_PARAM, card);
        else next.delete(CARD_PARAM);
        return next;
      },
      { replace: true }
    );
  return {
    open,
    onToggle: (card: BriefingCardId) => setOpen(open === card ? null : card),
    onOpen: setOpen,
  };
}

function NationalBriefing({
  locale,
  withLocale,
}: {
  locale: MonitorLocale;
  withLocale: (path: string) => string;
}) {
  const snapshot = useMonitorSnapshot(locale);
  const news = useBriefingNews(locale);
  const cards = useOpenCard();
  return (
    <BriefingView
      locale={locale}
      snapshot={snapshot.data ?? null}
      snapshotPending={snapshot.isPending}
      news={news}
      withLocale={withLocale}
      {...cards}
    />
  );
}

function LandBriefing({
  land,
  withLocale,
}: {
  land: BriefingLand;
  withLocale: (path: string) => string;
}) {
  const briefing = useLandBriefing(land.id);
  const cards = useOpenCard();
  return (
    <LandBriefingView
      land={land}
      briefing={briefing.data ?? null}
      pending={briefing.isPending}
      withLocale={withLocale}
      {...cards}
    />
  );
}

/**
 * /briefing — Feed, Watcher und Themen & Trends auf einer Seite (die drei alten
 * Pfade leiten hierher), bundesweit oder für ein Land (`?land=`, vorerst nur
 * über die Adresse). Ein unbekanntes Land fällt auf bundesweit zurück.
 */
function MonitorBriefingPage() {
  const { locale, withLocale } = useMonitorLocaleParam();
  const [params] = useSearchParams();
  const land = parseBriefingLand(params.get(LAND_PARAM));

  return land ? (
    <LandBriefing key={land.id} land={land} withLocale={withLocale} />
  ) : (
    <NationalBriefing locale={locale} withLocale={withLocale} />
  );
}

/** Unwrapped for component tests — the default export gates on auth. */
export { MonitorBriefingPage as MonitorBriefingContent };

export default withAuthRequired(MonitorBriefingPage, { title: 'Briefing' });
