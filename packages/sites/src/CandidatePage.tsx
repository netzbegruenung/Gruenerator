import {
  HeroSection,
  AboutSection,
  HeroImageSection,
  ThemesSection,
  ActionsSection,
  SocialFeedSection,
  ContactSection,
} from './components';

import type { CandidateData } from '@gruenerator/sites-design';

interface CandidatePageProps {
  candidate: CandidateData;
}

export function CandidatePage({ candidate }: CandidatePageProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <HeroSection data={candidate.hero} />
      <AboutSection data={candidate.about} />
      <HeroImageSection data={candidate.heroImage} />
      <ThemesSection data={candidate.themes} />
      <ActionsSection data={candidate.actions} />
      {candidate.socialFeed && <SocialFeedSection data={candidate.socialFeed} />}
      <ContactSection data={candidate.contact} />

      <footer className="mt-auto bg-grey-950 py-[var(--spacing-responsive-large)] px-[var(--spacing-responsive-medium)] md:py-[var(--spacing-responsive-xlarge)] md:px-[var(--spacing-responsive-large)]">
        <div className="max-w-7xl mx-auto text-center text-grey-400 text-[length:var(--font-size-sm)]">
          <p>
            &copy; {new Date().getFullYear()} {candidate.hero.name} | Bündnis 90/Die Grünen
          </p>
          <p className="mt-sm text-[length:var(--font-size-xs)]">
            Erstellt mit{' '}
            <a
              href="https://gruenerator.de"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-400 transition-opacity hover:opacity-80"
            >
              Grünerator
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
