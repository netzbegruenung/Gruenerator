import React, { lazy, Suspense, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TypeAnimation } from 'react-type-animation';

import ReelMuster from '../../../assets/images/startseite/Reel_Muster.png';
import SharepicMuster from '../../../assets/images/startseite/Sharepic_Muster.png';
import { getIcon } from '../../../config/icons';
import { useSidebarStore } from '../../../stores/sidebarStore';
import Icon from '../../common/Icon';

// Lazy load MockGenerator and ImageComparisonMock for better performance
const MockGenerator = lazy(() => import('./MockGenerator'));
const ImageComparisonMock = lazy(() => import('./ImageComparisonMock'));

const Home = () => {
  const requestHideSidebar = useSidebarStore((state) => state.requestHideSidebar);
  const releaseHideSidebar = useSidebarStore((state) => state.releaseHideSidebar);

  useEffect(() => {
    requestHideSidebar('home');
    return () => releaseHideSidebar('home');
  }, [requestHideSidebar, releaseHideSidebar]);

  // Icon-Komponenten für bessere JSX-Lesbarkeit
  const TexteIcon = getIcon('navigation', 'texte')!;
  const ReelIcon = getIcon('navigation', 'reel')!;
  const SucheIcon = getIcon('navigation', 'suche')!;
  const SharepicIcon = getIcon('navigation', 'sharepic')!;

  return (
    <main role="main" id="main-content">
      <section className="top-section">
        <header className="animated-heading">
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
            className="typing-text"
            aria-label="Verschiedene Textarten, die der Grünerator erstellen kann"
          />
          <h2>Dafür gibt&apos;s den Grünerator.</h2>
        </header>
        <p>
          Mit dem Grünerator kannst du schnell und kostenlos einen Vorschlag für Grüne Inhalte
          deiner Wahl erhalten. Deine Eingaben werden sicher in Europa verarbeitet.
        </p>
        <div className="link-buttons-container">
          <div className="link-buttons primary-buttons">
            <Link to="/texte" aria-label="Zum Texte Grünerator">
              <TexteIcon /> Texte
            </Link>
            <Link to="/imagine" aria-label="Zum Imagine Grünerator">
              <SharepicIcon /> Imagine
            </Link>
            <Link to="/reel" aria-label="Zum Reel Grünerator">
              <ReelIcon /> Reel
            </Link>
            <Link to="/suche" aria-label="Zur Suche">
              <SucheIcon /> Suche
            </Link>
            <a
              href="https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW"
              target="_blank"
              rel="noopener noreferrer"
              className="newsletter-button desktop-only"
              aria-label="Zum Newsletter anmelden"
            >
              Newsletter <Icon category="actions" name="arrowRight" />
            </a>
          </div>
          <a
            href="https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW"
            target="_blank"
            rel="noopener noreferrer"
            className="newsletter-button mobile-only"
            aria-label="Zum Newsletter anmelden"
          >
            Newsletter <Icon category="actions" name="arrowRight" />
          </a>
        </div>
      </section>
      <section className="feature-partner-section" aria-labelledby="ai-partner-title">
        <div className="feature-partner-container">
          <h2 id="ai-partner-title" className="feature-partner-title">
            KI Speziell für Grüne
          </h2>
          <div className="feature-cards">
            <div className="feature-card">
              <div className="feature-content">
                <div className="feature-icon">
                  <Icon category="ui" name="file" />
                </div>
                <div className="feature-text">
                  <h3>Erstelle Grüne Texte</h3>
                  <p>
                    Nutze unseren KI-gestützten Generator für Pressemitteilungen, Social Media Posts
                    und mehr. Einfach Thema eingeben und professionelle Texte erhalten.
                  </p>
                </div>
              </div>
              <div className="feature-visual">
                <Suspense
                  fallback={
                    <div className="mock-loading-placeholder">
                      <div className="mock-skeleton" />
                    </div>
                  }
                >
                  <MockGenerator />
                </Suspense>
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-content">
                <div className="feature-icon">
                  <Icon category="navigation" name="sharepic" />
                </div>
                <div className="feature-text">
                  <h3>Kreiere Sharepics in Sekunden</h3>
                  <p>
                    Mit KI-Unterstützung erstellst du professionelle Sharepics für Social Media in
                    wenigen Sekunden. Einfach Thema eingeben und fertig gestaltet erhalten.
                  </p>
                </div>
              </div>
              <div className="feature-visual">
                <div className="startseite-image-container">
                  <img
                    src={SharepicMuster}
                    alt="Sharepic Muster - Grünerator generated content"
                    className="startseite-feature-image"
                  />
                </div>
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-content">
                <div className="feature-icon">
                  <Icon category="navigation" name="imagine" />
                </div>
                <div className="feature-text">
                  <h3>Verwandle Bilder mit KI-Power</h3>
                  <p>
                    Optimiere deine Bilder mit Grünerator Imagine. Verbessere Qualität, entferne
                    Hintergründe oder erstelle neue Varianten - alles KI-gestützt in Sekunden.
                  </p>
                </div>
              </div>
              <div className="feature-visual">
                <Suspense
                  fallback={
                    <div className="mock-loading-placeholder">
                      <div className="mock-skeleton" />
                    </div>
                  }
                >
                  <ImageComparisonMock />
                </Suspense>
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-content">
                <div className="feature-icon">
                  <Icon category="ui" name="video" />
                </div>
                <div className="feature-text">
                  <h3>Generiere Untertitel für Reels & TikToks</h3>
                  <p>
                    Generiere automatisch ansprechende Untertitel für deine Videos. Perfekt für
                    Social Media - macht deine Inhalte zugänglicher und erhöht die Reichweite.
                  </p>
                </div>
              </div>
              <div className="feature-visual">
                <div className="startseite-image-container">
                  <img
                    src={ReelMuster}
                    alt="Reel Muster - Grünerator generated content"
                    className="startseite-feature-image"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="use-cases-section" aria-labelledby="use-cases-title">
        <div className="use-cases-container">
          <h2 id="use-cases-title" className="use-cases-title">
            Und es gibt noch mehr
          </h2>
          <div className="use-cases-grid">
            <div className="use-case-card">
              <div className="use-case-icon">
                <Icon category="navigation" name="barrierefreiheit" />
              </div>
              <h3>
                <Link to="/texte?tab=barrierefreiheit" aria-label="Zum Barrierefreiheit Grünerator">
                  Barrierefreiheit
                </Link>
              </h3>
              <p>Barrierefreie Texte schneller erstellen – verständlich und inklusiv.</p>
            </div>

            <div className="use-case-card">
              <div className="use-case-icon">
                <Icon category="navigation" name="suche" />
              </div>
              <h3>
                <Link to="/suche" aria-label="Zur Websuche">
                  Websuche
                </Link>
              </h3>
              <p>Finde Vorlagen, Inhalte und Beispiele direkt im Web.</p>
            </div>

            <div className="use-case-card">
              <div className="use-case-icon">
                <Icon category="navigation" name="gruene-jugend" />
              </div>
              <h3>
                <Link to="/gruene-jugend" aria-label="Zum Grüne Jugend Grünerator">
                  Grüne Jugend
                </Link>
              </h3>
              <p>Tools und Vorlagen speziell für die Grüne Jugend.</p>
            </div>

            <div className="use-case-card">
              <div className="use-case-icon">
                <Icon category="actions" name="lock" />
              </div>
              <h3>Sicherheit</h3>
              <p>
                Deine Daten werden sicher in Europa verarbeitet und nicht für KI-Training verwendet.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/*
      <section className="testimonials-section" aria-labelledby="testimonials-title">
        <div className="testimonials-container">
          <h2 id="testimonials-title" className="testimonials-title">Was Menschen über den Grünerator sagen</h2>
          <div className="testimonials-grid">
            <div className="testimonial-card">
              <blockquote>
                <p>"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Der Grünerator hat unsere Arbeitsweise revolutioniert."</p>
              </blockquote>
              <div className="testimonial-author">
                <div className="author-avatar">GJ</div>
                <div className="author-info">Grüne Jugend</div>
              </div>
            </div>

            <div className="testimonial-card">
              <blockquote>
                <p>"Lorem ipsum dolor sit amet - dies könnte die nächste Killer-App in der generativen KI sein"</p>
              </blockquote>
              <div className="testimonial-author">
                <div className="author-avatar">BZ</div>
                <div className="author-info">Bündnis Zeitung</div>
              </div>
            </div>

            <div className="testimonial-card">
              <blockquote>
                <p>"Lorem ipsum dolor sit amet, der Grünerator ist ein Blick in die Zukunft der KI am Arbeitsplatz"</p>
              </blockquote>
              <div className="testimonial-author">
                <div className="author-avatar">GZ</div>
                <div className="author-info">Grüne Zeitung</div>
              </div>
            </div>

            <div className="testimonial-card">
              <blockquote>
                <p>"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Es ist eine der überzeugendsten Demonstrationen des KI-Potenzials."</p>
              </blockquote>
              <div className="testimonial-author">
                <div className="author-avatar">PZ</div>
                <div className="author-info">Politik Zeitung</div>
              </div>
            </div>

            <div className="testimonial-card">
              <blockquote>
                <p>"Lorem ipsum dolor sit amet - der Grünerator ist ein wunderschöner Weg durch den Informationsraum"</p>
              </blockquote>
              <div className="testimonial-author">
                <div className="author-avatar">TK</div>
                <div className="author-info">Tech Kompass</div>
              </div>
            </div>

            <div className="testimonial-card">
              <blockquote>
                <p>"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Möglicherweise berührt der Grünerator ein völlig neues Territorium überzeugender KI-Produktformate."</p>
              </blockquote>
              <div className="testimonial-author">
                <div className="author-avatar">DI</div>
                <div className="author-info">Digital Innovator</div>
              </div>
            </div>
          </div>
        </div>
      </section>
      */}
    </main>
  );
};

export default Home;
