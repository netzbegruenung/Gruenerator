import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PiNewspaper, PiFileText, PiArrowRight, PiCaretDown, PiMagicWand, PiMagnifyingGlass /* , PiVideoCamera */ } from 'react-icons/pi';
import { GiHedgehog } from 'react-icons/gi';
import { TypeAnimation } from 'react-type-animation';

const Home = () => {
  const email = 'info' + '@' + 'moritz-waechter.de';
  const [showMore, setShowMore] = useState(false);

  return (
    <div>
      <div className="top-section">
        <div className="animated-heading">
          <TypeAnimation
            sequence={[
              'Pressemitteilung?',
              5000,
              'Social-Media-Post?',
              5000,
              'Antrag für den Rat?',
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
          />
          <h2>Dafür gibt&apos;s den Grünerator.</h2>
        </div>
        <p>Mit dem Grünerator kannst du schnell und kostenlos einen Vorschlag für Grüne Inhalte deiner Wahl erhalten. Alle Eingaben werden von Anthropic verarbeitet. Bitte gib daher keine privaten Daten ein.</p>
        <div className="link-buttons-container">
          <div className="link-buttons primary-buttons">
            <Link to="/presse-social" aria-label="Zum Presse & Social Media Generator"><PiNewspaper /> Presse & Social Media</Link>
            <Link to="/antrag" aria-label="Zum Antragsgenerator"><PiFileText /> Antrag</Link>
            <button 
              onClick={() => setShowMore(!showMore)} 
              className={`more-button ${showMore ? 'active' : ''}`}
              aria-expanded={showMore}
              aria-label="Weitere Grüneratoren anzeigen"
            >
              <PiCaretDown /> Mehr
            </button>
            <a href="https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="newsletter-button desktop-only"
              aria-label="Zum Newsletter anmelden">
              Newsletter <PiArrowRight />
            </a>
          </div>
          <div className={`link-buttons secondary-buttons ${showMore ? 'show' : ''}`}>
            <Link to="/universal" aria-label="Zum Universal Grünerator"><PiMagicWand /> Universal</Link>
            <Link to="/gruene-jugend" aria-label="Zum Grüne Jugend Grünerator"><GiHedgehog /> Grüne Jugend</Link>
            {/* Temporär ausgeblendet - wird später wieder aktiviert
            <Link to="/reel" aria-label="Zum Reel Grünerator"><PiVideoCamera /> Reel</Link>
            */}
            <Link to="/suche" aria-label="Zur Suche"><PiMagnifyingGlass /> Suche</Link>
          </div>
          <a href="https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="newsletter-button mobile-only"
            aria-label="Zum Newsletter anmelden">
            Newsletter <PiArrowRight />
          </a>
        </div>
      </div>
      <div className="sections-container">
  <div className="section">
    <div className="text-column">
      <h2>So funktionierts</h2>
      <p>Der Grünerator sammelt die von dir eingegebenen Daten und schickt sie an eine KI, die die Daten anhand vorgegebener Parameter bearbeitet. Das Ergebnis ist ein Vorschlag, den du weiter bearbeiten kannst.</p>
    </div>
    <div className="image-column">
      <img src="/images/undraw_brainstorming_re_1lmw.svg" alt="So funktionierts" loading="lazy" />
    </div>
  </div>

  <div className="section">
    <div className="text-column">
      <h2>Wer dahinter steckt</h2>
      <p>Der Grünerator ist kein Produkt der Partei, sondern ein Freizeit-Projekt von mir, Moritz Wächter. Ich bin Student und seit fast zehn Jahren Ehrenamtler bei den Grünen. Mehr über mich findest Du auf meiner Website oder bei Twitter.</p>
    </div>
    <div className="image-column">
      <img src="/images/IMG_9658.jpg" alt="Wer dahinter steckt" loading="lazy" />
    </div>
  </div>

  <div className="section">
    <div className="text-column">
      <h2>Newsletter</h2>
      <p>Bleib informiert und melde dich für das <a href="https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW" target="_blank" rel="noopener noreferrer">Grünerator Fax</a> an, um keine Updates zu verpassen.</p>
    </div>
    <div className="image-column">
      <img src="/images/undraw_online_banking_re_kwqh.svg" alt="Finanzierung" loading="lazy" />
    </div>
  </div>

  <div className="section">
    <div className="text-column">
      <h2>Ideen und Anregungen</h2>
      <p>Du hast Ideen, wie man dieses Projekt verbessern kann? Schreib mir, zum Beispiel per E-Mail an {email}.</p>
    </div>
    <div className="image-column">
      <img src="/images/undraw_chat_bot_re_e2gj.svg" alt="Ideen und Anregungen" loading="lazy" />
    </div>
  </div>
</div>
    </div>
  );
};

export default Home;
