import React from 'react';
import PropTypes from 'prop-types';
import { HiChat } from 'react-icons/hi';
import HelpDisplay from '../../../components/common/HelpDisplay';
import '../../../assets/styles/components/chat/start-page.css';

const StartPage = ({ introHelpContent }) => {
  return (
    <div className="chat-startpage">
      <div className="chat-startpage__hero">
        <div className="chat-startpage__icon">
          <HiChat size={28} />
        </div>
        <div>
          <h2>Willkommen beim Grünerator Chat</h2>
          <p>
            Ich helfe dir beim Erstellen von Texten, Sharepics und Kombinationen aus beiden. Beschreibe kurz, was du brauchst, und ich starte sofort.
          </p>
        </div>
      </div>

      <div className="chat-startpage__features">
        <div className="chat-startpage__feature">
          <h3>Vielfältige Textformate</h3>
          <p>Von Social-Media-Posts über Pressemitteilungen bis zu Anträgen – ich finde den passenden Stil automatisch.</p>
        </div>
        <div className="chat-startpage__feature">
          <h3>Sharepics inklusive</h3>
          <p>Direkt nutzbare Sharepics mit passenden Headlines, Farben und Varianten – inklusive Download.</p>
        </div>
        <div className="chat-startpage__feature">
          <h3>Mehrere Ergebnisse</h3>
          <p>Ich kann mehrere Antworten gleichzeitig liefern, z.&nbsp;B. Textvorschlag und Sharepic auf einen Streich.</p>
        </div>
      </div>

      <div className="chat-startpage__hint">
        <span className="chat-startpage__hint-label">Tipp</span>
        <p>Starte z.&nbsp;B. mit: „Schreibe einen Instagram-Post über Solarenergie“</p>
      </div>
    </div>
  );
};

StartPage.propTypes = {
  introHelpContent: PropTypes.shape({
    content: PropTypes.string,
    tips: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.node]))
  })
};

StartPage.defaultProps = {
  introHelpContent: null
};

export default StartPage;
