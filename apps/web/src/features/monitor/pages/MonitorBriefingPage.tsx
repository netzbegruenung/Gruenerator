import { useSearchParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { BRIEFING_CARDS, type BriefingCardId } from '../briefing/BriefingCard';
import { BriefingView } from '../briefing/BriefingView';
import { useBriefingNews } from '../briefing/useBriefingNews';
import { useMonitorSnapshot } from '../hooks/useMonitor';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

/** Welche Karte offen ist, steht in der URL (`?karte=keywords`) — /wissen verlinkt so direkt hinein. */
const CARD_PARAM = 'karte';

function parseCard(value: string | null): BriefingCardId | null {
  return BRIEFING_CARDS.find((c) => c === value) ?? null;
}

/**
 * /briefing — Feed, Watcher und Themen & Trends auf einer Seite (die drei alten
 * Pfade leiten hierher). Immer höchstens eine Karte offen.
 */
function MonitorBriefingPage() {
  const { locale, withLocale } = useMonitorLocaleParam();
  const snapshot = useMonitorSnapshot(locale);
  const news = useBriefingNews(locale);
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

  return (
    <BriefingView
      locale={locale}
      snapshot={snapshot.data ?? null}
      snapshotPending={snapshot.isPending}
      news={news}
      open={open}
      onToggle={(card) => setOpen(open === card ? null : card)}
      onOpen={setOpen}
      withLocale={withLocale}
    />
  );
}

/** Unwrapped for component tests — the default export gates on auth. */
export { MonitorBriefingPage as MonitorBriefingContent };

export default withAuthRequired(MonitorBriefingPage, { title: 'Briefing' });
