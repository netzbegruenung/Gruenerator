import { type ConventionSpeechPublic } from '@gruenerator/contracts';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { PageHero, PageShell } from '../../components/common/PageHero';

import { SpeechDetail } from './components/SpeechDetail';
import { SpeechGrid, SpeechSearch } from './components/SpeechGrid';
import { UnlockDialog } from './components/UnlockDialog';
import { useConvention, useUnlockConvention } from './hooks/useParteitage';
import { useParteitagFilters } from './stats/useParteitagFilters';

export default function ParteitagPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { data, isLoading, isError } = useConvention(slug);
  const unlock = useUnlockConvention(slug);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statFilters] = useParteitagFilters();
  const [selected, setSelected] = useState<ConventionSpeechPublic | null>(null);

  if (isLoading) {
    return (
      <PageShell wide>
        <PageHero title="Parteitag" />
        <p className="m-0 text-sm text-grey-500">Lädt …</p>
      </PageShell>
    );
  }

  if (isError || !data) {
    return (
      <PageShell wide>
        <PageHero title="Parteitag" />
        <p role="alert" className="m-0 text-sm text-grey-500">
          Dieser Parteitag ist nicht verfügbar.
        </p>
        <Link to="/parteitage">Zurück zu den Parteitagen</Link>
      </PageShell>
    );
  }

  if (data.locked) {
    return (
      <PageShell wide>
        <PageHero title="Parteitag" />
        <UnlockDialog
          title="Passwort nötig"
          busy={unlock.isPending}
          onUnlock={(password) => unlock.mutateAsync(password).catch(() => 'error' as const)}
          onCancel={() => navigate('/parteitage')}
        />
      </PageShell>
    );
  }

  const { convention } = data;
  return (
    <PageShell wide>
      <PageHero
        title={convention.title}
        description={
          <p className="m-0 text-sm text-grey-500 dark:text-grey-400">
            {convention.organizer} · {convention.location} · {convention.speechCount} Reden
          </p>
        }
      />
      <SpeechSearch value={search} onChange={setSearch} />
      <SpeechGrid
        speeches={convention.speeches}
        filters={{ search, stats: statFilters }}
        onSelect={setSelected}
      />
      <SpeechDetail speech={selected} onClose={() => setSelected(null)} />
    </PageShell>
  );
}
