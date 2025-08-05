import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { TypeAnimation } from 'react-type-animation';
import { getIcon } from '../../config/icons';
import Icon from '../common/Icon';

const Home = () => {
  const email = 'info' + '@' + 'moritz-waechter.de';
  const [showMore, setShowMore] = useState(false);

  // Icon-Komponenten für bessere JSX-Lesbarkeit
  const PresseIcon = getIcon('navigation', 'presse-social');
  const AntragIcon = getIcon('navigation', 'antrag');
  const UniversalIcon = getIcon('navigation', 'universal');
  const GrueneJugendIcon = getIcon('navigation', 'gruene-jugend');
  const ReelIcon = getIcon('navigation', 'reel');
  const SucheIcon = getIcon('navigation', 'suche');

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
        <p>Mit dem Grünerator kannst du schnell und kostenlos einen Vorschlag für Grüne Inhalte deiner Wahl erhalten. Deine Eingaben werden sicher in Europa verarbeitet.</p>
        <div className="link-buttons-container">
          <div className="link-buttons primary-buttons">
            <Link to="/presse-social" aria-label="Zum Presse & Social Media Generator"><PresseIcon /> Presse & Social Media</Link>
            <Link to="/antrag" aria-label="Zu Anträge & Anfragen Generator"><AntragIcon /> Anträge & Anfragen</Link>
            <button 
              onClick={() => setShowMore(!showMore)} 
              className={`more-button ${showMore ? 'active' : ''}`}
              aria-expanded={showMore}
              aria-label="Weitere Grüneratoren anzeigen"
            >
              <Icon category="ui" name="caretDown" /> Mehr
            </button>
            <a href="https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="newsletter-button desktop-only"
              aria-label="Zum Newsletter anmelden">
              Newsletter <Icon category="actions" name="arrowRight" />
            </a>
          </div>
          <div className={`link-buttons secondary-buttons ${showMore ? 'show' : ''}`}>
            <Link to="/universal" aria-label="Zum Universal Grünerator"><UniversalIcon /> Universal</Link>
            <Link to="/gruene-jugend" aria-label="Zum Grüne Jugend Grünerator"><GrueneJugendIcon /> Grüne Jugend</Link>
            <Link to="/reel" aria-label="Zum Reel Grünerator"><ReelIcon /> Reel</Link>
            <Link to="/suche" aria-label="Zur Suche"><SucheIcon /> Suche</Link>
          </div>
          <a href="https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="newsletter-button mobile-only"
            aria-label="Zum Newsletter anmelden">
            Newsletter <Icon category="actions" name="arrowRight" />
          </a>
        </div>
      </section>
      <section className="sections-container" aria-labelledby="about-gruenerator">
        <h2 id="about-gruenerator" className="sr-only">Über den Grünerator</h2>
        
        <section className="section" aria-labelledby="how-it-works">
          <div className="text-column">
            <h3 id="how-it-works">So funktionierts</h3>
            <p>Der Grünerator sammelt die von dir eingegebenen Daten und schickt sie an eine KI, die die Daten anhand vorgegebener Parameter bearbeitet. Das Ergebnis ist ein Vorschlag, den du weiter bearbeiten kannst.</p>
          </div>
          <div className="image-column">
            <img src="/images/undraw_brainstorming_re_1lmw.svg" alt="Illustration: Brainstorming und Ideenfindung" loading="lazy" />
          </div>
        </section>

        <section className="section" aria-labelledby="about-creator">
          <div className="text-column">
            <h3 id="about-creator">Wer dahinter steckt</h3>
            <p>Der Grünerator ist kein Produkt der Partei, sondern ein Freizeit-Projekt von mir, Moritz Wächter. Ich bin Student und seit fast zehn Jahren Ehrenamtler bei den Grünen. Mehr über mich findest Du auf meiner Website oder bei Twitter.</p>
          </div>
          <div className="image-column">
            <img src="/images/IMG_9658.jpg" alt="Foto von Moritz Wächter, dem Entwickler des Grünerators" loading="lazy" />
          </div>
        </section>

        <section className="section" aria-labelledby="newsletter-section">
          <div className="text-column">
            <h3 id="newsletter-section">Newsletter</h3>
            <p>Bleib informiert und melde dich für das <a href="https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW" target="_blank" rel="noopener noreferrer">Grünerator Fax</a> an, um keine Updates zu verpassen.</p>
          </div>
          <div className="image-column">
            <img src="/images/undraw_online_banking_re_kwqh.svg" alt="Illustration: Newsletter und Updates" loading="lazy" />
          </div>
        </section>

        <section className="section" aria-labelledby="feedback-section">
          <div className="text-column">
            <h3 id="feedback-section">Ideen und Anregungen</h3>
            <p>Du hast Ideen, wie man dieses Projekt verbessern kann? Schreib mir, zum Beispiel per E-Mail an {email}.</p>
          </div>
          <div className="image-column">
            <img src="/images/undraw_chat_bot_re_e2gj.svg" alt="Illustration: Feedback und Kommunikation" loading="lazy" />
          </div>
        </section>
      </section>
    </main>
  );
};

export default Home;
