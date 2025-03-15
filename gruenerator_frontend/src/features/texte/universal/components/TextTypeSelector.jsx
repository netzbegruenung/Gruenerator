import React from 'react';
import PropTypes from 'prop-types';
import '../../../../assets/styles/components/form-select.css';

export const TEXT_TYPES = {
  REDE: 'rede',
  WAHLPROGRAMM: 'wahlprogramm',
  UNIVERSAL: 'universal'
};

export const TEXT_TYPE_LABELS = {
  [TEXT_TYPES.REDE]: 'Rede',
  [TEXT_TYPES.WAHLPROGRAMM]: 'Wahlprogramm',
  [TEXT_TYPES.UNIVERSAL]: 'Universal'
};

export const TEXT_TYPE_TITLES = {
  [TEXT_TYPES.REDE]: 'Grünerator für Reden',
  [TEXT_TYPES.WAHLPROGRAMM]: 'Grünerator für Wahlprogramm-Kapitel',
  [TEXT_TYPES.UNIVERSAL]: 'Universal Grünerator'
};

const TextTypeSelector = ({ selectedType, onTypeChange }) => {
  return (
    <div className="form-group text-type-selector">
      <h3><label htmlFor="textType">Art des Textes</label></h3>
      <div className="select-wrapper">
        <select
          id="textType"
          value={selectedType}
          onChange={(e) => onTypeChange(e.target.value)}
          className="form-control custom-select"
        >
          {Object.entries(TEXT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <span className="select-arrow">▼</span>
      </div>
    </div>
  );
};

TextTypeSelector.propTypes = {
  selectedType: PropTypes.oneOf(Object.values(TEXT_TYPES)).isRequired,
  onTypeChange: PropTypes.func.isRequired
};

export default TextTypeSelector; 