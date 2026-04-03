import { SectionHeader } from '@gruenerator/ui';
import { memo, useState } from 'react';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useFirstName } from '../../hooks/useFirstName';
import { DEFAULT_MODE } from '../texte/modes';

import CreatorSection from './components/CreatorSection';
import NotebooksSection from './components/NotebooksSection';
import RecentlyCreatedSection from './components/RecentlyCreatedSection';
import ReelsSection from './components/ReelsSection';
import ToolsSection, { ExperimentalToolsSection } from './components/ToolsSection';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Gute Nacht';
  if (hour < 12) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

const GRASS_BLADES: Array<{ x: number; h: number; lean: number }> = [];
for (let i = 0; i < 120; i++) {
  GRASS_BLADES.push({
    x: i * 10 + Math.sin(i * 7) * 4,
    h: 18 + Math.sin(i * 3.7) * 12 + Math.cos(i * 2.3) * 6,
    lean: Math.sin(i * 5.1) * 6,
  });
}

const GrassWithSheep = memo(() => (
  <div
    className="pointer-events-none h-28 md:h-36 w-screen relative left-1/2 -translate-x-1/2 overflow-hidden"
    aria-hidden
  >
    <svg viewBox="0 0 1200 120" className="w-full h-full" preserveAspectRatio="xMidYMax slice">
      {/* ground line */}
      <line
        x1="0"
        y1="95"
        x2="1200"
        y2="95"
        className="stroke-grey-300/40 dark:stroke-grey-600/30"
        strokeWidth="1.5"
      />

      {/* kid-style grass blades — simple strokes from ground up */}
      {GRASS_BLADES.map(({ x, h, lean }, i) => (
        <line
          key={i}
          x1={x}
          y1={95}
          x2={x + lean}
          y2={95 - h}
          className="stroke-grey-400/30 dark:stroke-grey-500/20"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}

      {/* sheep — line-drawn style */}
      <g transform="translate(780, 28) scale(1.8)">
        {/* legs — simple sticks */}
        <line
          x1="10"
          y1="22"
          x2="10"
          y2="34"
          className="stroke-grey-500 dark:stroke-grey-400"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="16"
          y1="22"
          x2="16"
          y2="34"
          className="stroke-grey-500 dark:stroke-grey-400"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="27"
          y1="22"
          x2="27"
          y2="34"
          className="stroke-grey-500 dark:stroke-grey-400"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="33"
          y1="22"
          x2="33"
          y2="34"
          className="stroke-grey-500 dark:stroke-grey-400"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* fluffy body — scribble circles */}
        <circle
          cx="12"
          cy="14"
          r="7"
          fill="none"
          className="stroke-grey-400 dark:stroke-grey-500"
          strokeWidth="1.5"
        />
        <circle
          cx="21"
          cy="11"
          r="8"
          fill="none"
          className="stroke-grey-400 dark:stroke-grey-500"
          strokeWidth="1.5"
        />
        <circle
          cx="30"
          cy="14"
          r="7"
          fill="none"
          className="stroke-grey-400 dark:stroke-grey-500"
          strokeWidth="1.5"
        />
        {/* head */}
        <ellipse
          cx="39"
          cy="12"
          rx="5"
          ry="4.5"
          fill="none"
          className="stroke-grey-500 dark:stroke-grey-400"
          strokeWidth="1.5"
        />
        {/* eye — a dot */}
        <circle cx="41" cy="11" r="1" className="fill-grey-500 dark:fill-grey-400" />
        {/* ear */}
        <line
          x1="37"
          y1="8"
          x2="35"
          y2="4"
          className="stroke-grey-500 dark:stroke-grey-400"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  </div>
));
GrassWithSheep.displayName = 'GrassWithSheep';

const SUN_RAYS = [0, 40, 80, 120, 160, 200, 240, 280, 320];

const Sun = memo(() => (
  <div className="pointer-events-none fixed -top-10 -right-10 z-0" aria-hidden>
    <svg width="120" height="120" viewBox="0 0 120 120" className="md:w-[150px] md:h-[150px]">
      {SUN_RAYS.map((angle) => (
        <line
          key={angle}
          x1={60 + 24 * Math.cos((angle * Math.PI) / 180)}
          y1={60 + 24 * Math.sin((angle * Math.PI) / 180)}
          x2={60 + 52 * Math.cos((angle * Math.PI) / 180)}
          y2={60 + 52 * Math.sin((angle * Math.PI) / 180)}
          className="stroke-grey-300/40 dark:stroke-grey-600/20"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
      <circle
        cx="60"
        cy="60"
        r="20"
        fill="none"
        className="stroke-grey-300/50 dark:stroke-grey-600/25"
        strokeWidth="2"
      />
    </svg>
  </div>
));
Sun.displayName = 'Sun';

const WorkplacePage = () => {
  const firstName = useFirstName();

  const [mode, setMode] = useState(DEFAULT_MODE);

  return (
    <ErrorBoundary>
      {/* <Sun /> */}
      <PageContainer maxWidth="lg">
        <div className="text-center mb-lg pt-md">
          <h1 className="text-4xl max-md:text-2xl font-semibold text-foreground-heading mb-xs">
            {firstName ? `${getGreeting()}, ${firstName}` : getGreeting()}
          </h1>
          <p className="text-lg text-grey-500 dark:text-grey-400">
            Beschreibe dein Vorhaben und die KI erstellt es für dich.
          </p>
        </div>

        <div className="max-w-3xl mx-auto mb-xl">
          <CreatorSection mode={mode} onModeChange={setMode} />
        </div>

        <RecentlyCreatedSection />

        {/* <ReelsSection /> */}

        <NotebooksSection />

        <section className="mb-xl">
          <SectionHeader title="Weitere Tools" />
          <ToolsSection />
        </section>

        <section className="mb-xl">
          <SectionHeader title="Experimentelle Tools" />
          <ExperimentalToolsSection />
        </section>

        {/* <GrassWithSheep /> */}
      </PageContainer>
    </ErrorBoundary>
  );
};

export default withAuthRequired(WorkplacePage, {
  title: 'Desk',
});
