import { useMonitorLocaleParam } from '../../monitor/hooks/useMonitorLocaleParam';

import { HeadlineSlider } from './HeadlineSlider';
import { NotebookShelf } from './NotebookShelf';
import { PollCard } from './PollCard';
import { TrendsCard } from './TrendsCard';
import { useWissenNews } from './useWissenNews';
import { WissenMainGrid } from './WissenLayout';

/**
 * Alles auf /wissen unter dem Composer: Kopf-Slider „Briefing“ (Feed und
 * Watcher gemischt), Trends, Umfragen und „Deine Notebooks". Entwurf:
 * „Wissens-Dashboard Redesign" (Claude Design, 06.11.2026) — Desktop, Tablet und
 * Smartphone aus einer Struktur, die Größen schalten nur Breakpoints. Abweichung
 * (07.11.2026): die Watcher/Feed-Karte mit den Beiträgen ist entfallen; die
 * Slider-Überschrift verlinkt /briefing, wo beide Ströme stehen.
 */
export function WissenDashboard() {
  const { locale, withLocale } = useMonitorLocaleParam();
  const news = useWissenNews(locale);

  return (
    <>
      <WissenMainGrid
        slider={
          <HeadlineSlider
            items={news.headlines}
            loading={news.headlinesPending}
            to={withLocale('/briefing')}
          />
        }
        poll={<PollCard locale={locale} to={withLocale('/umfragen')} />}
        trends={<TrendsCard locale={locale} to={withLocale('/briefing?karte=keywords')} />}
      />
      <NotebookShelf />
    </>
  );
}
