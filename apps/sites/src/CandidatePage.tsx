import type { CandidateData } from '@/types/candidate';

import {
  HeroSection,
  AboutSection,
  HeroImageSection,
  ThemesSection,
  ActionsSection,
  SocialFeedSection,
  ContactSection,
} from '@/components';

interface CandidatePageProps {
  candidate: CandidateData;
}

export function CandidatePage({ candidate }: CandidatePageProps) {
  return (
    <div className="candidate-page">
      <HeroSection data={candidate.hero} />
      <AboutSection data={candidate.about} />
      <HeroImageSection data={candidate.heroImage} />
      <ThemesSection data={candidate.themes} />
      <ActionsSection data={candidate.actions} />
      {candidate.socialFeed && <SocialFeedSection data={candidate.socialFeed} />}
      <ContactSection data={candidate.contact} />

      <footer className="site-footer">
        <div className="footer-content">
          <p>
            &copy; {new Date().getFullYear()} {candidate.hero.name} | Bündnis 90/Die Grünen
          </p>
          <p className="footer-powered">
            Erstellt mit{' '}
            <a href="https://gruenerator.de" target="_blank" rel="noopener noreferrer">
              Grünerator
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
