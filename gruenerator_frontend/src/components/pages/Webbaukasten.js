import React from 'react';
import { PiArrowDown, PiCaretRight } from 'react-icons/pi';
import '../../assets/styles/common/variables.css';
import '../../assets/styles/common/global.css';
import '../../assets/styles/components/button.css';
import '../../assets/styles/pages/Startseitenstyle.css';

const Webbaukasten = () => {
  return (
    <div className="webbaukasten-container">
    <div className="top-section hero-section">
      <div className="text-column">
        <h2>Erstelle deine Grüne Kandidat*innenseite. So einfach wie Canva.</h2>
        <p>Mit dem Grünerator Webbaukasten kannst du dir deine eigene Personenseite im Grünen Design erstellen. Kostenlos. <strong>Achtung, Testphase!</strong></p>
        <div className="buttons">
          <a href="https://person.webbegruenung.de" className="button">
            Demo<PiCaretRight size={22} weight="bold" />
          </a>
          <a href="/downloads/muster.txt" className="button">
            Download <PiArrowDown  size={22
            } weight="bold" />
          </a>
        </div>
      </div>
      <div className="image-column">
        <img src="images/webbaukasten_mockup.png" alt="Webbaukasten Mockup" className="responsive-image" />
      </div>
    </div>

      <div className="sections-container">
        <div className="section">
          <div className="text-column">
            <h2>Mit der Power von Open Source Software</h2>
            <p>Der Grünerator Webdesigner basiert auf den kostenfreien Open-Source Angeboten Wordpress und Elementor. Grundkenntnisse in Wordpress sind erforderlich - mehr nicht.</p>
          </div>
          <div className="image-column">
            <img src="images/elementor_wordpress.svg" alt="WordPress und Elementor" className="responsive-image" />
          </div>
        </div>

        <div className="section">
          <div className="text-column">
            <h2>Für dich angepasst</h2>
            <p>Die Grünerator-Seiten sind speziell für die Bedürfnisse Grüner Kandidierender und Mandatsträger*innen ausgelegt. Sie sind alles, was du für erfolgreiche Grüne Politik brauchst.</p>
          </div>
          <div className="image-column">
            <img src="images/bildschirmfoto_themen.png" alt="Angepasste Seiten" className="responsive-image" />
          </div>
        </div>

        <div className="section">
          <div className="text-column">
            <h2>Wie Canva für Webseiten. Beliebig erweiterbar.</h2>
            <p>Dank WordPress und Elementor als Grundlage ist deine Grünerator-Seite äußerst flexibel und technisch erweiterbar. Mit dem Baukasten-System hast du die volle Kontrolle über die technische Gestaltung deiner Online-Präsenz und kannst unkompliziert neue Funktionen und Inhalte hinzufügen, die perfekt zu deinen Bedürfnissen passen.</p>
          </div>
          <div className="image-column">
            <img src="images/undraw_brainstorming_re_1lmw.svg" alt="Flexible Gestaltung" className="responsive-image" />
          </div>
        </div>

        <div className="section">
          <div className="text-column">
            <h2>Deine Installationsanleitung</h2>
            <p>Die Grünerator-Seiten sind speziell für die Bedürfnisse Grüner Kandidierender und Mandatsträger*innen ausgelegt. Sie sind alles, was du für erfolgreiche Grüne Politik brauchst.</p>
            <div className="buttons">
              <a href="https://scribehow.com/page/Grunerator_Webbaukasten_installieren__3SkHjEhHSqqkYIDDciilsA" className="button">
                Anleitung <PiCaretRight size={24} weight="bold" />
              </a>
            </div>
          </div>
          <div className="image-column">
            <img src="images/undraw_online_banking_re_kwqh.svg" alt="Installationsanleitung" className="responsive-image" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Webbaukasten;