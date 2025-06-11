import React from 'react';
import PropTypes from 'prop-types';
import FormSelect from '../../../../components/common/Form/Input/FormSelect';

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
  const textTypeOptions = Object.entries(TEXT_TYPE_LABELS).map(([value, label]) => ({
    value,
    label
  }));

  return (
    <div style={{ marginBottom: 'var(--spacing-large)' }}>
      <FormSelect
        name="textType"
        label="Art des Textes"
        options={textTypeOptions}
        value={selectedType}
        onChange={(e) => onTypeChange(e.target.value)}
        required
      />
    </div>
  );
};

TextTypeSelector.propTypes = {
  selectedType: PropTypes.oneOf(Object.values(TEXT_TYPES)).isRequired,
  onTypeChange: PropTypes.func.isRequired
};

export default TextTypeSelector; 