import { AudioLines, FileText, Mic } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import TranskriptionPage from '../transkription/TranskriptionPage';
import VoicePage from '../voice/VoicePage';

import { parseVertonenMode, type VertonenMode } from './modes';

import { cn } from '@/utils/cn';

const CHOICES: {
  mode: VertonenMode;
  title: string;
  description: string;
  from: typeof FileText;
  to: typeof AudioLines;
}[] = [
  {
    mode: 'text-zu-audio',
    title: 'Text vertonen',
    description: 'Text → Audio',
    from: FileText,
    to: AudioLines,
  },
  {
    mode: 'audio-zu-text',
    title: 'Audio transkribieren',
    description: 'Audio → Text',
    from: Mic,
    to: FileText,
  },
];

function VertonenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = parseVertonenMode(searchParams.get('modus'));
  // A mode mounts on first visit and then stays: switching must not drop a running
  // transcription or a half-written script.
  const [visited, setVisited] = useState<ReadonlySet<VertonenMode>>(() => new Set([mode]));

  const select = (next: VertonenMode) => {
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('modus', next);
        return params;
      },
      { replace: true }
    );
  };

  const shown = new Set(visited).add(mode);

  return (
    <PageContainer maxWidth="md" noPadTop>
      <header className="mb-lg text-center">
        <h1 className="m-0 mb-xs text-4xl font-semibold text-foreground-heading max-md:text-2xl">
          Vertonen &amp; transkribieren
        </h1>
        <p className="m-0 text-lg text-foreground max-md:text-base">
          Aus Text wird Sprache, aus Aufnahmen wird Text – an einem Ort.
        </p>
      </header>

      <div role="group" aria-label="Richtung wählen" className="mb-xl grid grid-cols-2 gap-sm">
        {CHOICES.map(({ mode: value, title, description, from: From, to: To }) => {
          const active = value === mode;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => select(value)}
              className={cn(
                'flex min-h-[88px] cursor-pointer flex-col items-start gap-xs rounded-2xl border-2 p-md text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                active
                  ? 'border-primary-600 bg-primary-600/10 dark:border-primary-400 dark:bg-primary-400/10'
                  : 'border-grey-200 bg-background-pure hover:border-grey-300 dark:border-grey-700 dark:hover:border-grey-600'
              )}
            >
              <span
                aria-hidden="true"
                className="flex items-center gap-xs text-primary-600 dark:text-primary-400"
              >
                <From className="size-5" />
                <span>→</span>
                <To className="size-5" />
              </span>
              <span className="text-base font-semibold text-foreground-heading max-sm:text-sm">
                {title}
              </span>
              <span className="text-sm text-muted-foreground max-sm:hidden">{description}</span>
            </button>
          );
        })}
      </div>

      {shown.has('text-zu-audio') && (
        <section
          hidden={mode !== 'text-zu-audio'}
          aria-label="Text vertonen"
          className="mx-auto max-w-[800px]"
        >
          <VoicePage embedded />
        </section>
      )}
      {shown.has('audio-zu-text') && (
        <section hidden={mode !== 'audio-zu-text'} aria-label="Audio transkribieren">
          <TranskriptionPage embedded />
        </section>
      )}
    </PageContainer>
  );
}

export default withAuthRequired(VertonenPage, { title: 'Vertonen & transkribieren' });
