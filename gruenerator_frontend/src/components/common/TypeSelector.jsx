import React from 'react';
import PropTypes from 'prop-types';
import FormSelect from './Form/Input/FormSelect';

const TypeSelector = ({ 
  types, 
  typeLabels, 
  selectedType, 
  onTypeChange, 
  label = "Typ auswählen",
  name = "type",
  required = true,
  marginBottom = 'var(--spacing-large)'
}) => {
  const typeOptions = Object.entries(typeLabels).map(([value, label]) => ({
    value,
    label
  }));

  return (
    <div style={{ marginBottom }}>
      <FormSelect
        key={selectedType}
        name={name}
        label={label}
        options={typeOptions}
        defaultValue={selectedType}
        onChange={(e) => {
          onTypeChange(e.target.value);
        }}
        required={required}
      />
    </div>
  );
};

TypeSelector.propTypes = {
  types: PropTypes.object.isRequired,
  typeLabels: PropTypes.object.isRequired,
  selectedType: PropTypes.string.isRequired,
  onTypeChange: PropTypes.func.isRequired,
  label: PropTypes.string,
  name: PropTypes.string,
  required: PropTypes.bool,
  marginBottom: PropTypes.string
};

export default TypeSelector;