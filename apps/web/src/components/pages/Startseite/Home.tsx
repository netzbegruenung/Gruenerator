import { lazy, Suspense, type ReactNode, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TypeAnimation } from 'react-type-animation';

import ReelMuster from '../../../assets/images/startseite/Reel_Muster.png';
import SharepicMuster from '../../../assets/images/startseite/Sharepic_Muster.png';
import { type IconCategory, getIcon } from '../../../config/icons';
import { useSidebarStore } from '../../../stores/sidebarStore';
import Icon from '../../common/Icon';

const MockGenerator = lazy(() => import('./MockGenerator'));
const ImageComparisonMock = lazy(() => import('./ImageComparisonMock'));

const NEWSLETTER_URL =
  'https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW';

const headingClass = [
  'text-[2em] min-[480px]:text-[2.5em] lg:text-[var(--font-size-5xl)]',
  'xl:text-[4rem] 3xl:text-[4.2rem] 4xl:text-[4.5rem] 5xl:text-[5rem]',
  'font-bold text-foreground-heading dark:text-white font-[Raleway,Arial,sans-serif] m-0',
].join(' ');

const btnBaseClass = [
  'flex items-center gap-3 no-underline',
  'font-medium rounded-[10px] transition-colors cursor-pointer',
  'w-full justify-start py-3.5 px-5',
  'md:flex-1 md:min-w-[150px] md:justify-center md:p-md',
  'xl:text-[1.05em] xl:p-[calc(var(--spacing-responsive-medium)*1.1)]',
  '4xl:text-[1.1em] 4xl:min-w-[180px] 4xl:p-[calc(var(--spacing-responsive-medium)*1.25)]',
  '5xl:text-[1.15em] 5xl:min-w-[200px]',
  '[&_svg]:text-[1.3em]',
].join(' ');

const linkBtnClass = `${btnBaseClass} bg-background-alt text-foreground dark:text-white hover:bg-hover-alt`;

const newsletterBtnClass = [
  btnBaseClass,
  'bg-secondary-500 text-white hover:bg-secondary-700 hover:opacity-90',
  'group [&_svg]:ml-auto [&_svg]:transition-transform',
  'group-hover:[&_svg]:translate-x-0.5',
].join(' ');

const featureCardClass = [
  'flex flex-col min-[834px]:flex-row items-start min-[834px]:items-center',
  'min-[834px]:justify-between w-full',
  'gap-4 min-[480px]:gap-6 min-[834px]:gap-[30px] lg:gap-10 xl:gap-[60px] 4xl:gap-[70px]',
].join(' ');

const featureContentClass =
  'flex flex-col items-start gap-4 w-full min-[834px]:w-1/2 min-[834px]:flex-[1_1_50%]';

const featureVisualClass = [
  'w-full min-[834px]:w-1/2 min-[834px]:flex-[1_1_50%] relative',
  'min-h-[180px] min-[480px]:min-h-[250px] min-[834px]:min-h-[280px] lg:min-h-[400px]',
].join(' ');

const featureIconClass =
  'flex items-center justify-center w-14 h-14 bg-gradient-to-br from-secondary-600 to-secondary-900 rounded-2xl text-white shadow-md [&_svg]:text-[28px]';

const featureH3Class =
  'text-[1.4rem] min-[480px]:text-[1.6rem] min-[834px]:text-[1.7rem] lg:text-[1.8rem] xl:text-[2rem] font-bold text-foreground-heading mb-4 leading-[1.2]';

const featurePClass =
  'text-[0.95rem] min-[480px]:text-base lg:text-[1.05rem] xl:text-[1.125rem] leading-[1.7] text-foreground opacity-85 m-0';

const featureImageClass =
  'max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.12)]';

const useCaseCardClass =
  'text-center p-xl bg-background rounded-[var(--spacing-responsive-medium)] shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.2)]';

const useCaseIconClass =
  'flex items-center justify-center w-[60px] h-[60px] bg-secondary-500 rounded-2xl text-white mx-auto mb-md [&_svg]:text-[28px]';

const containerMaxWidth = 'max-w-[1200px] 3xl:max-w-[1500px] 4xl:max-w-[1600px] 5xl:max-w-[1900px]';

const suspenseFallback = (
  <div className="min-h-[350px] flex items-center justify-center">
    <div className="w-[90%] h-[250px] animate-pulse bg-background-alt rounded-lg" />
  </div>
);

const FeatureImage = ({ src, alt }: { src: string; alt: string }) => (
  <div className="w-full h-full flex items-center justify-center p-md">
    <img src={src} alt={alt} className={featureImageClass} />
  </div>
);

