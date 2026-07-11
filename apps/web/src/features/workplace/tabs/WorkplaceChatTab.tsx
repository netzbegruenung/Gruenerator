import { Suspense, lazy } from 'react';

import PageContainer from '../../../components/common/PageContainer';
import { useFirstName } from '../../../hooks/useFirstName';
import { useAuthStore } from '../../../stores/authStore';
import CreatorSection from '../components/CreatorSection';
import ToolsSection, { FavoritesSection } from '../components/ToolsSection';

// Below-the-fold — deferred so the greeting + chat composer paint first
// (pulls heavy deps: image-studio Lightbox + ShareMediaModal).
const RecentlyCreatedSection = lazy(() => import('../components/RecentlyCreatedSection'));

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

const WorkplaceChatTab = () => {
  const firstName = useFirstName();
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  const pride = isPrideMonth();

  return (
    <PageContainer maxWidth="lg">
      <div className="text-center mb-lg pt-md">
        <h1
          className={`text-4xl max-md:text-2xl font-extrabold tracking-tight text-balance mb-xs ${
            pride ? 'inline-block w-fit bg-clip-text text-transparent' : 'text-foreground-heading'
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

      <section className="mb-xl">
        <ToolsSection />
      </section>

      {!isAustrian && (
        <section className="mb-xl">
          <FavoritesSection />
        </section>
      )}
    </PageContainer>
  );
};

export default WorkplaceChatTab;
