import React from 'react';
import { Link } from 'react-router-dom';
import { PiNewspaper, PiInstagramLogo, PiFileText, PiMicrophone, PiLightbulb, PiBook } from 'react-icons/pi';

const Home = () => {
  const email = 'info' + '@' + 'moritz-waechter.de';

  return (
    <div>
      <div className="top-section">
        <div className="home-container">
          <div className="home-header">
            <h1>Willkommen beim Grünerator - Dein Assistent für grüne Politik!</h1>
            <p> Mit dem Grünerator kannst du schnell und kostenlos einen Vorschlag für Grüne Inhalte deiner Wahl erhalten. Alle Eingaben werden von Anthropic verarbeitet. Bitte gib daher keine obsoleten privaten Daten ein.</p>
          </div>
          <div className="links-container">
            <div className="home-links">
              <div className="link-section">
                <h3>Wähle deinen Grünerator</h3>
                <div className="link-buttons">
                  <Link to="/antrag" aria-label="Zum Antragsgenerator"><PiFileText /> Antrag schreiben</Link>
                  <Link to="/rede" aria-label="Zum Redengenerator"><PiMicrophone /> Rede Schreiben</Link>
                  <Link to="/pressemitteilung" aria-label="Zur Pressemitteilung erstellen"><PiNewspaper /> Pressemitteilung erstellen</Link>
                  <Link to="/socialmedia" aria-label="Zum Social-Media-Generator"><PiInstagramLogo /> Social-Media-Post schreiben</Link>
                  <Link to="/antragscheck" aria-label="Zum Antragscheck"><PiLightbulb /> Antrag checken</Link>
                  <Link to="/wahlprogramm" aria-label="Zum Wahlprogramm-Generator"><PiBook /> Wahlprogramm erstellen</Link>
                </div>
              </div>
            </div>
          </div>
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
