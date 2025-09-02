import React from 'react';
import PropTypes from 'prop-types';
import TypeSelector from '../../../../components/common/TypeSelector';

export const TEXT_TYPES = {
  REDE: 'rede',
  WAHLPROGRAMM: 'wahlprogramm',
  BUERGERANFRAGEN: 'buergeranfragen',
  UNIVERSAL: 'universal'
};

export const TEXT_TYPE_LABELS = {
  [TEXT_TYPES.REDE]: 'Rede',
  [TEXT_TYPES.WAHLPROGRAMM]: 'Wahlprogramm',
  [TEXT_TYPES.BUERGERANFRAGEN]: 'Bürger*innenanfragen',
  [TEXT_TYPES.UNIVERSAL]: 'Universal'
};

export const TEXT_TYPE_TITLES = {
  [TEXT_TYPES.REDE]: 'Grünerator für Reden',
  [TEXT_TYPES.WAHLPROGRAMM]: 'Grünerator für Wahlprogramm-Kapitel',
  [TEXT_TYPES.BUERGERANFRAGEN]: 'Grünerator für Bürger*innenanfragen',
  [TEXT_TYPES.UNIVERSAL]: 'Universal Grünerator'
};

const TextTypeSelector = ({ selectedType, onTypeChange }) => {
  return (
    <TypeSelector
      types={TEXT_TYPES}
      typeLabels={TEXT_TYPE_LABELS}
      selectedType={selectedType}
      onTypeChange={onTypeChange}
      label="Art des Textes"
      name="textType"
      required={true}
    />
  );
};

TextTypeSelector.propTypes = {
  selectedType: PropTypes.oneOf(Object.values(TEXT_TYPES)).isRequired,
  onTypeChange: PropTypes.func.isRequired
};

export default TextTypeSelector; 