interface FeatureData {
  icon: { category: IconCategory; name: string };
  title: string;
  description: string;
  visual: ReactNode;
}

const FEATURES: FeatureData[] = [
  {
    icon: { category: 'ui', name: 'file' },
    title: 'Erstelle Grüne Texte',
    description:
      'Nutze unseren KI-gestützten Generator für Pressemitteilungen, Social Media Posts und mehr. Einfach Thema eingeben und professionelle Texte erhalten.',
    visual: (
      <Suspense fallback={suspenseFallback}>
        <MockGenerator />
      </Suspense>
    ),
  },
  {
    icon: { category: 'navigation', name: 'sharepic' },
    title: 'Kreiere Sharepics in Sekunden',
    description:
      'Mit KI-Unterstützung erstellst du professionelle Sharepics für Social Media in wenigen Sekunden. Einfach Thema eingeben und fertig gestaltet erhalten.',
    visual: (
      <FeatureImage src={SharepicMuster} alt="Sharepic Muster - Grünerator generated content" />
    ),
  },
  {
    icon: { category: 'navigation', name: 'imagine' },
    title: 'Verwandle Bilder mit KI-Power',
    description:
      'Optimiere deine Bilder mit Grünerator Imagine. Verbessere Qualität, entferne Hintergründe oder erstelle neue Varianten - alles KI-gestützt in Sekunden.',
    visual: (
      <Suspense fallback={suspenseFallback}>
        <ImageComparisonMock />
      </Suspense>
    ),
  },
  {
    icon: { category: 'ui', name: 'video' },
    title: 'Generiere Untertitel für Reels & TikToks',
    description:
      'Generiere automatisch ansprechende Untertitel für deine Videos. Perfekt für Social Media - macht deine Inhalte zugänglicher und erhöht die Reichweite.',
    visual: <FeatureImage src={ReelMuster} alt="Reel Muster - Grünerator generated content" />,
  },
];

interface UseCaseData {
  icon: { category: IconCategory; name: string };
  title: string;
  description: string;
  link?: string;
  label?: string;
}

const USE_CASES: UseCaseData[] = [
  {
    icon: { category: 'navigation', name: 'barrierefreiheit' },
    title: 'Barrierefreiheit',
    description: 'Barrierefreie Texte schneller erstellen – verständlich und inklusiv.',
    link: '/texte?tab=barrierefreiheit',
    label: 'Zum Barrierefreiheit Grünerator',
  },
  {
    icon: { category: 'navigation', name: 'suche' },
    title: 'Websuche',
    description: 'Finde Vorlagen, Inhalte und Beispiele direkt im Web.',
    link: '/suche',
    label: 'Zur Websuche',
  },
  {
    icon: { category: 'actions', name: 'lock' },
    title: 'Sicherheit',
    description:
      'Deine Daten werden sicher in Europa verarbeitet und nicht für KI-Training verwendet.',
  },
];

