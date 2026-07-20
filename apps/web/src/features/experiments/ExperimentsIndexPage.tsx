import { SectionHeader } from '@gruenerator/ui';
import { useNavigate } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { getIcon } from '../../config/icons';
import NotebookGalleryCard from '../notebook/components/NotebookGalleryCard';

import type { IconType } from 'react-icons';

interface Experiment {
  id: string;
  title: string;
  /** Short one-line description shown under the title in the gallery card. */
  meta: string;
  icon: IconType;
  path: string;
}

// Experimental features, surfaced under /experiments so the URL itself signals
// their status. Add new experiments to this list — the gallery renders them in
// order. Monitor is the first (formerly the dev-only /monitor*).
const EXPERIMENTS: Experiment[] = [
  {
    id: 'monitor',
    title: 'Monitor',
    meta: 'Meistdiskutierte Themen, Umfragen & Berichterstattung',
    // Registry icons are react-icons components at runtime; the registry's
    // IconType is the wider ComponentType, so cast to the card's react-icons type.
    icon: getIcon('navigation', 'monitor') as IconType,
    path: '/experiments/monitor/themen',
  },
  {
    id: 'reisekosten',
    title: 'Fahrtkosten-Grünerator',
    meta: 'Reisekostenformular mit KI-Belegprüfung',
    icon: getIcon('navigation', 'reisekosten') as IconType,
    path: '/experiments/reisekosten',
  },
];

// Mirrors the /notebooks gallery grid so experiments read as the same system.
const EXPERIMENTS_GRID_CLASS =
  'grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-md max-sm:grid-cols-2';

const LAB_ICON = getIcon('actions', 'labor') as IconType;

function ExperimentsIndexPage() {
  const navigate = useNavigate();

  return (
    <ErrorBoundary>
      <PageContainer
        title="Experimente"
        subtitle="Neue, experimentelle Funktionen – noch in Entwicklung und jederzeit änderbar."
        maxWidth="lg"
      >
        <section className="mt-lg">
          <SectionHeader title="Aktuelle Experimente" />
          <div className={EXPERIMENTS_GRID_CLASS}>
            {EXPERIMENTS.map((experiment) => (
              <NotebookGalleryCard
                key={experiment.id}
                title={experiment.title}
                meta={experiment.meta}
                icon={experiment.icon}
                metaIcon={LAB_ICON}
                onActivate={() => navigate(experiment.path)}
              />
            ))}
          </div>
        </section>
      </PageContainer>
    </ErrorBoundary>
  );
}

export default withAuthRequired(ExperimentsIndexPage, { title: 'Experimente' });
