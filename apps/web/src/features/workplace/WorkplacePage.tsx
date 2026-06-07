import { SectionHeader } from '@gruenerator/ui';
import { Suspense, lazy, memo } from 'react';

import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useFirstName } from '../../hooks/useFirstName';
import { useAuthStore } from '../../stores/authStore';

import CreatorSection from './components/CreatorSection';
import ToolsSection, { FavoritesSection } from './components/ToolsSection';

// Below-the-fold — deferred so the greeting + chat composer paint first. These
// pull heavy deps (NotebookEditor/Dialog, image-studio Lightbox + ShareMediaModal).
const RecentlyCreatedSection = lazy(() => import('./components/RecentlyCreatedSection'));
const NotebooksSection = lazy(() => import('./components/NotebooksSection'));

function pickStable<T>(options: readonly T[], seed: number): T {
  return options[seed % options.length] as T;
}

const GENERAL_DE = [
  'Was stricken wir heute, @Vorname?',
  'Womit machen wir die Welt heute besser, @Vorname?',
  'Denkst du auch manchmal an Robert zurück, @Vorname?',
  'Bereit für den Wandel, @Vorname?',
  'Was steht heute auf der Agenda, @Vorname?',
] as const;

// Pride month (June, month index 5): show a special rainbow-coloured greeting.
// Evaluated per render so it switches on/off at the month boundary with no
// manual revert needed — same pattern as GrueneratorHomeIcon.
const isPrideMonth = () => new Date().getMonth() === 5;

const PRIDE_GREETING = 'Happy Pride, @Vorname!';

function pickTemplate(locale: string | null | undefined, hour: number): string {
  const daySeed = Math.floor(Date.now() / 86_400_000);

  if (isPrideMonth()) {
    return PRIDE_GREETING;
  }

  if (locale === 'de-AT') {
    if (hour < 6)
      return pickStable(
        ['Gute Nacht', 'Schlaf guat', 'Das Ehrenamt schläft nie, was @Vorname?'] as const,
        daySeed
      );
    if (hour < 11) return pickStable(['Guten Morgen', 'Servus', 'Grüß dich'] as const, daySeed);
    if (hour < 14)
      return pickStable(['Grüß Gott', 'Servus', 'Habidere', 'Mahlzeit'] as const, daySeed);
    if (hour < 18)
      return pickStable(['Grüß dich', 'Servus', 'Schönen Nachmittag'] as const, daySeed);
    return pickStable(['Guten Abend', 'Schönen Abend', 'Servus'] as const, daySeed);
  }

  if (hour < 6)
    return pickStable(['Gute Nacht', 'Das Ehrenamt schläft nie, was @Vorname?'] as const, daySeed);
  if (hour < 12)
    return pickStable(
      ['Guten Morgen', 'Moin', 'Der frühe Vogel rettet den Artenschutz, @Vorname', ...GENERAL_DE],
      daySeed
    );
  if (hour < 14) return pickStable(['Guten Tag', 'Mahlzeit', ...GENERAL_DE], daySeed);
  if (hour < 18) return pickStable(['Guten Tag', ...GENERAL_DE], daySeed);
  return pickStable(['Guten Abend', ...GENERAL_DE], daySeed);
}

function getGreeting(locale: string | null | undefined, firstName: string | null): string {
  const template = pickTemplate(locale, new Date().getHours());

  if (template.includes('@Vorname')) {
    return template.replace('@Vorname', firstName ?? 'du');
  }
  return firstName ? `${template}, ${firstName}` : template;
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
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  const pride = isPrideMonth();

  return (
    <ErrorBoundary>
      {/* <Sun /> */}
      <PageContainer maxWidth="lg">
        <div className="text-center mb-lg pt-md">
          <h1
            className={`text-4xl max-md:text-2xl font-semibold mb-xs ${
              pride
                ? 'inline-block w-fit bg-clip-text text-transparent'
                : 'text-foreground-heading'
            }`}
            style={
              pride
                ? {
                    backgroundImage:
                      'linear-gradient(90deg,#E40303,#FF8C00,#FFED00,#008026,#004DFF,#750787)',
                  }
                : undefined
            }
          >
            {getGreeting(locale, firstName)}
          </h1>
        </div>

        <div className="max-w-3xl mx-auto mb-xl">
          <CreatorSection />
        </div>

        <Suspense fallback={null}>
          <RecentlyCreatedSection />
        </Suspense>

        <Suspense fallback={null}>
          <NotebooksSection />
        </Suspense>

        <section className="mb-xl">
          <SectionHeader title="Weitere Tools" />
          <ToolsSection />
        </section>

        {!isAustrian && (
          <section className="mb-xl">
            <SectionHeader title="Grünerators Favoriten" />
            <FavoritesSection />
          </section>
        )}

        {/* <GrassWithSheep /> */}
      </PageContainer>
    </ErrorBoundary>
  );
};

export default WorkplacePage;