const Home = () => {
  const requestHideSidebar = useSidebarStore((state) => state.requestHideSidebar);
  const releaseHideSidebar = useSidebarStore((state) => state.releaseHideSidebar);

  useEffect(() => {
    requestHideSidebar('home');
    return () => releaseHideSidebar('home');
  }, [requestHideSidebar, releaseHideSidebar]);

  const TexteIcon = getIcon('navigation', 'texte')!;
  const ReelIcon = getIcon('navigation', 'reel')!;
  const RechercheIcon = getIcon('navigation', 'suche')!;
  const SharepicIcon = getIcon('navigation', 'sharepic')!;

  return (
    <main role="main" id="main-content">
      {/* Hero Section */}
      <section
        className={`flex flex-col items-center min-h-[50vh] 4xl:min-h-[55vh] 5xl:min-h-[60vh] px-5 lg:px-[var(--spacing-responsive-xxlarge)] 4xl:px-[60px] 5xl:px-20 pt-8 pb-8 md:pb-10 ${containerMaxWidth} mx-auto bg-background`}
      >
        <header className="flex flex-col items-start mb-xl w-full">
          <h1 className="sr-only">Grünerator - AI-gestützte Textgenerierung für die Grünen</h1>
          <TypeAnimation
            sequence={[
              'Pressemitteilung?',
              5000,
              'Social-Media-Post?',
              5000,
              'Antrag oder Anfrage?',
              5000,
              'Wahlprogramm-Kapitel?',
              5000,
              'Redebeitrag?',
              5000,
              'Sharepic?',
              5000,
            ]}
            wrapper="span"
            speed={50}
            repeat={Infinity}
            className={headingClass}
            aria-label="Verschiedene Textarten, die der Grünerator erstellen kann"
          />
          <h2 className={`${headingClass} leading-tight`}>Dafür gibt&apos;s den Grünerator.</h2>
        </header>

        <p className="text-base min-[480px]:text-[1.1em] lg:text-lg xl:text-[1.25em] 3xl:text-[1.3em] 4xl:text-[1.35em] 5xl:text-[1.45em] leading-relaxed 4xl:leading-[1.65] text-foreground self-start text-left mb-8 md:mb-xl">
          Mit dem Grünerator kannst du schnell und kostenlos einen Vorschlag für Grüne Inhalte
          deiner Wahl erhalten. Deine Eingaben werden sicher in Europa verarbeitet.
        </p>

        <div className="w-full self-start flex flex-col gap-md items-center md:items-start">
          <div className="flex flex-col md:flex-row md:flex-nowrap gap-3 md:gap-md w-full max-w-[400px] md:max-w-none">
            <Link to="/texte" className={linkBtnClass} aria-label="Zum Texte Grünerator">
              <TexteIcon /> Texte
            </Link>
            <Link to="/imagine" className={linkBtnClass} aria-label="Zum Imagine Grünerator">
              <SharepicIcon /> Imagine
            </Link>
            <Link to="/reel" className={linkBtnClass} aria-label="Zum Reel Grünerator">
              <ReelIcon /> Reel
            </Link>
            <Link to="/recherche" className={linkBtnClass} aria-label="Zur Recherche">
              <RechercheIcon /> Recherche
            </Link>
            <a
              href={NEWSLETTER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`${newsletterBtnClass} hidden md:flex`}
              aria-label="Zum Newsletter anmelden"
            >
              Newsletter <Icon category="actions" name="arrowRight" />
            </a>
          </div>
          <a
            href={NEWSLETTER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${newsletterBtnClass} flex md:hidden mt-3`}
            aria-label="Zum Newsletter anmelden"
          >
            Newsletter <Icon category="actions" name="arrowRight" />
          </a>
        </div>
      </section>

      {/* Feature Partner Section */}
      <section
        className="py-20 bg-gradient-to-b from-background to-background-alt dark:[background:none] relative overflow-hidden"
        aria-labelledby="ai-partner-title"
      >
        <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-[radial-gradient(circle,rgba(70,215,0,0.03)_0%,transparent_70%)] pointer-events-none" />

        <div className="max-w-[1280px] 3xl:max-w-[1500px] 4xl:max-w-[1600px] 5xl:max-w-[1900px] mx-auto px-5 md:px-10 4xl:px-[60px]">
          <h2
            id="ai-partner-title"
            className="text-[2em] md:text-5xl 4xl:text-[3.2rem] 5xl:text-[3.5rem] font-bold text-center mb-10 md:mb-20 4xl:mb-[90px] 5xl:mb-[100px] bg-gradient-to-br from-[var(--primary)] to-[var(--klee)] bg-clip-text text-transparent dark:[background:none] dark:[-webkit-text-fill-color:var(--white)] dark:text-white"
          >
            KI Speziell für Grüne
          </h2>

          <div className="flex flex-col gap-9 min-[480px]:gap-[50px] min-[834px]:gap-[70px] lg:gap-[90px] 4xl:gap-[140px] 5xl:gap-[160px]">
            {FEATURES.map((feature) => (
              <div key={feature.title} className={featureCardClass}>
                <div className={featureContentClass}>
                  <div className={featureIconClass}>
                    <Icon category={feature.icon.category} name={feature.icon.name} />
                  </div>
                  <div>
                    <h3 className={featureH3Class}>{feature.title}</h3>
                    <p className={featurePClass}>{feature.description}</p>
                  </div>
                </div>
                <div className={featureVisualClass}>{feature.visual}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-2xl bg-background" aria-labelledby="use-cases-title">
        <div className={`${containerMaxWidth} mx-auto px-5 md:px-2xl`}>
          <h2
            id="use-cases-title"
            className="text-[2em] lg:text-[2.5em] font-semibold text-center text-foreground-heading mb-xl"
          >
            Und es gibt noch mehr
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-lg">
            {USE_CASES.map((useCase) => (
              <div key={useCase.title} className={useCaseCardClass}>
                <div className={useCaseIconClass}>
                  <Icon category={useCase.icon.category} name={useCase.icon.name} />
                </div>
                <h3 className="text-[1.4em] font-semibold text-foreground-heading mb-md">
                  {useCase.link ? (
                    <Link to={useCase.link} aria-label={useCase.label}>
                      {useCase.title}
                    </Link>
                  ) : (
                    useCase.title
                  )}
                </h3>
                <p className="text-base leading-[1.6] text-foreground m-0">{useCase.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};

export default Home;
