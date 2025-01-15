import React from 'react';
import PropTypes from 'prop-types';
import { SHAREPIC_TYPES } from '../../../../components/utils/constants';
import '../../../../assets/styles/components/sharepic-type-selector.css';

const SharepicTypeSelector = ({ onTypeSelect }) => {
  return (
    <div className="type-selector-screen">
      <div className="type-selector-content">
        <h1>Wähle dein Sharepic-Format</h1>
        <p className="type-selector-intro">
          Jedes Format ist für einen bestimmten Zweck optimiert.
        </p>
        
        <div className="type-options-grid">
          <div className="type-card" onClick={() => onTypeSelect(SHAREPIC_TYPES.THREE_LINES)}>
            <div className="type-icon">📝</div>
            <h3>Dreizeilen</h3>
            <p>Perfekt für kurze, prägnante Botschaften in drei Zeilen. Ideal für Forderungen oder Statements.</p>
            <button className="select-button">Auswählen</button>
          </div>

          <div className="type-card" onClick={() => onTypeSelect(SHAREPIC_TYPES.QUOTE)}>
            <div className="type-icon">💬</div>
            <h3>Zitat</h3>
            <p>Gestalte eindrucksvolle Zitate mit Quellenangabe. Optimal für Aussagen und Stellungnahmen.</p>
            <button className="select-button">Auswählen</button>
          </div>
        </div>
      </div>
    </div>
  );
};

SharepicTypeSelector.propTypes = {
  onTypeSelect: PropTypes.func.isRequired
};

export default SharepicTypeSelector; 