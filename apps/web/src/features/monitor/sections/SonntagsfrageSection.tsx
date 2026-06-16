import { SectionHeader } from '@gruenerator/ui';
import { ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { SonntagsfrageChart } from '../components/UmfragenView';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

/** Compact national Sonntagsfrage carousel, linking into /experiments/monitor/umfragen. */
export function SonntagsfrageSection() {
  const navigate = useNavigate();
  const { locale, withLocale } = useMonitorLocaleParam();

  const parliament = locale === 'at' ? 'oesterreich' : 'deutschland';
  const subtitle =
    locale === 'at'
      ? 'Wenn am nächsten Sonntag Nationalratswahl wäre… Wöchentlich aggregierter Durchschnitt.'
      : 'Wenn am nächsten Sonntag Bundestagswahl wäre… Wöchentlich aggregierter Durchschnitt.';

  return (
    <section className="mb-2xl">
      <SectionHeader
        title="Umfragen"
        onTitleClick={() => navigate(withLocale('/experiments/monitor/umfragen'))}
        actions={
          <Link
            to={withLocale('/experiments/monitor/umfragen')}
            className="inline-flex items-center gap-0.5 text-xs text-grey-400 hover:text-foreground transition-colors no-underline"
          >
            Alle Umfragen
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <SonntagsfrageChart
        key={parliament}
        parliament={parliament}
        subtitle={subtitle}
        showDetails={false}
      />
    </section>
  );
}
